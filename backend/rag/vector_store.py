import os
import uuid
import logging
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client import models

load_dotenv()

logger = logging.getLogger("astra.rag.vector_store")

DEFAULT_QDRANT_PATH = os.getenv("QDRANT_PATH", os.path.join(os.path.dirname(__file__), "..", "qdrant_db"))
DEFAULT_COLLECTION_NAME = "astra_knowledge"
DEFAULT_VECTOR_SIZE = 3072  # Matches verified Gemini gemini-embedding-001 dimension

class QdrantVectorStore:
    def __init__(self, path: Optional[str] = None, collection_name: Optional[str] = None):
        self.path = os.path.abspath(path or DEFAULT_QDRANT_PATH)
        self.collection_name = collection_name or DEFAULT_COLLECTION_NAME
        self._client: Optional[QdrantClient] = None

    def get_client(self) -> QdrantClient:
        """Returns or initializes the persistent local Qdrant client."""
        if self._client is None:
            os.makedirs(self.path, exist_ok=True)
            self._client = QdrantClient(path=self.path)
            logger.info(f"Initialized local persistent Qdrant store at '{self.path}'")
        return self._client

    def ensure_collection(self, vector_size: int = DEFAULT_VECTOR_SIZE) -> None:
        """
        Ensures the target Qdrant collection exists with Cosine distance metric
        and the specified vector dimensionality.
        """
        client = self.get_client()
        collections_response = client.get_collections()
        existing_names = [c.name for c in collections_response.collections]

        if self.collection_name not in existing_names:
            client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=models.Distance.COSINE
                )
            )
            logger.info(
                f"Created Qdrant collection '{self.collection_name}' "
                f"(vector_size={vector_size}, distance=COSINE)."
            )
        else:
            logger.debug(f"Qdrant collection '{self.collection_name}' already exists.")

    def upsert_chunks(
        self,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        original_filename: str = ""
    ) -> int:
        """
        Upserts chunk vectors and payload metadata into Qdrant using deterministic Point IDs.
        
        Args:
            chunks: List of structured chunk dictionaries from chunker.py.
            embeddings: List of matching numeric vector arrays from embeddings.py.
            original_filename: Source document filename for metadata tracking.
            
        Returns:
            Number of points successfully upserted into Qdrant.
        """
        if not chunks or not embeddings:
            raise ValueError("Chunks and embeddings lists cannot be empty.")

        if len(chunks) != len(embeddings):
            raise ValueError(
                f"Mismatch between chunks count ({len(chunks)}) and embeddings count ({len(embeddings)})."
            )

        # Validate vector dimensions
        vector_dim = len(embeddings[0])
        self.ensure_collection(vector_size=vector_dim)

        for idx, emb in enumerate(embeddings):
            if not isinstance(emb, list) or len(emb) != vector_dim:
                raise ValueError(
                    f"Vector at index {idx} has invalid dimension {len(emb) if isinstance(emb, list) else 'non-list'}. Expected {vector_dim}."
                )

        client = self.get_client()
        points: List[models.PointStruct] = []

        for chunk, vector in zip(chunks, embeddings):
            chunk_id = chunk.get("chunk_id")
            if not chunk_id:
                raise ValueError("Chunk missing required 'chunk_id' field.")

            # Generate stable deterministic UUID v5 from chunk_id for idempotent upserts
            point_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk_id))

            payload = {
                "document_id": chunk.get("document_id", ""),
                "original_filename": original_filename or chunk.get("original_filename", ""),
                "chunk_id": chunk_id,
                "chunk_index": chunk.get("chunk_index", 0),
                "text": chunk.get("text", ""),
                "page_start": chunk.get("page_start"),
                "page_end": chunk.get("page_end"),
                "word_count": chunk.get("word_count", 0),
                "character_count": chunk.get("character_count", 0)
            }

            points.append(
                models.PointStruct(
                    id=point_uuid,
                    vector=vector,
                    payload=payload
                )
            )

        client.upsert(
            collection_name=self.collection_name,
            points=points
        )

        logger.info(
            f"Successfully upserted {len(points)} vector points into Qdrant collection '{self.collection_name}'."
        )
        return len(points)

    def search_similar_chunks_with_diagnostics(
        self,
        query_vector: List[float],
        top_k: int = 5,
        score_threshold: Optional[float] = None,
        filter_doc_id: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Queries Qdrant collection for nearest vector points matching query_vector using Cosine similarity.
        Computes safe, structured development diagnostics including candidate counts, score spread,
        threshold cutoff effects, and filtering reasons without logging secrets or raw documents.
        """
        if not query_vector or not isinstance(query_vector, list):
            raise ValueError("query_vector must be a non-empty list of floats.")

        client = self.get_client()

        # Check if collection exists
        collections_response = client.get_collections()
        existing_names = [c.name for c in collections_response.collections]
        if self.collection_name not in existing_names:
            logger.warning(f"Qdrant collection '{self.collection_name}' does not exist.")
            diag = {
                "vector_store": "qdrant",
                "collection": self.collection_name,
                "vector_dimension": DEFAULT_VECTOR_SIZE,
                "total_points_in_collection": 0,
                "candidates_found": 0,
                "retrieved_count": 0,
                "filtered_out_count": 0,
                "score_threshold_applied": score_threshold,
                "top_score": None,
                "lowest_score": None,
                "filtering_reason": "collection_not_found",
                "status": "collection_not_found"
            }
            return [], diag

        total_points = self.count_points()

        # Candidate pool limit: retrieve enough candidates to compute real distribution metrics
        candidate_limit = max(top_k * 3, 10)
        try:
            query_response = client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                limit=candidate_limit,
                score_threshold=None
            )
            scored_points = getattr(query_response, "points", query_response)
        except Exception as e:
            logger.error(f"Error querying Qdrant collection '{self.collection_name}': {e}", exc_info=True)
            diag = {
                "vector_store": "qdrant",
                "collection": self.collection_name,
                "vector_dimension": DEFAULT_VECTOR_SIZE,
                "total_points_in_collection": total_points,
                "candidates_found": 0,
                "retrieved_count": 0,
                "filtered_out_count": 0,
                "score_threshold_applied": score_threshold,
                "top_score": None,
                "lowest_score": None,
                "filtering_reason": f"query_error: {str(e)}",
                "status": "error"
            }
            return [], diag

        all_candidates: List[Dict[str, Any]] = []
        for scored_point in scored_points:
            payload = scored_point.payload or {}
            doc_id = payload.get("document_id", "")
            if filter_doc_id and doc_id != filter_doc_id:
                continue

            all_candidates.append({
                "chunk_id": payload.get("chunk_id", str(scored_point.id)),
                "document_id": doc_id,
                "filename": payload.get("original_filename", ""),
                "text": payload.get("text", ""),
                "page_start": payload.get("page_start"),
                "page_end": payload.get("page_end"),
                "score": float(scored_point.score)
            })

        total_candidates = len(all_candidates)
        scores = [c["score"] for c in all_candidates]
        top_score = round(max(scores), 4) if scores else None
        lowest_score = round(min(scores), 4) if scores else None

        # Apply score_threshold filter
        if score_threshold is not None:
            passed = [c for c in all_candidates if c["score"] >= score_threshold]
        else:
            passed = all_candidates

        filtered_results = passed[:top_k]
        retrieved_count = len(filtered_results)
        filtered_out_count = total_candidates - len(passed)

        if total_points == 0:
            filtering_reason = "empty_collection"
        elif total_candidates == 0:
            filtering_reason = "no_candidates_found"
        elif total_candidates > 0 and len(passed) == 0:
            filtering_reason = "below_score_threshold"
        else:
            filtering_reason = "none"

        diagnostics = {
            "vector_store": "qdrant",
            "collection": self.collection_name,
            "vector_dimension": DEFAULT_VECTOR_SIZE,
            "total_points_in_collection": total_points,
            "candidates_found": total_candidates,
            "retrieved_count": retrieved_count,
            "filtered_out_count": filtered_out_count,
            "score_threshold_applied": score_threshold,
            "top_score": top_score,
            "lowest_score": lowest_score,
            "filtering_reason": filtering_reason,
            "status": "success"
        }

        return filtered_results, diagnostics

    def search_similar_chunks(
        self,
        query_vector: List[float],
        top_k: int = 5,
        score_threshold: Optional[float] = None,
        filter_doc_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Queries Qdrant collection for top_k nearest vector points matching query_vector using Cosine similarity.
        """
        results, _ = self.search_similar_chunks_with_diagnostics(
            query_vector=query_vector,
            top_k=top_k,
            score_threshold=score_threshold,
            filter_doc_id=filter_doc_id
        )
        return results

    def count_points(self) -> int:
        """Returns total vector point count in the collection."""
        client = self.get_client()
        try:
            res = client.count(collection_name=self.collection_name, exact=True)
            return res.count
        except Exception as e:
            logger.warning(f"Could not count points in collection '{self.collection_name}': {e}")
            return 0

    def get_collection_info(self) -> Dict[str, Any]:
        """Returns metadata and status for the Qdrant collection."""
        client = self.get_client()
        try:
            info = client.get_collection(collection_name=self.collection_name)
            return {
                "name": self.collection_name,
                "status": str(info.status),
                "points_count": info.points_count,
                "vector_size": info.config.params.vectors.size,
                "distance_metric": str(info.config.params.vectors.distance)
            }
        except Exception as e:
            return {
                "name": self.collection_name,
                "status": "NOT_FOUND",
                "error": str(e)
            }

    def close(self) -> None:
        """Closes the underlying Qdrant client connection."""
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None

# Singleton vector store instance
vector_store = QdrantVectorStore()

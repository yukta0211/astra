import logging
from typing import List, Dict, Any, Optional, Tuple
from .embeddings import embedding_service
from .vector_store import vector_store

logger = logging.getLogger("astra.rag.retriever")

# Default similarity threshold: Cosine similarity range is -1.0 to 1.0.
# Relevant document matches typically score >= 0.25 on 3072-dim embeddings.
DEFAULT_SIMILARITY_THRESHOLD: float = 0.25

def retrieve_relevant_chunks_with_diagnostics(
    query: str,
    top_k: int = 5,
    score_threshold: Optional[float] = DEFAULT_SIMILARITY_THRESHOLD,
    filter_doc_id: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Performs real semantic vector retrieval for a natural-language query and produces
    structured development diagnostics (total candidates, threshold filtering reasons, score metadata).

    Args:
        query: User input natural language query string.
        top_k: Maximum number of relevant chunks to retrieve (default: 5).
        score_threshold: Minimum cosine similarity score cutoff (default: 0.25).
        filter_doc_id: Optional document ID filter.

    Returns:
        Tuple of (results list, diagnostics dict).
    """
    if not query or not isinstance(query, str) or not query.strip():
        logger.warning("Empty or invalid query provided for semantic retrieval.")
        diag = {
            "query": query or "",
            "vector_store": "qdrant",
            "collection": vector_store.collection_name,
            "total_points_in_collection": 0,
            "candidates_found": 0,
            "retrieved_count": 0,
            "filtered_out_count": 0,
            "score_threshold_applied": score_threshold,
            "top_score": None,
            "lowest_score": None,
            "filtering_reason": "empty_query",
            "status": "empty_query"
        }
        return [], diag

    if top_k <= 0:
        raise ValueError("top_k must be a positive integer greater than 0.")

    clean_query = query.strip()

    # Step 1: Generate real Gemini embedding vector for query
    try:
        query_vector = embedding_service.generate_embedding(clean_query)
    except Exception as e:
        logger.error(f"Failed to generate query embedding for query '{clean_query}': {e}")
        raise e

    # Step 2: Query persistent Qdrant vector store
    try:
        results, diagnostics = vector_store.search_similar_chunks_with_diagnostics(
            query_vector=query_vector,
            top_k=top_k,
            score_threshold=score_threshold,
            filter_doc_id=filter_doc_id
        )
    except RuntimeError as re_err:
        if "already accessed by another instance" in str(re_err):
            logger.info("Local Qdrant locked by server process; delegating retrieval via HTTP API.")
            import requests
            try:
                resp = requests.post(
                    "http://localhost:8000/api/knowledge/search",
                    json={
                        "query": clean_query,
                        "top_k": top_k,
                        "score_threshold": score_threshold if score_threshold is not None else 0.0
                    },
                    timeout=30
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    diagnostics = data.get("diagnostics", {
                        "vector_store": "qdrant",
                        "collection": vector_store.collection_name,
                        "candidates_found": len(results),
                        "retrieved_count": len(results),
                        "filtered_out_count": 0,
                        "score_threshold_applied": score_threshold,
                        "top_score": max([r.get("score", 0) for r in results]) if results else None,
                        "lowest_score": min([r.get("score", 0) for r in results]) if results else None,
                        "filtering_reason": "none" if results else "below_score_threshold",
                        "status": "success"
                    })
                else:
                    raise re_err
            except Exception:
                raise re_err
        else:
            raise re_err

    diagnostics["query"] = clean_query

    logger.info(
        f"Semantic retrieval for '{clean_query}': retrieved {len(results)} chunks "
        f"from Qdrant collection '{vector_store.collection_name}' (top_k={top_k}, score_threshold={score_threshold}, reason={diagnostics.get('filtering_reason')})."
    )

    return results, diagnostics

def retrieve_relevant_chunks(
    query: str,
    top_k: int = 5,
    score_threshold: Optional[float] = DEFAULT_SIMILARITY_THRESHOLD,
    filter_doc_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Performs real semantic vector retrieval for a natural-language query.
    Backward-compatible wrapper returning only the results list.
    """
    results, _ = retrieve_relevant_chunks_with_diagnostics(
        query=query,
        top_k=top_k,
        score_threshold=score_threshold,
        filter_doc_id=filter_doc_id
    )
    return results

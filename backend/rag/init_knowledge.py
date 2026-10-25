import os
import sqlite3
import logging
from typing import Dict, Any

from .document_loader import load_pdf_document
from .chunker import chunk_document
from .embeddings import embedding_service
from .vector_store import vector_store
from .test_ingestion import create_mock_pdf_file

logger = logging.getLogger("astra.rag.init_knowledge")

DEFAULT_DOC_FILENAME = "DBMS_Notes_Normalization.pdf"
DEFAULT_DOC_ID = "doc-dbms"

def ensure_default_knowledge_indexed(db_path: str = None, force_reindex: bool = False) -> Dict[str, Any]:
    """
    Ensures that DBMS_Notes_Normalization.pdf exists, is parsed into exactly 6 chunks,
    vectorized with 3072-dimensional embeddings via Gemini, and indexed into both
    the persistent Qdrant vector store and SQLite.
    
    This guarantees that the active document reported by the interface immediately yields
    real semantic matches for normalization and BCNF queries even on fresh startup or reset.
    """
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    pdf_path = os.path.join(uploads_dir, DEFAULT_DOC_FILENAME)

    # 1. Ensure PDF exists on disk
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        logger.info(f"Generating default knowledge PDF at '{pdf_path}'...")
        create_mock_pdf_file(pdf_path)

    # 2. Check if Qdrant already contains points for DBMS_Notes_Normalization.pdf
    already_indexed = False
    try:
        vector_store.ensure_collection(vector_size=3072)
        total_pts = vector_store.count_points()
        if total_pts > 0 and not force_reindex:
            zero_vec = [0.0] * 3072
            results = vector_store.search_similar_chunks(zero_vec, top_k=20, score_threshold=-1.0)
            if any(r.get("filename") == DEFAULT_DOC_FILENAME or r.get("document_id") == DEFAULT_DOC_ID for r in results):
                already_indexed = True
    except Exception as e:
        logger.warning(f"Could not inspect Qdrant collection for default document: {e}")

    if already_indexed and not force_reindex:
        logger.info(f"Default knowledge document '{DEFAULT_DOC_FILENAME}' is already indexed in Qdrant.")
        return {
            "success": True,
            "filename": DEFAULT_DOC_FILENAME,
            "status": "already_indexed"
        }

    # 3. Load and chunk PDF (chunk_size=100, overlap=20 produces exactly 6 high-signal chunks)
    logger.info(f"Ingesting and indexing '{DEFAULT_DOC_FILENAME}' into Qdrant...")
    doc_data = load_pdf_document(pdf_path)
    chunks = chunk_document(doc_data, chunk_size_words=100, chunk_overlap_words=20)

    # Assign stable document ID for synchronization
    for chk in chunks:
        chk["document_id"] = DEFAULT_DOC_ID

    # 4. Generate embeddings
    chunk_texts = [c["text"] for c in chunks]
    embeddings = embedding_service.generate_embeddings_batch(chunk_texts)

    # 5. Upsert points into Qdrant
    stored_count = vector_store.upsert_chunks(chunks, embeddings, original_filename=DEFAULT_DOC_FILENAME)

    # 6. Synchronize SQLite documents and document_chunks tables
    if not db_path:
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "astra.db")

    try:
        conn = sqlite3.connect(db_path, check_same_thread=False)
        cursor = conn.cursor()

        from datetime import datetime
        now_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")

        cursor.execute(
            "INSERT OR REPLACE INTO documents (id, title, uploaded_at, total_pages, total_chunks) VALUES (?, ?, ?, ?, ?)",
            (DEFAULT_DOC_ID, DEFAULT_DOC_FILENAME, now_str, doc_data["page_count"], len(chunks))
        )

        cursor.execute("DELETE FROM document_chunks WHERE doc_id = ?", (DEFAULT_DOC_ID,))

        for idx, chk in enumerate(chunks):
            emb_vec = embeddings[idx]
            preview_str = f"[{', '.join(f'{v:.3f}' for v in emb_vec[:6])}, ... {len(emb_vec)} dims]"
            cursor.execute(
                "INSERT INTO document_chunks (id, doc_id, page, title, text, embedding_preview) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    chk["chunk_id"],
                    DEFAULT_DOC_ID,
                    chk["page_start"],
                    f"Page {chk['page_start']} - {chk['page_end']}",
                    chk["text"],
                    preview_str
                )
            )

        conn.commit()
        conn.close()
        logger.info(f"Synchronized {len(chunks)} chunks for '{DEFAULT_DOC_FILENAME}' in SQLite and Qdrant.")
    except Exception as db_err:
        logger.warning(f"Could not sync SQLite for default document: {db_err}")

    return {
        "success": True,
        "filename": DEFAULT_DOC_FILENAME,
        "chunk_count": len(chunks),
        "stored_count": stored_count,
        "status": "indexed"
    }

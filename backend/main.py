import sys
import os
import time
import logging

logger = logging.getLogger("astra.main")

sys.path.append(os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from database import init_db, get_db
from time_service import get_system_time_context
from orchestrator import process_user_request, get_latest_db_state
from rag_service import search_rag_chunks, generate_rag_answer
from planner_service import get_current_plan, perform_adaptive_rescheduling, confirm_or_update_exam_date
from action_engine import add_personal_memory_action, add_calendar_event_action, add_task_action

# Initialize Database
init_db()

app = FastAPI(title="ASTRA Study OS API Engine", version="2.0.0")

@app.on_event("startup")
def startup_event():
    try:
        from rag.init_knowledge import ensure_default_knowledge_indexed
        ensure_default_knowledge_indexed()
    except Exception as e:
        logger.warning(f"Could not run default knowledge indexing on startup: {e}")

# Enable CORS for React Frontend (vite default 5173 / localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    query: str
    history: Optional[List[ChatMessage]] = []

class ConfirmExamDateRequest(BaseModel):
    subject: Optional[str] = "DBMS"
    new_date: str
    source: Optional[str] = "Student Confirmation"

class MemoryCreate(BaseModel):
    category: Optional[str] = "General"
    title: str
    content: str
    confidence: Optional[str] = None
    verification_status: Optional[str] = None
    lifecycle_state: Optional[str] = None
    source: Optional[str] = "User Input"

class MemoryUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    lifecycle_state: Optional[str] = None
    verification_status: Optional[str] = None
    source: Optional[str] = None
    expected_last_updated_at: Optional[str] = None

class TaskCreate(BaseModel):
    title: str
    subtext: Optional[str] = "DBMS · 1 hour"
    accent: Optional[str] = "#00f2fe"

class RAGSearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5
    score_threshold: Optional[float] = 0.25

class RAGAskRequest(BaseModel):
    question: str
    top_k: Optional[int] = 5
    score_threshold: Optional[float] = None

@app.get("/api/health")
def health_check():
    # 1. Genuine SQLite Database connectivity check
    db_status = "healthy"
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        db_status = "unhealthy"

    # 2. Genuine Qdrant Vector Store connectivity check
    vector_status = "healthy"
    try:
        from rag.vector_store import vector_store
        client = vector_store.get_client()
        client.get_collections()
    except Exception as e:
        logger.warning(f"Vector store health check degraded: {e}")
        vector_status = "degraded"

    # Overall service status
    if db_status == "healthy" and vector_status == "healthy":
        overall_status = "healthy"
    elif db_status == "healthy":
        overall_status = "degraded"
    else:
        overall_status = "unhealthy"

    return {
        "status": overall_status,
        "system": "ASTRA AI Command Engine",
        "version": "2.0.0",
        "services": {
            "api": "healthy",
            "database": db_status,
            "vector_store": vector_status
        },
        "sync": {
            "status": "synced" if db_status == "healthy" else "pending",
            "state_version": "2.0.0"
        },
        "time": get_system_time_context()
    }

@app.get("/api/time")
def get_time():
    return get_system_time_context()

@app.get("/api/state")
def get_full_state():
    state = get_latest_db_state()
    state["time_context"] = get_system_time_context()
    return state

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    history_dicts = [{"role": m.role, "content": m.content} for m in (req.history or [])]
    return process_user_request(req.query, history_dicts)


# Memory Management Endpoints
@app.get("/api/memories")
def list_memories(
    category: Optional[str] = None,
    lifecycle: Optional[str] = None,
    include_archived: bool = True,
    search: Optional[str] = None
):
    state = get_latest_db_state()
    mems = state.get("memories", [])

    if not include_archived:
        mems = [m for m in mems if m.get("lifecycle_state") != "ARCHIVED"]
    if category and category.lower() != "all":
        mems = [m for m in mems if (m.get("category") or "").lower() == category.lower()]
    if lifecycle and lifecycle.lower() != "all":
        mems = [m for m in mems if (m.get("lifecycle_state") or "").lower() == lifecycle.lower()]
    if search:
        s_lower = search.lower()
        mems = [
            m for m in mems 
            if s_lower in (m.get("title") or "").lower() or s_lower in (m.get("content") or "").lower()
        ]
    return mems

@app.get("/api/memories/metrics")
def get_memory_metrics_info():
    from memory_service import STATUS_METADATA, LIFECYCLE_METADATA
    return {
        "metric_name": "Verification Status",
        "description": (
            "ASTRA Memory Store tracks explicit verification status (Verified, Unverified, Needs Review) "
            "and full lifecycle states (Verified, Unverified, Needs Confirmation, Outdated, Archived). "
            "It decouples capture source from temporal currency."
        ),
        "statuses": STATUS_METADATA,
        "lifecycle_states": LIFECYCLE_METADATA
    }

@app.get("/api/memories/{mem_id}")
def get_single_memory(mem_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (mem_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail=f"Memory '{mem_id}' not found.")
    from memory_service import audit_and_format_memory
    return audit_and_format_memory(dict(row))

@app.post("/api/memories")
def create_memory(mem: MemoryCreate):
    if not mem.title or not mem.title.strip():
        raise HTTPException(status_code=400, detail="Memory title cannot be empty.")
    if not mem.content or not mem.content.strip():
        raise HTTPException(status_code=400, detail="Memory content cannot be empty.")
        
    return add_personal_memory_action(
        mem.category or "General", 
        mem.title.strip(), 
        mem.content.strip(), 
        confidence=mem.confidence, 
        source=mem.source or "User Input",
        verification_status=mem.verification_status or mem.lifecycle_state
    )

@app.put("/api/memories/{mem_id}")
def update_memory(mem_id: str, mem: MemoryUpdate):
    from memory_service import update_memory_record
    try:
        updated = update_memory_record(
            mem_id=mem_id,
            updates=mem.model_dump(exclude_unset=True),
            expected_last_updated_at=mem.expected_last_updated_at
        )
        return {"success": True, "memory": updated}
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except ValueError as ve:
        if "Concurrent update" in str(ve):
            raise HTTPException(status_code=409, detail=str(ve))
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update memory: {str(e)}")

@app.delete("/api/memories/{mem_id}")
def delete_memory(mem_id: str):
    from memory_service import delete_memory_record
    try:
        deleted_snapshot = delete_memory_record(mem_id)
        return {
            "success": True, 
            "deleted_id": mem_id, 
            "deleted_memory": deleted_snapshot,
            "message": f"Memory '{mem_id}' deleted successfully."
        }
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete memory: {str(e)}")

@app.post("/api/memories/{mem_id}/restore")
def restore_memory(mem_id: str, payload: Optional[Dict[str, Any]] = None):
    from memory_service import restore_memory_record
    data = payload or {"id": mem_id}
    if "id" not in data:
        data["id"] = mem_id
    try:
        restored = restore_memory_record(data)
        return {"success": True, "restored_id": mem_id, "memory": restored}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restore memory: {str(e)}")

# Tasks Endpoints
@app.get("/api/tasks")
def list_tasks():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@app.post("/api/tasks")
def create_task(task: TaskCreate):
    return add_task_action(task.title, task.subtext, task.accent)

@app.put("/api/tasks/{task_id}/toggle")
def toggle_task(task_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT completed FROM tasks WHERE id = ?", (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    
    new_val = 0 if row["completed"] else 1
    cursor.execute("UPDATE tasks SET completed = ? WHERE id = ?", (new_val, task_id))
    conn.commit()
    conn.close()
    return {"success": True, "task_id": task_id, "completed": bool(new_val)}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"success": True, "deleted_id": task_id}

# RAG Knowledge Endpoints
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

from rag.document_loader import load_pdf_document
from rag.chunker import chunk_document
from rag.embeddings import embedding_service
from rag.vector_store import vector_store

MAX_FILE_SIZE_MB: int = 25
MAX_FILE_SIZE_BYTES: int = MAX_FILE_SIZE_MB * 1024 * 1024

CURRENT_INDEXING_STATUS = {
    "is_indexing": False,
    "filename": None,
    "stage": None
}

@app.get("/api/knowledge/status")
def get_knowledge_status():
    """
    Returns real-time status of the knowledge base, vector store points,
    and active document indexing state.
    """
    total_points = 0
    try:
        total_points = vector_store.get_total_points()
    except Exception:
        pass

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY rowid DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    doc_info = dict(row) if row else None

    if CURRENT_INDEXING_STATUS.get("is_indexing"):
        status = "indexing_in_progress"
    elif doc_info and doc_info.get("total_pages", 0) > 0 and doc_info.get("total_chunks", 0) == 0:
        status = "no_extractable_text"
    elif total_points == 0 and (not doc_info or doc_info.get("total_chunks", 0) == 0):
        status = "empty_collection"
    else:
        status = "ready"

    return {
        "status": status,
        "is_indexing": CURRENT_INDEXING_STATUS.get("is_indexing", False),
        "indexing_stage": CURRENT_INDEXING_STATUS.get("stage"),
        "total_points": total_points,
        "active_document": doc_info,
        "vector_store": "qdrant",
        "collection": vector_store.collection_name
    }

@app.get("/api/knowledge/config")
def get_knowledge_config():
    """Returns knowledge base configuration and upload constraints."""
    return {
        "max_file_size_bytes": MAX_FILE_SIZE_BYTES,
        "max_file_size_mb": MAX_FILE_SIZE_MB,
        "allowed_extensions": [".pdf"],
        "vector_store": "qdrant",
        "collection": vector_store.collection_name
    }

@app.post("/api/knowledge/upload")
async def upload_knowledge_document(file: UploadFile = File(...)):
    """
    Real PDF Ingestion Pipeline:
    1. Validates file presence, .pdf extension, and maximum size limits.
    2. Saves PDF to backend/uploads/.
    3. Extracts pages using pypdf via document_loader.py (validates readable structure).
    4. Chunks document with overlap via chunker.py.
    5. Generates 3072-dim embeddings using Gemini embedding_service.
    6. Stores chunk vectors in persistent local Qdrant collection 'astra_knowledge'.
    7. Syncs SQLite documents database.
    8. Returns structured JSON metrics response confirming indexing.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file was provided for upload.")

    filename = file.filename
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only '.pdf' files are supported.")

    safe_filename = os.path.basename(filename)
    saved_path = os.path.join(UPLOAD_DIR, safe_filename)

    CURRENT_INDEXING_STATUS["is_indexing"] = True
    CURRENT_INDEXING_STATUS["filename"] = filename
    CURRENT_INDEXING_STATUS["stage"] = "uploading"

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="The uploaded PDF file is empty (0 bytes).")

        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_MB}MB (received {len(content) / (1024*1024):.1f}MB)."
            )

        with open(saved_path, "wb") as f:
            f.write(content)
    except HTTPException:
        CURRENT_INDEXING_STATUS["is_indexing"] = False
        CURRENT_INDEXING_STATUS["stage"] = None
        raise
    except Exception as e:
        CURRENT_INDEXING_STATUS["is_indexing"] = False
        CURRENT_INDEXING_STATUS["stage"] = None
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file on server.")

    try:
        CURRENT_INDEXING_STATUS["stage"] = "indexing"
        # Step 1: Load PDF document
        doc_data = load_pdf_document(saved_path)

        # Step 2: Chunk text (granular chunking: 100 words / 20 overlap)
        chunks = chunk_document(doc_data, chunk_size_words=100, chunk_overlap_words=20)
        if not chunks or doc_data.get("total_characters", 0) == 0:
            raise HTTPException(
                status_code=400,
                detail="No extractable text found in PDF. The document may be empty or contain only scanned images without selectable text."
            )

        # Step 3: Extract text for embeddings
        chunk_texts = [c["text"] for c in chunks]

        # Step 4: Generate Gemini embeddings (3072 dims)
        embeddings = embedding_service.generate_embeddings_batch(chunk_texts)

        # Step 5: Upsert vectors into Qdrant
        stored_count = vector_store.upsert_chunks(chunks, embeddings, original_filename=filename)
        if stored_count == 0:
            raise HTTPException(
                status_code=500,
                detail="Vector indexing failed: no chunks could be written to Qdrant vector store."
            )

        # Step 6: Sync SQLite DB for documents & chunks view
        now_str = time.strftime('%Y-%m-%d %I:%M %p')
        try:
            conn = get_db()
            cursor = conn.cursor()
            doc_id = doc_data["document_id"]

            cursor.execute(
                "INSERT OR REPLACE INTO documents (id, title, uploaded_at, total_pages, total_chunks) VALUES (?, ?, ?, ?, ?)",
                (doc_id, filename, now_str, doc_data["page_count"], len(chunks))
            )

            cursor.execute("DELETE FROM document_chunks WHERE doc_id = ?", (doc_id,))

            for idx, chk in enumerate(chunks):
                emb_vec = embeddings[idx]
                preview_str = f"[{', '.join(f'{v:.3f}' for v in emb_vec[:6])}, ... {len(emb_vec)} dims]"
                cursor.execute(
                    "INSERT INTO document_chunks (id, doc_id, page, title, text, embedding_preview) VALUES (?, ?, ?, ?, ?, ?)",
                    (chk["chunk_id"], doc_id, chk["page_start"], f"Page {chk['page_start']} - {chk['page_end']}", chk["text"], preview_str)
                )

            conn.commit()
            conn.close()
        except Exception as db_err:
            logger.warning(f"SQLite document metadata sync error: {db_err}")

        return {
            "success": True,
            "status": "indexed",
            "document_id": doc_data["document_id"],
            "filename": filename,
            "file_size_bytes": len(content),
            "page_count": doc_data["page_count"],
            "chunk_count": len(chunks),
            "embedded_count": len(embeddings),
            "stored_count": stored_count,
            "vector_store": "qdrant",
            "collection": vector_store.collection_name,
            "available_for_search": True,
            "uploaded_at": now_str
        }

    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        # Clean user-facing error without exposing raw SDK stack traces, paths, or keys
        raise HTTPException(status_code=500, detail=f"Could not process PDF document. Error: {str(e)}")
    finally:
        CURRENT_INDEXING_STATUS["is_indexing"] = False
        CURRENT_INDEXING_STATUS["stage"] = None

@app.get("/api/knowledge/document")
def get_document_info():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY rowid DESC LIMIT 1")
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {}
    doc = dict(row)

    cursor.execute("SELECT * FROM document_chunks WHERE doc_id = ?", (doc["id"],))
    chunks = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return {
        "title": doc["title"],
        "uploadedAt": doc["uploaded_at"],
        "totalPages": doc["total_pages"],
        "totalChunks": doc["total_chunks"],
        "chunks": chunks,
        "isRealIngested": True,
        "vectorStore": "qdrant",
        "collection": vector_store.collection_name,
        "available_for_search": True
    }

from rag.retriever import retrieve_relevant_chunks, retrieve_relevant_chunks_with_diagnostics, DEFAULT_SIMILARITY_THRESHOLD

@app.post("/api/knowledge/search")
def search_knowledge(req: RAGSearchRequest):
    """
    Real Semantic Retrieval Endpoint (Step 4B):
    1. Checks if indexing is in progress or document has no extractable text.
    2. Generates 3072-dim query vector using Gemini embedding_service (gemini-embedding-001).
    3. Queries Qdrant collection 'astra_knowledge' with Cosine similarity.
    4. Returns top-k relevant document chunks with real similarity scores, page metadata & structured diagnostics.
    """
    score_threshold = req.score_threshold if req.score_threshold is not None else DEFAULT_SIMILARITY_THRESHOLD

    # State: Indexing in progress
    if CURRENT_INDEXING_STATUS.get("is_indexing"):
        return {
            "success": True,
            "query": req.query or "",
            "results": [],
            "no_match_reason": "indexing_in_progress",
            "diagnostics": {
                "query": req.query or "",
                "vector_store": "qdrant",
                "collection": vector_store.collection_name,
                "total_points_in_collection": 0,
                "candidates_found": 0,
                "retrieved_count": 0,
                "filtered_out_count": 0,
                "score_threshold_applied": score_threshold,
                "top_score": None,
                "lowest_score": None,
                "filtering_reason": "indexing_in_progress",
                "status": "indexing_in_progress",
                "message": f"Document '{CURRENT_INDEXING_STATUS.get('filename', 'Notes')}' is currently being indexed."
            }
        }

    # State: Document has no extractable text
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT total_pages, total_chunks FROM documents ORDER BY rowid DESC LIMIT 1")
        doc_row = cursor.fetchone()
        conn.close()
        if doc_row and doc_row["total_pages"] > 0 and doc_row["total_chunks"] == 0:
            return {
                "success": True,
                "query": req.query or "",
                "results": [],
                "no_match_reason": "no_extractable_text",
                "diagnostics": {
                    "query": req.query or "",
                    "vector_store": "qdrant",
                    "collection": vector_store.collection_name,
                    "total_points_in_collection": 0,
                    "candidates_found": 0,
                    "retrieved_count": 0,
                    "filtered_out_count": 0,
                    "score_threshold_applied": score_threshold,
                    "top_score": None,
                    "lowest_score": None,
                    "filtering_reason": "no_extractable_text",
                    "status": "no_extractable_text",
                    "message": "The uploaded document contains pages but zero extractable text chunks."
                }
            }
    except Exception as db_e:
        logger.warning(f"Error checking document status in search: {db_e}")

    if not req.query or not req.query.strip():
        return {
            "success": True,
            "query": req.query or "",
            "results": [],
            "no_match_reason": "empty_query",
            "diagnostics": {
                "query": "",
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
        }

    try:
        top_k = req.top_k if req.top_k and req.top_k > 0 else 5
        results, diagnostics = retrieve_relevant_chunks_with_diagnostics(
            query=req.query,
            top_k=top_k,
            score_threshold=score_threshold
        )

        no_match_reason = None
        if not results:
            if diagnostics.get("total_points_in_collection", 0) == 0 or diagnostics.get("filtering_reason") == "empty_collection":
                no_match_reason = "empty_collection"
            elif diagnostics.get("filtering_reason") == "below_score_threshold":
                no_match_reason = "below_relevance_threshold"
            else:
                no_match_reason = "no_passages_retrieved"
            diagnostics["no_match_reason"] = no_match_reason

        return {
            "success": True,
            "query": req.query,
            "results": results,
            "no_match_reason": no_match_reason,
            "diagnostics": diagnostics
        }
    except Exception as e:
        logger.error(f"Semantic retrieval service failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Semantic retrieval service failed: {str(e)}")

from rag.answer_generator import generate_grounded_answer

@app.post("/api/knowledge/ask")
def ask_knowledge_question(req: RAGAskRequest):
    """
    Real Grounded Knowledge QA Endpoint (Step 4C):
    1. Validates input question string.
    2. Confirms indexing and text extraction state.
    3. Executes real Qdrant vector retrieval for top_k relevant chunks with diagnostics.
    4. If no relevant chunks match, returns clean no-result response immediately with explicit no_match_reason.
    5. Passes retrieved chunks & user question to Gemini provider for grounded answer generation.
    6. If Gemini generation quota is reached, provides grounded synthesis from retrieved passages.
    7. Returns grounded answer, deterministic page citations, sources, and diagnostics.
    """
    if not req.question or not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    question = req.question.strip()
    top_k = req.top_k if req.top_k and req.top_k > 0 else 5
    score_threshold = req.score_threshold if getattr(req, "score_threshold", None) is not None else 0.50

    # 1. State: Indexing in progress
    if CURRENT_INDEXING_STATUS.get("is_indexing"):
        return {
            "success": True,
            "question": question,
            "answer": "I couldn't find relevant information in the uploaded documents to answer that question because indexing is currently in progress.",
            "citations": [],
            "sources": [],
            "is_grounded": False,
            "grounding_status": "unsupported",
            "no_match_reason": "indexing_in_progress",
            "diagnostics": {
                "query": question,
                "vector_store": "qdrant",
                "collection": vector_store.collection_name,
                "total_points_in_collection": 0,
                "candidates_found": 0,
                "retrieved_count": 0,
                "filtered_out_count": 0,
                "score_threshold_applied": score_threshold,
                "top_score": None,
                "lowest_score": None,
                "filtering_reason": "indexing_in_progress",
                "status": "indexing_in_progress",
                "message": f"Document '{CURRENT_INDEXING_STATUS.get('filename', 'Notes')}' has not finished indexing."
            }
        }

    # 2. State: Document contains no extractable text
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT total_pages, total_chunks FROM documents ORDER BY rowid DESC LIMIT 1")
        doc_row = cursor.fetchone()
        conn.close()
        if doc_row and doc_row["total_pages"] > 0 and doc_row["total_chunks"] == 0:
            return {
                "success": True,
                "question": question,
                "answer": "I couldn't find relevant information in the uploaded documents because the document contains no extractable text.",
                "citations": [],
                "sources": [],
                "is_grounded": False,
                "grounding_status": "unsupported",
                "no_match_reason": "no_extractable_text",
                "diagnostics": {
                    "query": question,
                    "vector_store": "qdrant",
                    "collection": vector_store.collection_name,
                    "total_points_in_collection": 0,
                    "candidates_found": 0,
                    "retrieved_count": 0,
                    "filtered_out_count": 0,
                    "score_threshold_applied": score_threshold,
                    "top_score": None,
                    "lowest_score": None,
                    "filtering_reason": "no_extractable_text",
                    "status": "no_extractable_text",
                    "message": "The uploaded document contains pages but zero extractable text chunks."
                }
            }
    except Exception as db_e:
        logger.warning(f"Error checking document status in ask: {db_e}")

    # 3. Real Qdrant vector retrieval with diagnostics
    try:
        chunks, diagnostics = retrieve_relevant_chunks_with_diagnostics(
            question,
            top_k=top_k,
            score_threshold=score_threshold
        )
    except Exception as e:
        logger.error(f"Knowledge retrieval service failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Knowledge retrieval service failed: {str(e)}")

    # 4. Zero results check (skip Gemini LLM call, never fabricate answer!)
    if not chunks:
        filtering_reason = diagnostics.get("filtering_reason", "none")
        total_points = diagnostics.get("total_points_in_collection", 0)

        if total_points == 0 or filtering_reason == "empty_collection":
            no_match_reason = "empty_collection"
        elif filtering_reason == "below_score_threshold":
            no_match_reason = "below_relevance_threshold"
        else:
            no_match_reason = "no_passages_retrieved"

        diagnostics["no_match_reason"] = no_match_reason

        return {
            "success": True,
            "question": question,
            "answer": "I couldn't find relevant information in the uploaded documents to answer that question.",
            "citations": [],
            "sources": [],
            "is_grounded": False,
            "grounding_status": "unsupported",
            "no_match_reason": no_match_reason,
            "diagnostics": diagnostics
        }

    # Build trustworthy citations & sources from retrieved chunks
    from rag.answer_generator import build_trustworthy_citations
    citations, sources = build_trustworthy_citations(chunks)

    # Step 3: Grounded answer generation via Gemini provider
    try:
        res = generate_grounded_answer(question, chunks)
        return {
            "success": True,
            "question": question,
            "answer": res["answer"],
            "citations": res.get("citations", citations),
            "sources": res.get("sources", sources),
            "is_grounded": res.get("is_grounded", True),
            "grounding_status": res.get("grounding_status", "document_grounded"),
            "diagnostics": diagnostics
        }
    except Exception as e:
        from llm.provider import GeminiDailyQuotaExceededError
        if isinstance(e, GeminiDailyQuotaExceededError):
            logger.warning("Gemini daily quota reached during grounded answer generation. Synthesizing grounded answer directly from retrieved passages.")
            primary_chunk = chunks[0]
            p0 = primary_chunk.get("page_start")
            p0_str = f"Page {p0}" if p0 is not None else "Document level"
            fallback_text = f"According to your notes ({primary_chunk.get('filename', 'Notes')}, {p0_str}):\n{primary_chunk.get('text', '')}"
            if len(chunks) > 1:
                p1 = chunks[1].get("page_start")
                p1_str = f"Page {p1}" if p1 is not None else "Document level"
                fallback_text += f"\n\nAdditional context ({p1_str}):\n{chunks[1].get('text', '')}"

            return {
                "success": True,
                "question": question,
                "answer": fallback_text,
                "citations": citations,
                "sources": sources,
                "is_grounded": True,
                "grounding_status": "passage_synthesized",
                "quota_exceeded": True,
                "warning": "Gemini AI text generation daily quota reached. Grounded answer was synthesized directly from your retrieved Qdrant passages.",
                "diagnostics": diagnostics
            }

        logger.error(f"Grounded answer generation failed: {e}")
        return {
            "success": False,
            "error": "The AI answer service is temporarily unavailable. Please try again.",
            "citations": citations,
            "sources": sources,
            "is_grounded": False,
            "grounding_status": "error",
            "diagnostics": diagnostics
        }

# Planner Endpoints
@app.get("/api/planner")
def get_planner():
    return get_current_plan()

@app.post("/api/planner/reschedule")
def reschedule_planner():
    return perform_adaptive_rescheduling()

@app.post("/api/planner/confirm_date")
def confirm_exam_date_endpoint(req: ConfirmExamDateRequest):
    try:
        updated_plan = confirm_or_update_exam_date(
            subject=req.subject or "DBMS",
            new_date_str=req.new_date,
            source=req.source or "Student Confirmation"
        )
        return {
            "success": True,
            "message": f"Successfully confirmed {req.subject or 'DBMS'} exam date.",
            "plan": updated_plan
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to confirm date: {str(e)}")

# Action Engine Endpoints
@app.post("/api/actions/calendar_sync")
def sync_calendar():
    from date_service import audit_exam_memories
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM personal_memories")
    mems = [dict(r) for r in cursor.fetchall()]
    conn.close()

    audit = audit_exam_memories(mems, subject="DBMS")
    if audit["requires_confirmation"]:
        return {
            "success": False,
            "requires_confirmation": True,
            "warning": audit.get("warning_message"),
            "message": f"Calendar sync blocked: Stored exam date is {audit['status_label']}. Please confirm your upcoming exam date before syncing alerts."
        }
    return add_calendar_event_action("DBMS revision", time_str="7:00 PM", duration="19:00 – 21:00", location="Focus session")

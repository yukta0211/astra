import os
import sys
import io
import pytest
import requests
from unittest.mock import patch
from pypdf import PdfWriter

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from main import CURRENT_INDEXING_STATUS, app

BASE_URL = "http://127.0.0.1:8000"

def create_blank_scanned_pdf_bytes() -> bytes:
    """Creates a valid PDF with pages containing zero selectable text characters."""
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=300)
    buffer = io.BytesIO()
    writer.write(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def test_knowledge_status_endpoint():
    """
    Verifies that GET /api/knowledge/status returns real-time knowledge base state:
    collection name, points count, active document, and indexing status.
    """
    res = requests.get(f"{BASE_URL}/api/knowledge/status")
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}: {res.text}"
    data = res.json()
    assert "status" in data
    assert "is_indexing" in data
    assert "total_points" in data
    assert data["vector_store"] == "qdrant"
    assert data["collection"] == "astra_knowledge"

def test_state_1_empty_collection():
    """
    STATE 1: No document passages were retrieved (Empty collection / store).
    Verifies that when zero points match, the system returns explicit empty_collection
    or no_passages_retrieved, with zero citations and is_grounded=False.
    """
    # Test through search endpoint with high threshold and dummy query against non-existent content
    res = requests.post(
        f"{BASE_URL}/api/knowledge/search",
        json={"query": "completely unmatched random query xyz123456789", "score_threshold": 0.99}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["results"] == []
    assert data.get("no_match_reason") in ["below_relevance_threshold", "empty_collection", "no_passages_retrieved"]

    # Verify ask endpoint
    ask_res = requests.post(
        f"{BASE_URL}/api/knowledge/ask",
        json={"question": "completely unmatched random query xyz123456789", "score_threshold": 0.99}
    )
    assert ask_res.status_code == 200
    ask_data = ask_res.json()
    assert len(ask_data["citations"]) == 0
    assert len(ask_data["sources"]) == 0
    assert ask_data["is_grounded"] is False
    assert ask_data["grounding_status"] == "unsupported"
    assert ask_data.get("no_match_reason") in ["below_relevance_threshold", "empty_collection", "no_passages_retrieved"]

def test_state_2_indexing_in_progress():
    """
    STATE 2: The document has not finished indexing.
    When ingestion is active, queries must return 'indexing_in_progress'
    and explain that vectors are still being generated in Qdrant.
    """
    # Simulate active ingestion
    CURRENT_INDEXING_STATUS["is_indexing"] = True
    CURRENT_INDEXING_STATUS["filename"] = "Operating_Systems_Lecture_5.pdf"
    CURRENT_INDEXING_STATUS["stage"] = "indexing"

    try:
        # Search endpoint
        search_res = requests.post(
            f"{BASE_URL}/api/knowledge/search",
            json={"query": "Explain process scheduling and round robin"}
        )
        assert search_res.status_code == 200
        search_data = search_res.json()
        assert search_data["results"] == []
        assert search_data["no_match_reason"] == "indexing_in_progress"
        assert search_data["diagnostics"]["status"] == "indexing_in_progress"
        assert search_data["diagnostics"]["filtering_reason"] == "indexing_in_progress"

        # Ask endpoint
        ask_res = requests.post(
            f"{BASE_URL}/api/knowledge/ask",
            json={"question": "Explain process scheduling and round robin"}
        )
        assert ask_res.status_code == 200
        ask_data = ask_res.json()
        assert ask_data["citations"] == []
        assert ask_data["sources"] == []
        assert ask_data["is_grounded"] is False
        assert ask_data["no_match_reason"] == "indexing_in_progress"
        assert "indexing is currently in progress" in ask_data["answer"].lower()
    finally:
        # Reset indexing status
        CURRENT_INDEXING_STATUS["is_indexing"] = False
        CURRENT_INDEXING_STATUS["filename"] = None
        CURRENT_INDEXING_STATUS["stage"] = None

def test_state_3_document_contains_no_extractable_text():
    """
    STATE 3: The document contains no extractable text.
    1. Upload of an unreadable/scanned PDF without selectable text returns HTTP 400.
    2. When active document in DB has total_pages > 0 and total_chunks == 0,
       query returns 'no_extractable_text' without claiming the request crashed.
    """
    # 1. Upload rejection of scanned blank PDF
    blank_pdf = create_blank_scanned_pdf_bytes()
    upload_res = requests.post(
        f"{BASE_URL}/api/knowledge/upload",
        files={"file": ("scanned_document_no_ocr.pdf", blank_pdf, "application/pdf")}
    )
    assert upload_res.status_code == 400
    assert "No extractable text found in PDF" in upload_res.json().get("detail", "")

    # 2. Simulate document with pages but zero chunks in SQLite
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, total_pages, total_chunks FROM documents ORDER BY rowid DESC LIMIT 1")
    original_doc = cursor.fetchone()

    try:
        cursor.execute(
            "INSERT OR REPLACE INTO documents (id, title, uploaded_at, total_pages, total_chunks) VALUES (?, ?, ?, ?, ?)",
            ("doc_no_text_test", "Scanned_Book_Pages.pdf", "2026-10-22 01:00 PM", 12, 0)
        )
        conn.commit()

        # Query search endpoint
        search_res = requests.post(
            f"{BASE_URL}/api/knowledge/search",
            json={"query": "What is normal form?"}
        )
        assert search_res.status_code == 200
        s_data = search_res.json()
        assert s_data["results"] == []
        assert s_data["no_match_reason"] == "no_extractable_text"
        assert s_data["diagnostics"]["filtering_reason"] == "no_extractable_text"

        # Query ask endpoint
        ask_res = requests.post(
            f"{BASE_URL}/api/knowledge/ask",
            json={"question": "What is normal form?"}
        )
        assert ask_res.status_code == 200
        a_data = ask_res.json()
        assert a_data["citations"] == []
        assert a_data["no_match_reason"] == "no_extractable_text"
        assert "no extractable text" in a_data["answer"].lower()
    finally:
        # Restore original document row
        cursor.execute("DELETE FROM documents WHERE id = 'doc_no_text_test'")
        conn.commit()
        conn.close()

def test_state_4_search_completed_successfully_below_relevance_threshold():
    """
    STATE 4: The search completed successfully but no passages passed the relevance criteria.
    When a user asks about an out-of-scope domain (e.g. baking chocolate fudge cake)
    against real DBMS notes, the search executes cleanly, scans candidates, and reports
    'below_relevance_threshold' with cosine scores and cutoff metrics.
    It must NOT claim document corruption or retrieval service failure.
    """
    query = "How do I bake a double chocolate chip fudge cake with buttercream frosting?"
    res = requests.post(
        f"{BASE_URL}/api/knowledge/search",
        json={"query": query, "top_k": 5, "score_threshold": 0.40}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["results"] == []
    assert data["no_match_reason"] == "below_relevance_threshold"

    diag = data["diagnostics"]
    assert diag["filtering_reason"] == "below_score_threshold"
    assert diag["total_points_in_collection"] >= 6
    assert diag["score_threshold_applied"] == 0.40
    assert diag["candidates_found"] > 0
    assert diag["retrieved_count"] == 0

    # Ask endpoint
    ask_res = requests.post(
        f"{BASE_URL}/api/knowledge/ask",
        json={"question": query, "top_k": 5}
    )
    assert ask_res.status_code == 200
    ask_data = ask_res.json()
    assert ask_data["success"] is True
    assert ask_data["citations"] == []
    assert ask_data["sources"] == []
    assert ask_data["is_grounded"] is False
    assert ask_data["no_match_reason"] == "below_relevance_threshold"

def test_state_5_retrieval_service_failure_does_not_claim_no_info():
    """
    STATE 5: The retrieval service failed.
    When vector store or embedding retrieval raises an exception (e.g. database crash),
    the endpoint returns HTTP 500 with a clear service error detail.
    It must NEVER claim that the document lacks information.
    """
    from fastapi.testclient import TestClient
    client = TestClient(app)

    with patch("main.retrieve_relevant_chunks_with_diagnostics", side_effect=RuntimeError("Qdrant connection dropped")):
        # Search endpoint
        res = client.post("/api/knowledge/search", json={"query": "Explain BCNF"})
        assert res.status_code == 500
        detail = res.json().get("detail", "")
        assert "Semantic retrieval service failed" in detail
        assert "Qdrant connection dropped" in detail
        # Must not claim document lacks information
        assert "does not contain" not in detail.lower()
        assert "no information" not in detail.lower()

        # Ask endpoint
        ask_res = client.post("/api/knowledge/ask", json={"question": "Explain BCNF"})
        assert ask_res.status_code == 500
        ask_detail = ask_res.json().get("detail", "")
        assert "Knowledge retrieval service failed" in ask_detail
        assert "Qdrant connection dropped" in ask_detail
        assert "does not contain" not in ask_detail.lower()
        assert "no information" not in ask_detail.lower()

def test_integrity_never_fabricate_answer_to_fill_empty_response():
    """
    Integrity Requirement:
    Never fabricate an answer to fill an empty response.
    When zero chunks are retrieved, citations must be empty,
    is_grounded must be False, and grounding_status must be 'unsupported'.
    """
    unrelated_question = "What are the rules of underwater ice hockey in Canada?"
    res = requests.post(
        f"{BASE_URL}/api/knowledge/ask",
        json={"question": unrelated_question, "top_k": 3}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["citations"] == []
    assert data["sources"] == []
    assert data["is_grounded"] is False
    assert data["grounding_status"] == "unsupported"
    # Never claim to know the answer when no passages supported it
    assert "ice hockey" not in data["answer"].lower()

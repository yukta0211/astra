import os
import sys
import time
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_answer_generator")

def setup_indexed_document() -> str:
    """Ensures sample_dbms_test_doc.pdf is generated and uploaded via API."""
    from rag.test_ingestion import create_mock_pdf_file
    pdf_path = os.path.abspath("sample_dbms_test_doc.pdf")
    if not os.path.exists(pdf_path):
        pdf_path = create_mock_pdf_file("sample_dbms_test_doc.pdf")
    upload_url = "http://localhost:8000/api/knowledge/upload"
    with open(pdf_path, "rb") as f:
        files = {"file": ("sample_dbms_test_doc.pdf", f, "application/pdf")}
        res = requests.post(upload_url, files=files)

    assert res.status_code == 200, f"Setup upload failed: {res.status_code}"
    return pdf_path

def post_ask_with_retry(url: str, payload: dict, max_retries: int = 4, delay: float = 2.5) -> dict:
    """Helper to handle transient Gemini API 503 spikes gracefully during testing."""
    for attempt in range(max_retries):
        res = requests.post(url, json=payload)
        assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
        data = res.json()
        if data.get("success") is True:
            return data
        elif data.get("error") and "temporarily unavailable" in data["error"]:
            logger.warning(f"Transient Gemini 503 detected on attempt {attempt+1}/{max_retries}. Retrying in {delay}s...")
            time.sleep(delay)
        else:
            return data
    return res.json()

def test_grounded_answer_generation():
    print("==================================================")
    print("RUNNING STEP 4C: GROUNDED ANSWER GENERATION TESTS VIA API")
    print("==================================================")

    setup_indexed_document()
    url = "http://localhost:8000/api/knowledge/ask"

    queries = [
        "What is database normalization?",
        "Explain BCNF.",
        "What is a lossless decomposition?",
        "What is a functional dependency?"
    ]

    for q in queries:
        print(f"\n--- Testing Grounded Answer for: '{q}' ---")
        payload = {"question": q, "top_k": 3}
        data = post_ask_with_retry(url, payload)

        assert data.get("success") is True, f"Response failed after retries: {data}"

        print(f"Answer: {data['answer'][:180]}...")
        print(f"Citations: {data['citations']}")
        print(f"Sources Count: {len(data['sources'])}")

        assert data["answer"] and len(data["answer"]) > 10, "Answer text must be non-empty"
        assert len(data["citations"]) > 0, "Expected non-empty citations list"
        
        first_cite = data["citations"][0]
        assert first_cite["filename"] in ["sample_dbms_test_doc.pdf", "DBMS_Notes_Normalization.pdf"], f"Invalid citation filename: {first_cite['filename']}"
        assert "page_start" in first_cite and "page_end" in first_cite, "Missing page numbers in citation"

    print("\n[API QA TESTS PASS] All grounded answer generation tests passed.")

def test_irrelevant_question_no_results():
    print("\n--- Testing Irrelevant Question (No-Result Behavior) ---")
    url = "http://localhost:8000/api/knowledge/ask"
    question = "How do I bake a chocolate cake?"
    
    res = requests.post(url, json={"question": question, "top_k": 5})
    assert res.status_code == 200
    data = res.json()

    print(f"No-result Answer: {data['answer']}")
    print(f"No-result Citations: {data['citations']}")

    assert data["citations"] == [], "Citations must be empty for zero chunks"
    assert data["sources"] == [], "Sources must be empty for zero chunks"
    assert "couldn't find relevant information" in data["answer"].lower() or "not provide enough information" in data["answer"].lower()
    print("[PASS] Irrelevant question returned clean no-result response without hallucinating.")

def test_grounding_verification():
    print("\n--- Testing Specific Grounding Verification ---")
    url = "http://localhost:8000/api/knowledge/ask"
    question = "According to the uploaded notes, explain BCNF."
    
    data = post_ask_with_retry(url, {"question": question, "top_k": 3})
    assert data.get("success") is True

    print(f"BCNF Answer: {data['answer']}")
    print(f"BCNF Citations: {data['citations']}")

    assert "BCNF" in data["answer"] or "Boyce-Codd" in data["answer"], "Answer must contain BCNF concepts from notes"
    assert any(c["page_start"] == 2 or c["page_end"] == 2 for c in data["citations"]), "BCNF citation must point to Page 2 of notes"
    print("[PASS] BCNF answer correctly grounded in retrieved Page 2 context.")

if __name__ == "__main__":
    test_grounded_answer_generation()
    test_irrelevant_question_no_results()
    test_grounding_verification()

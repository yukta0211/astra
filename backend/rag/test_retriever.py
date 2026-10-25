import os
import sys
import requests
import logging

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.document_loader import load_pdf_document
from rag.chunker import chunk_document, ingest_pdf_and_chunk
from rag.embeddings import embedding_service
from rag.vector_store import vector_store
from rag.retriever import retrieve_relevant_chunks
from rag.test_ingestion import create_mock_pdf_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_retriever")

def setup_indexed_document() -> str:
    """Ensures sample_dbms_test_doc.pdf is generated and indexed via HTTP API upload."""
    pdf_path = os.path.abspath("sample_dbms_test_doc.pdf")
    if not os.path.exists(pdf_path):
        pdf_path = create_mock_pdf_file("sample_dbms_test_doc.pdf")

    logger.info(f"Indexing PDF document via HTTP API: '{pdf_path}'...")
    upload_url = "http://localhost:8000/api/knowledge/upload"
    with open(pdf_path, "rb") as f:
        files = {"file": ("sample_dbms_test_doc.pdf", f, "application/pdf")}
        res = requests.post(upload_url, files=files)
    
    assert res.status_code == 200, f"Setup upload failed with status {res.status_code}"
    data = res.json()
    logger.info(f"Setup complete via API: {data['stored_count']} vector chunks indexed in Qdrant.")
    return pdf_path

def test_semantic_retrieval_queries():
    print("==================================================")
    print("RUNNING STEP 4B: SEMANTIC RETRIEVAL UNIT TESTS")
    print("==================================================")

    setup_indexed_document()

    test_queries = [
        "What is database normalization?",
        "Explain BCNF.",
        "What is a lossless decomposition?",
        "What is a functional dependency?"
    ]

    for q in test_queries:
        print(f"\n--- Querying: '{q}' ---")
        results = retrieve_relevant_chunks(q, top_k=3, score_threshold=0.1)

        assert len(results) > 0, f"Expected results for query '{q}', got 0"
        
        for idx, res in enumerate(results):
            print(f" Result [{idx+1}] score={res['score']:.4f} | Page {res['page_start']}-{res['page_end']} | File: {res['filename']}")
            print(f" Snippet: {res['text'][:120]}...\n")

            assert "chunk_id" in res and res["chunk_id"], "Missing chunk_id"
            assert "document_id" in res, "Missing document_id"
            assert "filename" in res and res["filename"] in ["sample_dbms_test_doc.pdf", "DBMS_Notes_Normalization.pdf"], f"Invalid filename: {res.get('filename')}"
            assert "page_start" in res and isinstance(res["page_start"], int), "Invalid page_start"
            assert "page_end" in res and isinstance(res["page_end"], int), "Invalid page_end"
            assert "score" in res and isinstance(res["score"], float), "Score must be float"
            assert 0.0 <= res["score"] <= 1.0, f"Score out of cosine bounds: {res['score']}"

    print("[UNIT TESTS PASS] All semantic query assertions passed successfully.")

def test_top_k_and_edge_cases():
    print("\n--- Testing top_k and edge cases ---")

    # Edge Case 1: Empty query
    empty_res = retrieve_relevant_chunks("", top_k=5)
    assert empty_res == [], f"Expected empty list for empty query, got {empty_res}"
    print("[PASS] Empty query returned []")

    # Edge Case 2: Irrelevant query with threshold
    irrelevant_res = retrieve_relevant_chunks("recipe for baking standard dark chocolate cake", top_k=5, score_threshold=0.6)
    assert len(irrelevant_res) == 0, f"Expected 0 results for irrelevant query with threshold 0.6, got {len(irrelevant_res)}"
    print("[PASS] Irrelevant query filtered out by threshold")

    # Edge Case 3: top_k=1
    res1 = retrieve_relevant_chunks("What is Boyce-Codd Normal Form?", top_k=1, score_threshold=0.1)
    assert len(res1) <= 1, f"Expected top_k=1 result, got {len(res1)}"
    print(f"[PASS] top_k=1 returned {len(res1)} result.")

    # Edge Case 4: top_k=5
    res5 = retrieve_relevant_chunks("Normalization 1NF 2NF 3NF BCNF MVD", top_k=5, score_threshold=0.1)
    assert len(res5) <= 5, f"Expected top_k=5 results, got {len(res5)}"
    print(f"[PASS] top_k=5 returned {len(res5)} results.")

def test_http_api_search():
    print("\n==================================================")
    print("RUNNING STEP 4B: END-TO-END HTTP SEARCH API TEST")
    print("==================================================")

    url = "http://localhost:8000/api/knowledge/search"
    payload = {
        "query": "What is database normalization?",
        "top_k": 3,
        "score_threshold": 0.1
    }

    print(f"POST {url} with payload: {payload}")
    res = requests.post(url, json=payload)
    print(f"API Response Status Code: {res.status_code}")

    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
    data = res.json()

    print(f"API Response JSON: success={data.get('success')}, query='{data.get('query')}', result_count={len(data.get('results', []))}")

    assert data["success"] is True, "Expected success=True"
    assert data["query"] == payload["query"]
    results = data["results"]
    assert len(results) > 0, "Expected non-empty results array from HTTP API search"

    first_item = results[0]
    assert "chunk_id" in first_item
    assert "text" in first_item and len(first_item["text"]) > 0
    assert "page_start" in first_item
    assert "page_end" in first_item
    assert "score" in first_item and isinstance(first_item["score"], float)

    print(f"[HTTP API TEST PASS] Top result score={first_item['score']:.4f}, text='{first_item['text'][:80]}...'")

if __name__ == "__main__":
    test_semantic_retrieval_queries()
    test_top_k_and_edge_cases()
    test_http_api_search()

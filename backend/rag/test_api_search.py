import requests
import json

def test_api_semantic_search():
    url = "http://localhost:8000/api/knowledge/search"
    
    test_queries = [
        "What is database normalization?",
        "Explain BCNF.",
        "What is a lossless decomposition?",
        "What is a functional dependency?"
    ]

    print("==================================================")
    print("STEP 4B: END-TO-END HTTP SEMANTIC RETRIEVAL TESTS")
    print("==================================================")

    for q in test_queries:
        payload = {"query": q, "top_k": 3, "score_threshold": 0.1}
        print(f"\n--- Testing Query: '{q}' ---")
        res = requests.post(url, json=payload)
        
        assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
        data = res.json()
        
        assert data["success"] is True, "Expected success=True"
        assert data["query"] == q
        results = data["results"]
        
        assert len(results) > 0, f"Expected > 0 results for '{q}', got {len(results)}"
        
        for idx, item in enumerate(results):
            print(f" Result [{idx+1}] Score: {item['score']:.4f} | File: {item['filename']} | Pages {item['page_start']}–{item['page_end']}")
            print(f" Text: {item['text'][:140]}...\n")
            
            assert "chunk_id" in item and item["chunk_id"]
            assert "document_id" in item
            assert "filename" in item and item["filename"] in ["sample_dbms_test_doc.pdf", "DBMS_Notes_Normalization.pdf"]
            assert "page_start" in item and isinstance(item["page_start"], int)
            assert "page_end" in item and isinstance(item["page_end"], int)
            assert "score" in item and isinstance(item["score"], float)

    print("\n--- Testing Top-K & Edge Cases via HTTP API ---")

    # 1. Empty Query
    res = requests.post(url, json={"query": ""})
    assert res.status_code == 200
    assert res.json()["results"] == []
    print("[PASS] Empty query returns []")

    # 2. Irrelevant Query
    res = requests.post(url, json={"query": "recipe for baking standard dark chocolate cake", "score_threshold": 0.6})
    assert res.status_code == 200
    assert len(res.json()["results"]) == 0
    print("[PASS] Irrelevant query filtered out by threshold")

    # 3. top_k=1
    res = requests.post(url, json={"query": "Explain BCNF", "top_k": 1, "score_threshold": 0.1})
    assert res.status_code == 200
    assert len(res.json()["results"]) <= 1
    print("[PASS] top_k=1 returned <= 1 result")

    # 4. top_k=5
    res = requests.post(url, json={"query": "Normalization 1NF 2NF 3NF BCNF MVD", "top_k": 5, "score_threshold": 0.1})
    assert res.status_code == 200
    assert len(res.json()["results"]) <= 5
    print(f"[PASS] top_k=5 returned {len(res.json()['results'])} results")

    print("\n==================================================")
    print("ALL STEP 4B END-TO-END HTTP RETRIEVAL TESTS PASSED!")
    print("==================================================")

if __name__ == "__main__":
    test_api_semantic_search()

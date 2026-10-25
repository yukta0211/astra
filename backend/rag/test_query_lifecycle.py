import pytest
import requests
import time
from typing import Dict, Any

BASE_URL = "http://localhost:8000"

def test_query_lifecycle_success():
    """
    Validates the Success lifecycle state:
    A relevant query returns 200 OK, answer, citations, sources, and diagnostics.
    """
    payload = {
        "question": "explain normalization and BCNF according to my notes",
        "top_k": 3
    }
    res = requests.post(f"{BASE_URL}/api/knowledge/ask", json=payload)
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}: {res.text}"
    
    data = res.json()
    assert data.get("success") is True
    assert "answer" in data and len(data["answer"]) > 0
    assert "citations" in data and len(data["citations"]) > 0
    assert "sources" in data and len(data["sources"]) > 0
    assert "diagnostics" in data
    
    diag = data["diagnostics"]
    assert diag.get("vector_store") == "qdrant"
    assert diag.get("collection") == "astra_knowledge"
    assert diag.get("vector_dimension") == 3072
    assert diag.get("retrieved_count") > 0
    assert diag.get("top_score") is not None and diag.get("top_score") >= 0.50

def test_query_lifecycle_no_matches():
    """
    Validates the No Matches lifecycle state:
    An irrelevant query returns zero citations, zero sources, and clean fallback text.
    """
    payload = {
        "question": "how do I bake a dark chocolate fudge cake with vanilla frosting?",
        "top_k": 3
    }
    res = requests.post(f"{BASE_URL}/api/knowledge/ask", json=payload)
    assert res.status_code == 200
    
    data = res.json()
    assert data.get("success") is True
    assert len(data.get("citations", [])) == 0
    assert len(data.get("sources", [])) == 0
    assert "couldn't find" in data.get("answer", "").lower()
    
    diag = data.get("diagnostics", {})
    assert diag.get("retrieved_count") == 0
    assert diag.get("filtering_reason") in ["below_score_threshold", "none"]

def test_query_lifecycle_empty_query():
    """
    Validates empty query handling:
    Empty string in /api/knowledge/ask returns 400 Bad Request.
    Empty string in /api/knowledge/search returns empty list cleanly.
    """
    res_ask = requests.post(f"{BASE_URL}/api/knowledge/ask", json={"question": "   "})
    assert res_ask.status_code == 400
    assert "Question cannot be empty" in res_ask.json().get("detail", "")

    res_search = requests.post(f"{BASE_URL}/api/knowledge/search", json={"query": ""})
    assert res_search.status_code == 200
    assert res_search.json().get("results") == []

def test_query_lifecycle_rapid_switching():
    """
    Simulates rapid switching between different queries:
    Verifies that sequential queries return results corresponding exactly to the asked question.
    """
    queries = [
        ("Explain BCNF.", ["bcnf", "superkey", "3nf"]),
        ("What is database normalization?", ["normalization", "1nf", "redundancy"]),
        ("What is a functional dependency?", ["functional", "dependency", "determinant"])
    ]
    
    for q, expected_keywords in queries:
        res = requests.post(f"{BASE_URL}/api/knowledge/ask", json={"question": q, "top_k": 3})
        assert res.status_code == 200
        data = res.json()
        assert data.get("question") == q
        
        answer_text = data.get("answer", "").lower()
        has_keyword = any(kw in answer_text for kw in expected_keywords)
        assert has_keyword, f"Expected keywords {expected_keywords} in answer for '{q}', got: {answer_text[:120]}"

def test_query_lifecycle_search_diagnostics():
    """
    Validates search endpoint diagnostics metadata:
    total points in collection, candidates found, scores, and threshold applied.
    """
    res = requests.post(f"{BASE_URL}/api/knowledge/search", json={
        "query": "Explain BCNF.",
        "top_k": 3,
        "score_threshold": 0.25
    })
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["results"]) > 0
    
    diag = data["diagnostics"]
    assert diag["vector_dimension"] == 3072
    assert diag["total_points_in_collection"] >= 6
    assert diag["retrieved_count"] > 0
    assert diag["top_score"] >= 0.60

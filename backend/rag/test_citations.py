import pytest
from typing import List, Dict, Any
from rag.answer_generator import (
    format_page_label,
    build_trustworthy_citations,
    generate_grounded_answer
)

def test_valid_citations_with_single_and_multi_page():
    """Verify citations with known page numbers format correctly without inventing metadata."""
    chunks = [
        {
            "chunk_id": "doc_dbms_chk_0",
            "document_id": "doc_dbms_123",
            "filename": "DBMS_Notes.pdf",
            "page_start": 2,
            "page_end": 2,
            "text": "Normalization is the process of organizing data in a database.",
            "score": 0.895
        },
        {
            "chunk_id": "doc_dbms_chk_1",
            "document_id": "doc_dbms_123",
            "filename": "DBMS_Notes.pdf",
            "page_start": 3,
            "page_end": 4,
            "text": "Boyce-Codd Normal Form (BCNF) requires every determinant to be a candidate key.",
            "score": 0.842
        }
    ]

    citations, sources = build_trustworthy_citations(chunks)

    assert len(citations) == 2
    assert len(sources) == 2

    # First citation: single page
    c1 = citations[0]
    assert c1["citation_id"] == "cite_1"
    assert c1["filename"] == "DBMS_Notes.pdf"
    assert c1["page_start"] == 2
    assert c1["page_end"] == 2
    assert c1["has_page_numbers"] is True
    assert c1["page_label"] == "Page 2"
    assert c1["page_limitation_note"] is None
    assert c1["score"] == 0.895
    assert c1["text"] == "Normalization is the process of organizing data in a database."
    assert c1["chunk_id"] == "doc_dbms_chk_0"

    # Second citation: multi-page span
    c2 = citations[1]
    assert c2["citation_id"] == "cite_2"
    assert c2["filename"] == "DBMS_Notes.pdf"
    assert c2["page_start"] == 3
    assert c2["page_end"] == 4
    assert c2["has_page_numbers"] is True
    assert c2["page_label"] == "Pages 3–4"
    assert c2["score"] == 0.842
    assert "BCNF" in c2["text"]


def test_missing_metadata_does_not_invent_pages():
    """Verify that chunks with missing page numbers retain accurate document-level citations without inventing page 1."""
    chunks = [
        {
            "chunk_id": "doc_txt_chk_0",
            "document_id": "doc_unpaged_456",
            "filename": "Lecture_Notes_Raw.txt",
            "page_start": None,
            "page_end": None,
            "text": "Transaction management ensures ACID properties across execution.",
            "score": 0.765
        }
    ]

    citations, sources = build_trustworthy_citations(chunks)

    assert len(citations) == 1
    c = citations[0]
    assert c["filename"] == "Lecture_Notes_Raw.txt"
    assert c["page_start"] is None, "Must not invent page number when missing"
    assert c["page_end"] is None, "Must not invent page number when missing"
    assert c["has_page_numbers"] is False
    assert c["page_label"] == "Page unavailable (Document level)"
    assert c["page_limitation_note"] is not None
    assert "Document lacks page-level metadata" in c["page_limitation_note"]
    assert c["text"] == "Transaction management ensures ACID properties across execution."


def test_no_matches_not_labeled_as_grounded():
    """Verify that when no relevant passage is retrieved, citations are empty and answer is not grounded."""
    res = generate_grounded_answer(
        question="What is the capital of Mars?",
        retrieved_chunks=[]
    )

    assert res["is_grounded"] is False
    assert res["grounding_status"] == "unsupported"
    assert res["citations"] == []
    assert res["sources"] == []
    assert "couldn't find relevant information" in res["answer"].lower()


def test_multiple_source_passages_from_different_documents():
    """Verify multiple source passages across different documents and pages are preserved with distinct inspection data."""
    chunks = [
        {
            "chunk_id": "doc_a_chk_1",
            "document_id": "doc_a",
            "filename": "Database_Systems.pdf",
            "page_start": 12,
            "page_end": 12,
            "text": "Relational algebra consists of select, project, union, set difference, and cartesian product.",
            "score": 0.881
        },
        {
            "chunk_id": "doc_b_chk_5",
            "document_id": "doc_b",
            "filename": "SQL_Optimization.pdf",
            "page_start": 45,
            "page_end": 46,
            "text": "B-Tree indexes provide logarithmic search, insertion, and deletion times.",
            "score": 0.812
        },
        {
            "chunk_id": "doc_c_chk_0",
            "document_id": "doc_c",
            "filename": "CheatSheet.md",
            "page_start": None,
            "page_end": None,
            "text": "Clustered vs non-clustered index comparison.",
            "score": 0.743
        }
    ]

    citations, sources = build_trustworthy_citations(chunks)

    assert len(citations) == 3
    assert len(sources) == 3

    # Check distinct filenames and page labels
    filenames = [c["filename"] for c in citations]
    assert filenames == ["Database_Systems.pdf", "SQL_Optimization.pdf", "CheatSheet.md"]

    page_labels = [c["page_label"] for c in citations]
    assert page_labels == ["Page 12", "Pages 45–46", "Page unavailable (Document level)"]

    # Verify each citation carries the exact passage text for user inspection
    for idx, c in enumerate(citations):
        assert c["text"] == chunks[idx]["text"]
        assert c["score"] == round(chunks[idx]["score"], 4)
        assert c["chunk_id"] == chunks[idx]["chunk_id"]


def test_deduplication_of_identical_chunks():
    """Verify that duplicate chunks are safely deduplicated to avoid redundant citations."""
    identical_chunk = {
        "chunk_id": "doc_dup_chk_1",
        "document_id": "doc_dup",
        "filename": "Notes.pdf",
        "page_start": 5,
        "page_end": 5,
        "text": "Deduplicated passage content.",
        "score": 0.85
    }

    citations, sources = build_trustworthy_citations([identical_chunk, identical_chunk])
    assert len(citations) == 1
    assert citations[0]["chunk_id"] == "doc_dup_chk_1"


def test_format_page_label_cases():
    """Directly test edge cases of format_page_label helper."""
    # Exact single page
    label, has_p, note = format_page_label(1, 1)
    assert label == "Page 1"
    assert has_p is True
    assert note is None

    # Multi page span
    label, has_p, note = format_page_label(5, 8)
    assert label == "Pages 5–8"
    assert has_p is True
    assert note is None

    # Start page only
    label, has_p, note = format_page_label(4, None)
    assert label == "Page 4"
    assert has_p is True
    assert note is None

    # Missing page metadata
    label, has_p, note = format_page_label(None, None)
    assert label == "Page unavailable (Document level)"
    assert has_p is False
    assert note is not None

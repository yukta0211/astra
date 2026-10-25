import os
import io
import pytest
import requests
from pypdf import PdfWriter

BASE_URL = "http://localhost:8000"

def get_or_create_valid_test_pdf() -> str:
    """Helper to ensure a valid test PDF exists."""
    pdf_path = os.path.abspath("sample_dbms_test_doc.pdf")
    if os.path.exists(pdf_path):
        return pdf_path

    from rag.test_ingestion import create_mock_pdf_file
    return create_mock_pdf_file("sample_dbms_test_doc.pdf")

def create_empty_text_pdf() -> bytes:
    """Creates a valid PDF with pages that contain zero extractable text (e.g., blank or scanned)."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def test_config_endpoint_returns_backend_limits():
    """Verify that /api/knowledge/config returns actual backend limits."""
    res = requests.get(f"{BASE_URL}/api/knowledge/config")
    assert res.status_code == 200
    data = res.json()
    assert data["max_file_size_mb"] == 25
    assert data["max_file_size_bytes"] == 25 * 1024 * 1024
    assert ".pdf" in data["allowed_extensions"]
    assert data["vector_store"] == "qdrant"
    assert data["collection"] == "astra_knowledge"

def test_successful_pdf_upload_and_indexing():
    """Verify valid PDF upload reaches full indexed state with genuine chunk and page counts."""
    pdf_path = get_or_create_valid_test_pdf()
    url = f"{BASE_URL}/api/knowledge/upload"

    with open(pdf_path, "rb") as f:
        files = {"file": ("sample_dbms_test_doc.pdf", f, "application/pdf")}
        res = requests.post(url, files=files)

    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["status"] == "indexed"
    assert data["available_for_search"] is True
    assert data["filename"] == "sample_dbms_test_doc.pdf"
    assert data["page_count"] == 3
    assert data["chunk_count"] > 0
    assert data["embedded_count"] == data["chunk_count"]
    assert data["stored_count"] == data["chunk_count"]
    assert data["vector_store"] == "qdrant"
    assert data["collection"] == "astra_knowledge"

def test_active_document_endpoint_confirms_indexing():
    """Verify /api/knowledge/document accurately reflects real indexed counts."""
    res = requests.get(f"{BASE_URL}/api/knowledge/document")
    assert res.status_code == 200
    doc = res.json()
    assert doc.get("title") == "sample_dbms_test_doc.pdf"
    assert doc.get("totalPages") == 3
    assert doc.get("totalChunks") > 0
    assert doc.get("isRealIngested") is True
    assert doc.get("available_for_search") is True

def test_unsupported_file_extension_rejected():
    """Verify that non-PDF files are rejected with a helpful 400 error."""
    url = f"{BASE_URL}/api/knowledge/upload"
    invalid_files = [
        ("notes.docx", b"PK\x03\x04 fake docx content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("spreadsheet.xlsx", b"fake xlsx", "application/vnd.ms-excel"),
        ("script.py", b"print('hello')", "text/x-python"),
        ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")
    ]

    for fname, content, mime in invalid_files:
        files = {"file": (fname, content, mime)}
        res = requests.post(url, files=files)
        assert res.status_code == 400
        data = res.json()
        assert "Only '.pdf' files are supported" in data["detail"]

def test_empty_pdf_rejected():
    """Verify 0-byte PDF is rejected with an explicit error message."""
    url = f"{BASE_URL}/api/knowledge/upload"
    files = {"file": ("empty_notes.pdf", b"", "application/pdf")}
    res = requests.post(url, files=files)
    assert res.status_code == 400
    data = res.json()
    assert "empty (0 bytes)" in data["detail"].lower()

def test_corrupted_pdf_rejected():
    """Verify corrupted or damaged PDF content is safely rejected without server 500 crash."""
    url = f"{BASE_URL}/api/knowledge/upload"
    corrupted_content = b"%PDF-1.4\n%corrupted\xff\xfe\x00\x01\x02gibberish_non_valid_trailer\n%%EOF"
    files = {"file": ("corrupted_lecture.pdf", corrupted_content, "application/pdf")}
    res = requests.post(url, files=files)
    assert res.status_code == 400
    data = res.json()
    assert "unreadable or corrupted" in data["detail"].lower() or "could not process" in data["detail"].lower()

def test_no_extractable_text_pdf_rejected():
    """Verify PDF with no extractable text is rejected with clear explanation."""
    url = f"{BASE_URL}/api/knowledge/upload"
    blank_pdf = create_empty_text_pdf()
    files = {"file": ("scanned_blank_doc.pdf", blank_pdf, "application/pdf")}
    res = requests.post(url, files=files)
    assert res.status_code == 400
    data = res.json()
    assert "no extractable text" in data["detail"].lower()

def test_file_size_limit_exceeded():
    """Verify files exceeding 25MB limit return 413 Payload Too Large."""
    url = f"{BASE_URL}/api/knowledge/upload"
    # Create a dummy payload slightly larger than 25MB (25MB + 1024 bytes)
    oversized_bytes = b"%PDF-1.4\n" + (b"0" * (25 * 1024 * 1024 + 1024))
    files = {"file": ("giant_notes.pdf", oversized_bytes, "application/pdf")}
    res = requests.post(url, files=files)
    assert res.status_code == 413
    data = res.json()
    assert "exceeds maximum allowed size of 25mb" in data["detail"].lower()

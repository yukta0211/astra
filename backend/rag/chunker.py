import re
import logging
from typing import Dict, List, Any
from .document_loader import load_pdf_document

logger = logging.getLogger("astra.rag.chunker")

def clean_text(text: str) -> str:
    """
    Cleans extracted raw PDF text while preserving meaningful punctuation,
    paragraph boundaries, and mathematical/formula notation.
    Does NOT summarize, paraphrase, or alter the source content.
    """
    if not text:
        return ""

    # Normalize carriage returns
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")

    # Replace tab spaces with single spaces
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    # Normalize excessive blank lines to paragraph breaks (\n\n)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    # Remove trailing space on each line
    lines = [line.strip() for line in cleaned.split("\n")]
    cleaned = "\n".join(lines).strip()

    return cleaned

def chunk_document(
    document: Dict[str, Any],
    chunk_size_words: int = 350,
    chunk_overlap_words: int = 50
) -> List[Dict[str, Any]]:
    """
    Splits document text into deterministic word-based chunks with configured overlap.
    Accurately tracks page_start and page_end for every chunk based on source page boundaries.
    
    Args:
        document: Document dictionary produced by load_pdf_document().
        chunk_size_words: Target word count per chunk (default: 350 words).
        chunk_overlap_words: Overlap word count between consecutive chunks (default: 50 words).
        
    Returns:
        List of structured chunk dictionaries.
    """
    if not document or "pages" not in document:
        raise ValueError("Invalid document structure provided for chunking.")

    if chunk_size_words <= 0:
        raise ValueError("chunk_size_words must be greater than 0.")

    if chunk_overlap_words < 0 or chunk_overlap_words >= chunk_size_words:
        raise ValueError("chunk_overlap_words must be >= 0 and < chunk_size_words.")

    doc_id = document.get("document_id", "doc_unknown")
    pages = document.get("pages", [])

    # Build word sequence tagged with page numbers
    tagged_words: List[Dict[str, Any]] = []

    for page in pages:
        page_num = page.get("page_number")
        page_text = clean_text(page.get("text", ""))

        if not page_text:
            continue

        words = page_text.split()
        for word in words:
            tagged_words.append({
                "word": word,
                "page_number": page_num
            })

    if not tagged_words:
        logger.warning(f"Document '{document.get('original_filename')}' contains no extractable words to chunk.")
        return []

    chunks: List[Dict[str, Any]] = []
    step_size = chunk_size_words - chunk_overlap_words
    total_words = len(tagged_words)
    chunk_index = 0

    start_idx = 0
    while start_idx < total_words:
        end_idx = min(start_idx + chunk_size_words, total_words)
        chunk_tagged_words = tagged_words[start_idx:end_idx]

        chunk_text_words = [tw["word"] for tw in chunk_tagged_words]
        chunk_text = " ".join(chunk_text_words)

        page_start = chunk_tagged_words[0]["page_number"]
        page_end = chunk_tagged_words[-1]["page_number"]

        chunk_id = f"{doc_id}_chk_{chunk_index}"

        chunks.append({
            "chunk_id": chunk_id,
            "document_id": doc_id,
            "chunk_index": chunk_index,
            "text": chunk_text,
            "page_start": page_start,
            "page_end": page_end,
            "word_count": len(chunk_text_words),
            "character_count": len(chunk_text)
        })

        chunk_index += 1

        if end_idx >= total_words:
            break

        start_idx += step_size

    logger.info(
        f"Chunked document '{document.get('original_filename')}': "
        f"{total_words} total words -> {len(chunks)} chunks "
        f"(size={chunk_size_words}, overlap={chunk_overlap_words})."
    )

    return chunks

def ingest_pdf_and_chunk(
    file_path: str,
    chunk_size_words: int = 350,
    chunk_overlap_words: int = 50
) -> Dict[str, Any]:
    """
    End-to-end ingestion pipeline function:
    1. Loads PDF page by page.
    2. Cleans text.
    3. Chunks text with overlap.
    4. Returns complete document metadata and structured chunks.
    """
    doc = load_pdf_document(file_path)
    chunks = chunk_document(doc, chunk_size_words=chunk_size_words, chunk_overlap_words=chunk_overlap_words)

    total_words = sum(c["word_count"] for c in chunks)

    return {
        "document_id": doc["document_id"],
        "original_filename": doc["original_filename"],
        "file_path": doc["file_path"],
        "page_count": doc["page_count"],
        "total_characters": doc["total_characters"],
        "total_words": total_words,
        "chunk_count": len(chunks),
        "chunk_size_words": chunk_size_words,
        "chunk_overlap_words": chunk_overlap_words,
        "chunks": chunks
    }

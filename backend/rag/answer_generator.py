import logging
from typing import List, Dict, Any, Optional, Tuple
from llm.provider import llm_provider

logger = logging.getLogger("astra.rag.answer_generator")

SYSTEM_GROUNDED_PROMPT = """You are ASTRA's document-grounded knowledge assistant.
Your task is to answer the student's question using ONLY the provided retrieved document passages.

STRICT GROUNDING RULES:
1. Treat the retrieved passages as the absolute source of truth.
2. Do not introduce outside facts, general assumptions, or unverified claims not supported by the passages.
3. If the retrieved passages do not contain enough information to reliably answer the question, state explicitly: "The uploaded notes do not provide enough information to answer this question."
4. Do not pretend to have read the full document beyond the provided passages.
5. Preserve technical terminology, formulas, and definitions from the source text.
6. Provide a clear, structured, and student-friendly explanation directly answering the user's question."""

def format_page_label(page_start: Optional[int], page_end: Optional[int]) -> Tuple[str, bool, Optional[str]]:
    """
    Constructs an accurate, trustworthy page label without inventing page numbers.
    Returns:
        (page_label, has_page_numbers, limitation_note)
    """
    if page_start is not None and page_end is not None:
        if page_start == page_end:
            return f"Page {page_start}", True, None
        return f"Pages {page_start}–{page_end}", True, None
    elif page_start is not None:
        return f"Page {page_start}", True, None
    else:
        return "Page unavailable (Document level)", False, "Document lacks page-level metadata; cited at document level."

def build_trustworthy_citations(
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Constructs deterministic, inspectable citations and sources metadata
    strictly referencing the actual retrieved passages returned by retrieval.
    """
    citations: List[Dict[str, Any]] = []
    sources: List[Dict[str, Any]] = []
    seen_chunk_ids = set()

    for idx, chk in enumerate(retrieved_chunks, 1):
        chunk_id = chk.get("chunk_id") or f"chk_{idx}"
        if chunk_id in seen_chunk_ids:
            continue
        seen_chunk_ids.add(chunk_id)

        filename = chk.get("filename") or chk.get("original_filename") or "Document"
        p_start = chk.get("page_start")
        p_end = chk.get("page_end")
        text = chk.get("text", "").strip()
        score = round(float(chk.get("score", 0.0)), 4)
        doc_id = chk.get("document_id", "")

        page_label, has_pages, limitation_note = format_page_label(p_start, p_end)

        citation = {
            "citation_id": f"cite_{idx}",
            "chunk_id": chunk_id,
            "document_id": doc_id,
            "filename": filename,
            "page_start": p_start,
            "page_end": p_end,
            "has_page_numbers": has_pages,
            "page_label": page_label,
            "page_limitation_note": limitation_note,
            "score": score,
            "text": text,
            "character_count": len(text)
        }
        citations.append(citation)

        source = {
            "source_id": f"src_{idx}",
            "chunk_id": chunk_id,
            "document_id": doc_id,
            "score": score,
            "filename": filename,
            "page_start": p_start,
            "page_end": p_end,
            "has_page_numbers": has_pages,
            "page_label": page_label,
            "page_limitation_note": limitation_note,
            "text": text
        }
        sources.append(source)

    return citations, sources

def generate_grounded_answer(
    question: str,
    retrieved_chunks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generates a document-grounded natural language answer using Gemini LLM provider
    and constructs deterministic page-level citation metadata.

    Args:
        question: User natural-language question.
        retrieved_chunks: List of retrieved chunk dictionaries from retriever.py.

    Returns:
        Dict containing answer string, citations list, and sources metadata list.
    """
    if not question or not question.strip():
        raise ValueError("Question string cannot be empty.")

    if not retrieved_chunks:
        return {
            "answer": "I couldn't find relevant information in the uploaded documents to answer that question.",
            "citations": [],
            "sources": [],
            "is_grounded": False,
            "grounding_status": "unsupported"
        }

    # Step 1: Format retrieved context passages
    context_blocks = []
    for idx, chk in enumerate(retrieved_chunks, 1):
        filename = chk.get("filename") or chk.get("original_filename") or "Document"
        p_start = chk.get("page_start")
        p_end = chk.get("page_end")
        page_label, _, _ = format_page_label(p_start, p_end)
        text = chk.get("text", "").strip()

        context_blocks.append(
            f"[Source {idx}]\n"
            f"Filename: {filename}\n"
            f"Location: {page_label}\n"
            f"Passage Content:\n{text}\n"
        )

    formatted_context = "\n--------------------\n".join(context_blocks)

    user_prompt = (
        f"USER QUESTION:\n{question.strip()}\n\n"
        f"RETRIEVED CONTEXT FROM UPLOADED NOTES:\n"
        f"{formatted_context}\n\n"
        f"Please generate a grounded, accurate explanation answering the question based ONLY on the retrieved passages above."
    )

    # Step 2: Call Gemini LLM Provider for grounded answer text
    try:
        raw_answer = llm_provider.generate_grounded_text(
            prompt=user_prompt,
            system_instruction=SYSTEM_GROUNDED_PROMPT
        )
        if not raw_answer:
            raw_answer = "The uploaded notes do not provide enough information to answer this question."
    except Exception as e:
        logger.error(f"Gemini grounded answer generation error: {e}", exc_info=True)
        raise e

    # Step 3: Build deterministic citations and sources metadata from retrieved chunks
    citations, sources = build_trustworthy_citations(retrieved_chunks)

    return {
        "answer": raw_answer,
        "citations": citations,
        "sources": sources,
        "is_grounded": True,
        "grounding_status": "document_grounded"
    }

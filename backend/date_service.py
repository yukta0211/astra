import os
import re
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple
from time_service import get_now, get_tz

MONTHS_MAP = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12
}

def parse_date_string(text: str, reference_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Parses a date from freeform text or structured strings.
    Handles:
    - ISO dates: YYYY-MM-DD
    - Standard text: 'March 21, 2025', 'Friday, March 21, 2025', '21 March 2025', '21st March 2025'
    - Slash/dot dates: '2025/03/21', '21/03/2025', '03/21/2025'
    - Missing year: 'March 21', 'Friday, Oct 24', 'October 24'
    - Invalid dates: 'February 30', 'Invalid Date'
    
    Returns structured dict with is_valid, date_obj, iso_date, missing_year, raw_match, error.
    """
    if not text or not isinstance(text, str):
        return {
            "is_valid": False,
            "date_obj": None,
            "iso_date": None,
            "missing_year": False,
            "raw_match": None,
            "error": "Empty or non-string date input"
        }

    clean_text = text.strip()

    # 1. Check for ISO format: YYYY-MM-DD
    iso_match = re.search(r'\b(20\d\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b', clean_text)
    if iso_match:
        year, month, day = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        try:
            d = date(year, month, day)
            return {
                "is_valid": True,
                "date_obj": d,
                "iso_date": d.isoformat(),
                "missing_year": False,
                "raw_match": iso_match.group(0),
                "error": None
            }
        except ValueError as ve:
            return {
                "is_valid": False,
                "date_obj": None,
                "iso_date": None,
                "missing_year": False,
                "raw_match": iso_match.group(0),
                "error": f"Invalid calendar date: {str(ve)}"
            }

    # 2. Textual formats with year:
    # e.g., 'Friday, March 21, 2025', 'March 21, 2025', '21 March 2025', '21st March 2025'
    month_names_regex = "|".join(MONTHS_MAP.keys())

    # Pattern A: Month Day, Year (e.g. "March 21, 2025", "March 21st, 2025")
    pattern_mdy = re.compile(
        rf'\b({month_names_regex})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:,)?\s+(20\d\d)\b',
        re.IGNORECASE
    )
    m = pattern_mdy.search(clean_text)
    if m:
        month_name = m.group(1).lower()
        day = int(m.group(2))
        year = int(m.group(3))
        month = MONTHS_MAP[month_name]
        try:
            d = date(year, month, day)
            return {
                "is_valid": True,
                "date_obj": d,
                "iso_date": d.isoformat(),
                "missing_year": False,
                "raw_match": m.group(0),
                "error": None
            }
        except ValueError as ve:
            return {
                "is_valid": False,
                "date_obj": None,
                "iso_date": None,
                "missing_year": False,
                "raw_match": m.group(0),
                "error": f"Invalid calendar date: {str(ve)}"
            }

    # Pattern B: Day Month Year (e.g. "21 March 2025", "21st of March 2025")
    pattern_dmy = re.compile(
        rf'\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:\s+of)?\s+({month_names_regex})(?:,)?\s+(20\d\d)\b',
        re.IGNORECASE
    )
    m = pattern_dmy.search(clean_text)
    if m:
        day = int(m.group(1))
        month_name = m.group(2).lower()
        year = int(m.group(3))
        month = MONTHS_MAP[month_name]
        try:
            d = date(year, month, day)
            return {
                "is_valid": True,
                "date_obj": d,
                "iso_date": d.isoformat(),
                "missing_year": False,
                "raw_match": m.group(0),
                "error": None
            }
        except ValueError as ve:
            return {
                "is_valid": False,
                "date_obj": None,
                "iso_date": None,
                "missing_year": False,
                "raw_match": m.group(0),
                "error": f"Invalid calendar date: {str(ve)}"
            }

    # 3. Missing Year patterns:
    # e.g., 'Friday, Oct 24', 'October 24', 'March 21', '24th October'
    # Check if month and day are present without year
    pattern_md_no_year = re.compile(
        rf'\b({month_names_regex})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b',
        re.IGNORECASE
    )
    m_noyear = pattern_md_no_year.search(clean_text)
    if m_noyear:
        month_name = m_noyear.group(1).lower()
        day = int(m_noyear.group(2))
        month = MONTHS_MAP[month_name]
        return {
            "is_valid": False,
            "date_obj": None,
            "iso_date": None,
            "missing_year": True,
            "month": month,
            "day": day,
            "raw_match": m_noyear.group(0),
            "error": f"Missing year in date specification ('{m_noyear.group(0)}')"
        }

    pattern_dm_no_year = re.compile(
        rf'\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:\s+of)?\s+({month_names_regex})\b',
        re.IGNORECASE
    )
    m_dm_noyear = pattern_dm_no_year.search(clean_text)
    if m_dm_noyear:
        day = int(m_dm_noyear.group(1))
        month_name = m_dm_noyear.group(2).lower()
        month = MONTHS_MAP[month_name]
        return {
            "is_valid": False,
            "date_obj": None,
            "iso_date": None,
            "missing_year": True,
            "month": month,
            "day": day,
            "raw_match": m_dm_noyear.group(0),
            "error": f"Missing year in date specification ('{m_dm_noyear.group(0)}')"
        }

    return {
        "is_valid": False,
        "date_obj": None,
        "iso_date": None,
        "missing_year": False,
        "raw_match": None,
        "error": "No recognized date pattern found"
    }

def audit_exam_memories(memories: List[Dict[str, Any]], subject: str = "DBMS", reference_now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Audits stored personal memories for exam dates.
    Detects:
    - Outdated / past dates relative to current local date
    - Missing year or unparseable dates
    - Conflicting dates between different memories for the same subject
    - Valid future exam dates
    
    Preserves original text, sources, memory IDs, and timestamps for full auditability.
    """
    if reference_now is None:
        reference_now = get_now()
    
    local_today = reference_now.date()

    # Filter memories relevant to exams and the subject
    subject_lower = subject.lower()
    exam_memories = []
    
    for m in memories:
        category = m.get("category", "")
        title = m.get("title", "")
        content = m.get("content", "")
        
        is_exam_cat = category.lower() == "exams"
        mentions_exam = "exam" in title.lower() or "exam" in content.lower()
        mentions_subj = subject_lower in title.lower() or subject_lower in content.lower() or is_exam_cat
        
        if (is_exam_cat or mentions_exam) and mentions_subj:
            exam_memories.append(m)

    if not exam_memories:
        return {
            "subject": subject,
            "status": "NO_DATE_SET",
            "status_label": "No Date Set",
            "requires_confirmation": True,
            "audit_level": "info",
            "stored_date_raw": None,
            "stored_date_iso": None,
            "days_diff": None,
            "source": None,
            "memory_id": None,
            "extracted_at": None,
            "has_conflict": False,
            "conflicts": [],
            "missing_year": False,
            "is_valid": False,
            "warning_message": f"No exam date has been recorded for {subject}. Please set your upcoming exam date."
        }

    # Extract dates from matching memories
    found_dates = []
    for m in exam_memories:
        content = m.get("content", "")
        title = m.get("title", "")
        combined = f"{title}. {content}"
        
        parsed = parse_date_string(combined, reference_date=local_today)
        found_dates.append({
            "memory_id": m.get("id"),
            "memory_title": title,
            "memory_content": content,
            "source": m.get("source", "Memory Store"),
            "extracted_at": m.get("date"),
            "parsed": parsed
        })

    # Separate valid parsed dates and invalid/missing year dates
    valid_dates = [d for d in found_dates if d["parsed"]["is_valid"]]
    missing_year_dates = [d for d in found_dates if d["parsed"]["missing_year"]]

    # Check for conflicts: multiple valid dates with different calendar dates
    unique_dates = {}
    for d in valid_dates:
        iso = d["parsed"]["iso_date"]
        if iso not in unique_dates:
            unique_dates[iso] = []
        unique_dates[iso].append(d)

    if len(unique_dates) > 1:
        # CONFLICT DETECTED
        conflict_list = []
        for iso, items in unique_dates.items():
            for item in items:
                conflict_list.append({
                    "date_iso": iso,
                    "raw_text": item["parsed"]["raw_match"],
                    "source": item["source"],
                    "memory_id": item["memory_id"]
                })
        
        primary = valid_dates[0]
        return {
            "subject": subject,
            "status": "NEEDS_CONFIRMATION",
            "status_label": "Needs Confirmation (Conflicting Dates)",
            "requires_confirmation": True,
            "audit_level": "critical",
            "stored_date_raw": primary["parsed"]["raw_match"],
            "stored_date_iso": primary["parsed"]["iso_date"],
            "days_diff": (primary["parsed"]["date_obj"] - local_today).days,
            "source": primary["source"],
            "memory_id": primary["memory_id"],
            "extracted_at": primary["extracted_at"],
            "has_conflict": True,
            "conflicts": conflict_list,
            "missing_year": False,
            "is_valid": True,
            "warning_message": f"Conflicting exam dates detected for {subject} ({', '.join(unique_dates.keys())}). Please confirm which date is correct."
        }

    # If missing year in the only available date
    if not valid_dates and missing_year_dates:
        primary = missing_year_dates[0]
        return {
            "subject": subject,
            "status": "NEEDS_CONFIRMATION",
            "status_label": "Needs Confirmation (Missing Year)",
            "requires_confirmation": True,
            "audit_level": "warning",
            "stored_date_raw": primary["parsed"]["raw_match"],
            "stored_date_iso": None,
            "days_diff": None,
            "source": primary["source"],
            "memory_id": primary["memory_id"],
            "extracted_at": primary["extracted_at"],
            "has_conflict": False,
            "conflicts": [],
            "missing_year": True,
            "is_valid": False,
            "warning_message": f"Stored date '{primary['parsed']['raw_match']}' for {subject} is missing the year. Please confirm the full exam date."
        }

    if not valid_dates:
        primary = found_dates[0]
        return {
            "subject": subject,
            "status": "NEEDS_CONFIRMATION",
            "status_label": "Needs Confirmation (Unparseable Date)",
            "requires_confirmation": True,
            "audit_level": "warning",
            "stored_date_raw": primary["parsed"].get("raw_match"),
            "stored_date_iso": None,
            "days_diff": None,
            "source": primary["source"],
            "memory_id": primary["memory_id"],
            "extracted_at": primary["extracted_at"],
            "has_conflict": False,
            "conflicts": [],
            "missing_year": False,
            "is_valid": False,
            "warning_message": f"Could not determine a valid exam date from stored memory for {subject}. Please confirm your upcoming exam date."
        }

    # We have exactly one distinct valid date
    primary = valid_dates[0]
    exam_date = primary["parsed"]["date_obj"]
    days_diff = (exam_date - local_today).days

    if days_diff < 0:
        # The exam date has PASSED -> Outdated / Past
        return {
            "subject": subject,
            "status": "PAST_OUTDATED",
            "status_label": "Outdated (Past Exam Date)",
            "requires_confirmation": True,
            "audit_level": "warning",
            "stored_date_raw": primary["parsed"]["raw_match"],
            "stored_date_iso": primary["parsed"]["iso_date"],
            "days_diff": days_diff,
            "source": primary["source"],
            "memory_id": primary["memory_id"],
            "extracted_at": primary["extracted_at"],
            "has_conflict": False,
            "conflicts": [],
            "missing_year": False,
            "is_valid": True,
            "warning_message": (
                f"Stored {subject} exam date ({primary['parsed']['raw_match']}) has already passed "
                f"({abs(days_diff)} days ago). An active countdown cannot be scheduled for a past date. "
                f"Please confirm or update your upcoming exam date."
            )
        }
    else:
        # Exam date is today or in the future -> Valid Future
        return {
            "subject": subject,
            "status": "VALID_FUTURE",
            "status_label": "Confirmed Future Date",
            "requires_confirmation": False,
            "audit_level": "success",
            "stored_date_raw": primary["parsed"]["raw_match"],
            "stored_date_iso": primary["parsed"]["iso_date"],
            "days_diff": days_diff,
            "source": primary["source"],
            "memory_id": primary["memory_id"],
            "extracted_at": primary["extracted_at"],
            "has_conflict": False,
            "conflicts": [],
            "missing_year": False,
            "is_valid": True,
            "warning_message": None
        }

"""
ASTRA Memory Store Verification & Metric Service

Provides transparent, calibrated auditing, lifecycle management, and status resolution for long-term personal memories.
Features:
  1. Explicit verification status (VERIFIED, UNVERIFIED, NEEDS_REVIEW)
  2. Full lifecycle states (VERIFIED, UNVERIFIED, NEEDS_CONFIRMATION, OUTDATED, ARCHIVED)
  3. Original provenance retention (original_source, original_date, original_content)
  4. Timestamp tracking (last_verified_at, last_updated_at)
  5. Audit history tracking across revisions
  6. Atomic updates, concurrent collision checks, and restore/undo capabilities
"""

from typing import Dict, Any, Optional, List
from datetime import date, datetime
import re
import json

VALID_STATUSES = {"VERIFIED", "UNVERIFIED", "NEEDS_REVIEW"}

VALID_LIFECYCLE_STATES = {
    "VERIFIED",
    "UNVERIFIED",
    "NEEDS_CONFIRMATION",
    "OUTDATED",
    "ARCHIVED"
}

STATUS_METADATA = {
    "VERIFIED": {
        "status": "VERIFIED",
        "label": "Verified",
        "badge_class": "badge-emerald",
        "tooltip": (
            "Verified: Explicitly confirmed or directly entered by the student. "
            "Stored as an authoritative personal fact."
        ),
        "description": "Student has explicitly confirmed this statement as accurate and active."
    },
    "UNVERIFIED": {
        "status": "UNVERIFIED",
        "label": "Unverified",
        "badge_class": "badge-purple",
        "tooltip": (
            "Unverified: Inferred or automatically captured from study activity (voice/chat/quiz). "
            "Pending student review; no calibrated statistical confidence percentage is calculated."
        ),
        "description": "Captured automatically without manual verification. No confidence percentage is displayed."
    },
    "NEEDS_REVIEW": {
        "status": "NEEDS_REVIEW",
        "label": "Needs Review",
        "badge_class": "badge-orange",
        "tooltip": (
            "Needs Review: This statement contains outdated or incomplete details (such as a past exam date) "
            "that require student attention before planning."
        ),
        "description": "Factual details or dates are past, missing, or require student confirmation."
    }
}

LIFECYCLE_METADATA = {
    "VERIFIED": {
        "state": "VERIFIED",
        "label": "Verified",
        "badge_class": "badge-emerald",
        "tooltip": "Verified: Formally validated by the student as an authoritative personal fact.",
        "description": "Active in study schedules and planner context."
    },
    "UNVERIFIED": {
        "state": "UNVERIFIED",
        "label": "Unverified",
        "badge_class": "badge-purple",
        "tooltip": "Unverified: Inferred from study interactions; not confirmed, but not classified as false.",
        "description": "Active in contextual suggestions, pending student verification."
    },
    "NEEDS_CONFIRMATION": {
        "state": "NEEDS_CONFIRMATION",
        "label": "Needs Confirmation",
        "badge_class": "badge-purple",
        "tooltip": "Needs Confirmation: Missing calendar year or ambiguous dates requiring clarification.",
        "description": "Requires student confirmation before alerts can be scheduled."
    },
    "OUTDATED": {
        "state": "OUTDATED",
        "label": "Outdated",
        "badge_class": "badge-orange",
        "tooltip": "Outdated: The date or circumstance in this memory has passed and requires an update.",
        "description": "Stored historical fact with expired temporal relevance."
    },
    "ARCHIVED": {
        "state": "ARCHIVED",
        "label": "Archived",
        "badge_class": "badge-purple",
        "tooltip": "Archived: Preserved in historical long-term store, but excluded from active study schedules.",
        "description": "Historical record preserved for provenance; hidden from active revision view."
    }
}


def normalize_status_string(value: Any) -> Optional[str]:
    """
    Normalizes a status string to uppercase canonical format ('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW').
    """
    if value is None or not isinstance(value, str):
        return None
    cleaned = value.strip().upper().replace(" ", "_").replace("-", "_")
    if cleaned in VALID_STATUSES:
        return cleaned
    return None


def normalize_lifecycle_string(value: Any) -> Optional[str]:
    """
    Normalizes a lifecycle string to canonical format ('VERIFIED', 'UNVERIFIED', 'NEEDS_CONFIRMATION', 'OUTDATED', 'ARCHIVED').
    """
    if value is None or not isinstance(value, str):
        return None
    cleaned = value.strip().upper().replace(" ", "_").replace("-", "_")
    if cleaned in VALID_LIFECYCLE_STATES:
        return cleaned
    return None


def is_legacy_percentage(val: Any) -> bool:
    """Checks whether a value is a legacy uncalibrated percentage string like '98%', '95%'."""
    if not isinstance(val, str):
        return False
    return bool(re.match(r"^\s*\d+(\.\d+)?%\s*$", val))


def parse_percentage_number(val: Any) -> Optional[float]:
    """Extracts numeric float from a percentage string like '98%' -> 98.0."""
    if not isinstance(val, str):
        return None
    match = re.match(r"^\s*(\d+(\.\d+)?)%\s*$", val)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def resolve_verification_status(
    raw_status: Optional[str] = None,
    legacy_confidence: Optional[str] = None,
    date_audit: Optional[Dict[str, Any]] = None,
    source: Optional[str] = None,
    content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Resolves the honest, explicit verification status for a memory record.
    """
    sanitized_status = normalize_status_string(raw_status)
    
    # 1. Temporal Currency Check:
    is_temporally_outdated = False
    is_missing_year = False
    if date_audit:
        status_val = date_audit.get("status", "")
        if status_val == "PAST_OUTDATED":
            is_temporally_outdated = True
        elif status_val == "NEEDS_CONFIRMATION" or date_audit.get("missing_year"):
            is_missing_year = True

    if is_temporally_outdated or is_missing_year:
        resolved = "NEEDS_REVIEW"
    elif sanitized_status:
        resolved = sanitized_status
    elif source in ("Student Confirmation", "Memory Store Update", "Manual Verification", "Direct Student Input"):
        resolved = "VERIFIED"
    elif legacy_confidence:
        norm_conf = normalize_status_string(legacy_confidence)
        if norm_conf:
            resolved = norm_conf
        elif is_legacy_percentage(legacy_confidence):
            pct = parse_percentage_number(legacy_confidence)
            if pct is not None and pct >= 100.0:
                resolved = "VERIFIED"
            else:
                resolved = "UNVERIFIED"
        else:
            resolved = "UNVERIFIED"
    else:
        resolved = "UNVERIFIED"

    meta = STATUS_METADATA[resolved]

    explanation = (
        f"Metric: Verification Status ({meta['label']}). "
        f"{meta['tooltip']} "
        "ASTRA does not display uncalibrated percentages; verification status reflects actual student validation and currency."
    )

    return {
        "status": resolved,
        "verification_status": resolved,
        "label": meta["label"],
        "status_label": meta["label"],
        "badge_class": meta["badge_class"],
        "tooltip": meta["tooltip"],
        "helper_description": explanation,
        "metric_name": "Verification Status",
        "is_calibrated_percentage": False,
        "legacy_confidence": legacy_confidence if legacy_confidence is not None else None,
        "source": source or "Unspecified",
        "is_outdated": is_temporally_outdated,
        "missing_year": is_missing_year
    }


def audit_and_format_memory(mem_dict: Dict[str, Any], reference_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Takes a raw database memory record, audits date currency, and enriches it
    with lifecycle state, provenance, and verification metadata.
    """
    from date_service import parse_date_string
    from time_service import get_now

    if reference_date is None:
        reference_date = get_now().date()

    m = dict(mem_dict)
    
    # Audit date currency
    parsed = parse_date_string(f"{m.get('title', '')}. {m.get('content', '')}", reference_date=reference_date)
    
    date_status = "NONE"
    date_status_label = ""
    if parsed["is_valid"]:
        if parsed["date_obj"] < reference_date:
            date_status = "PAST_OUTDATED"
            date_status_label = "Past Exam Date"
        else:
            date_status = "VALID_FUTURE"
            date_status_label = "Confirmed Future"
    elif parsed.get("missing_year"):
        date_status = "NEEDS_CONFIRMATION"
        date_status_label = "Needs Confirmation (Missing Year)"

    date_audit = {
        "status": date_status,
        "status_label": date_status_label,
        "parsed_date": parsed.get("iso_date"),
        "raw_match": parsed.get("raw_match"),
        "missing_year": parsed.get("missing_year", False),
        "is_valid": parsed.get("is_valid", False)
    }
    m["date_audit"] = date_audit

    # Resolve verification status
    resolved = resolve_verification_status(
        raw_status=m.get("verification_status"),
        legacy_confidence=m.get("confidence"),
        date_audit=date_audit,
        source=m.get("source"),
        content=m.get("content")
    )

    m["verification_status"] = resolved["status"]
    m["status_label"] = resolved["label"]
    m["status_tooltip"] = resolved["tooltip"]
    m["status_helper"] = resolved["helper_description"]
    m["metric_name"] = resolved["metric_name"]
    m["badge_class"] = resolved["badge_class"]
    m["is_calibrated_percentage"] = False
    m["legacy_confidence"] = resolved["legacy_confidence"]

    # Resolve lifecycle state
    raw_life = m.get("lifecycle_state")
    normalized_life = normalize_lifecycle_string(raw_life)
    if normalized_life == "ARCHIVED":
        lifecycle = "ARCHIVED"
    elif normalized_life in ("VERIFIED", "OUTDATED", "NEEDS_CONFIRMATION", "UNVERIFIED"):
        # If date is now outdated and memory was not archived, reflect reality
        if date_status == "PAST_OUTDATED":
            lifecycle = "OUTDATED"
        elif date_status == "NEEDS_CONFIRMATION":
            lifecycle = "NEEDS_CONFIRMATION"
        else:
            lifecycle = normalized_life
    else:
        if date_status == "PAST_OUTDATED":
            lifecycle = "OUTDATED"
        elif date_status == "NEEDS_CONFIRMATION":
            lifecycle = "NEEDS_CONFIRMATION"
        elif resolved["status"] == "VERIFIED":
            lifecycle = "VERIFIED"
        else:
            lifecycle = "UNVERIFIED"

    meta_life = LIFECYCLE_METADATA.get(lifecycle, LIFECYCLE_METADATA["UNVERIFIED"])
    m["lifecycle_state"] = lifecycle
    m["lifecycle_label"] = meta_life["label"]
    m["lifecycle_tooltip"] = meta_life["tooltip"]
    m["lifecycle_badge_class"] = meta_life["badge_class"]

    # Provenance and historical metadata
    m["original_source"] = m.get("original_source") or m.get("source") or "Direct Entry"
    m["original_date"] = m.get("original_date") or m.get("date") or ""
    m["original_content"] = m.get("original_content") or m.get("content") or ""
    m["last_updated_at"] = m.get("last_updated_at") or m.get("date") or ""
    m["last_verified_at"] = m.get("last_verified_at") or (m.get("date") if lifecycle == "VERIFIED" else None)

    # Edit history list
    raw_hist = m.get("edit_history")
    if isinstance(raw_hist, str):
        try:
            m["edit_history"] = json.loads(raw_hist) if raw_hist else []
        except Exception:
            m["edit_history"] = []
    elif isinstance(raw_hist, list):
        m["edit_history"] = raw_hist
    else:
        m["edit_history"] = []

    # Preserve confidence field for backwards compatibility
    if m.get("confidence") is None or is_legacy_percentage(m.get("confidence")):
        m["legacy_confidence_raw"] = m.get("confidence")
        m["confidence"] = resolved["label"]

    return m


def update_memory_record(mem_id: str, updates: Dict[str, Any], expected_last_updated_at: Optional[str] = None) -> Dict[str, Any]:
    """
    Updates a memory record with input validation, concurrent conflict detection,
    and historical provenance retention.
    """
    from database import get_db
    from time_service import get_now

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (mem_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise KeyError(f"Memory with id '{mem_id}' not found.")

    current = dict(row)
    now_iso = get_now().isoformat()

    # 1. Concurrent Update Check
    if expected_last_updated_at:
        curr_updated = current.get("last_updated_at")
        if curr_updated and curr_updated != expected_last_updated_at:
            conn.close()
            raise ValueError("Concurrent update detected: Memory has been modified by another process. Please refresh and review latest changes.")

    # 2. Validation
    raw_title = updates.get("title", current.get("title"))
    raw_content = updates.get("content", current.get("content"))
    raw_category = updates.get("category", current.get("category"))

    new_title = raw_title.strip() if raw_title is not None else ""
    new_content = raw_content.strip() if raw_content is not None else ""
    new_category = raw_category.strip() if raw_category is not None else "General"

    if not new_title:
        conn.close()
        raise ValueError("Memory title cannot be empty.")
    if not new_content:
        conn.close()
        raise ValueError("Memory content cannot be empty.")
    if not new_category:
        new_category = "General"

    # 3. Lifecycle state and Verification status
    new_lifecycle = current.get("lifecycle_state") or "UNVERIFIED"
    if "lifecycle_state" in updates and updates["lifecycle_state"]:
        cand_l = normalize_lifecycle_string(updates["lifecycle_state"])
        if cand_l:
            new_lifecycle = cand_l
        else:
            conn.close()
            raise ValueError(f"Invalid lifecycle state '{updates['lifecycle_state']}'. Must be one of: {sorted(list(VALID_LIFECYCLE_STATES))}")

    new_verification = current.get("verification_status") or "UNVERIFIED"
    if "verification_status" in updates and updates["verification_status"]:
        cand_v = normalize_status_string(updates["verification_status"])
        if cand_v:
            new_verification = cand_v
    elif new_lifecycle == "VERIFIED":
        new_verification = "VERIFIED"
    elif new_lifecycle in ("OUTDATED", "NEEDS_CONFIRMATION"):
        new_verification = "NEEDS_REVIEW"

    # Last verified timestamp
    last_verified = current.get("last_verified_at")
    if new_lifecycle == "VERIFIED" or new_verification == "VERIFIED":
        last_verified = now_iso

    # 4. History Tracking
    raw_hist = current.get("edit_history") or "[]"
    try:
        history_list = json.loads(raw_hist) if isinstance(raw_hist, str) else list(raw_hist)
    except Exception:
        history_list = []

    changes = []
    if new_title != current.get("title"):
        changes.append({"field": "title", "old": current.get("title"), "new": new_title})
    if new_content != current.get("content"):
        changes.append({"field": "content", "old": current.get("content"), "new": new_content})
    if new_category != current.get("category"):
        changes.append({"field": "category", "old": current.get("category"), "new": new_category})
    if new_lifecycle != current.get("lifecycle_state"):
        changes.append({"field": "lifecycle_state", "old": current.get("lifecycle_state"), "new": new_lifecycle})

    if changes:
        history_list.append({
            "timestamp": now_iso,
            "changes": changes,
            "source": updates.get("source", "Student Edit")
        })

    # Execute SQL update
    cursor.execute("""
        UPDATE personal_memories
        SET title = ?, content = ?, category = ?, lifecycle_state = ?, verification_status = ?,
            confidence = ?, last_updated_at = ?, last_verified_at = ?, edit_history = ?
        WHERE id = ?
    """, (
        new_title,
        new_content,
        new_category,
        new_lifecycle,
        new_verification,
        new_lifecycle.title(),
        now_iso,
        last_verified,
        json.dumps(history_list),
        mem_id
    ))

    # Log recent activity
    act_id = f"act-{int(datetime.now().timestamp() * 1000)}"
    cursor.execute(
        "INSERT INTO recent_activities VALUES (?, ?, ?, ?)",
        (act_id, f"Updated memory: {new_title} [{new_lifecycle.title()}]", "Just now", "#00f2fe")
    )

    conn.commit()

    cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (mem_id,))
    updated_row = dict(cursor.fetchone())
    conn.close()

    return audit_and_format_memory(updated_row)


def delete_memory_record(mem_id: str) -> Dict[str, Any]:
    """
    Deletes a memory record while returning the complete snapshot for undo support.
    Raises KeyError if memory does not exist.
    """
    from database import get_db
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (mem_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise KeyError(f"Memory with id '{mem_id}' not found.")

    deleted_data = dict(row)
    cursor.execute("DELETE FROM personal_memories WHERE id = ?", (mem_id,))
    conn.commit()
    conn.close()
    return audit_and_format_memory(deleted_data)


def restore_memory_record(mem_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Restores a memory snapshot back into SQLite, enabling instant undo workflows.
    """
    from database import get_db
    conn = get_db()
    cursor = conn.cursor()

    mem_id = mem_data.get("id")
    if not mem_id:
        conn.close()
        raise ValueError("Cannot restore memory without a valid 'id'.")

    cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (mem_id,))
    existing = cursor.fetchone()

    edit_hist = mem_data.get("edit_history", [])
    hist_str = json.dumps(edit_hist) if isinstance(edit_hist, list) else (str(edit_hist) if edit_hist else "[]")

    if existing:
        # If it exists, reactivate it by unarchiving
        cursor.execute("UPDATE personal_memories SET lifecycle_state = 'UNVERIFIED' WHERE id = ?", (mem_id,))
    else:
        cursor.execute("""
            INSERT INTO personal_memories 
            (id, category, title, content, confidence, source, date, verification_status, lifecycle_state, last_verified_at, last_updated_at, original_source, original_date, original_content, edit_history)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mem_id,
            mem_data.get("category", "General"),
            mem_data.get("title", "Restored Memory"),
            mem_data.get("content", ""),
            mem_data.get("confidence", "Restored"),
            mem_data.get("source", "Restored"),
            mem_data.get("date", ""),
            mem_data.get("verification_status", "UNVERIFIED"),
            mem_data.get("lifecycle_state", "UNVERIFIED"),
            mem_data.get("last_verified_at"),
            mem_data.get("last_updated_at"),
            mem_data.get("original_source") or mem_data.get("source"),
            mem_data.get("original_date") or mem_data.get("date"),
            mem_data.get("original_content") or mem_data.get("content"),
            hist_str
        ))

    conn.commit()
    cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (mem_id,))
    restored = dict(cursor.fetchone())
    conn.close()

    return audit_and_format_memory(restored)

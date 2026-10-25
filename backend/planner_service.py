import json
from datetime import timedelta, date, datetime
from typing import List, Dict, Any, Optional
from database import get_db
from time_service import get_now
from date_service import audit_exam_memories, parse_date_string

def get_current_plan(memories: Optional[List[Dict[str, Any]]] = None, subject: str = "DBMS") -> Dict[str, Any]:
    """
    Returns the exam revision plan for the student, strictly evaluating stored exam dates.
    If the stored exam date is in the past, unverified, or conflicting, marks the plan
    as requiring user confirmation and prevents false countdown schedules.
    """
    now = get_now()
    local_today = now.date()

    if memories is None:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM personal_memories")
        memories = [dict(row) for row in cursor.fetchall()]
        conn.close()

    audit = audit_exam_memories(memories, subject=subject, reference_now=now)

    is_confirmed_future = (audit["status"] == "VALID_FUTURE")
    requires_confirmation = audit["requires_confirmation"]

    # Date offsets from current local time
    d1 = now
    d2 = now + timedelta(days=1)
    d3 = now + timedelta(days=2)
    d4 = now + timedelta(days=3)

    if is_confirmed_future and audit.get("stored_date_iso"):
        exam_target_date = datetime.strptime(audit["stored_date_iso"], "%Y-%m-%d").date()
        exam_target_str = exam_target_date.strftime("%A, %b %d")
        
        days_list = [
            {
                "day": "Day 1",
                "date": d1.strftime("%A, %b %d"),
                "status": "In Progress",
                "isToday": True,
                "sessions": [
                    {"time": "19:00 - 20:30", "topic": "Functional Dependencies & 1NF/2NF", "status": "Done", "focus": "High"}
                ]
            },
            {
                "day": "Day 2",
                "date": d2.strftime("%A, %b %d"),
                "status": "Scheduled",
                "isToday": False,
                "sessions": [
                    {"time": "19:00 - 21:00", "topic": "3NF vs BCNF Decomposition & Lossless Join", "status": "Pending", "focus": "Priority (Weak Subject)"}
                ]
            },
            {
                "day": "Day 3",
                "date": d3.strftime("%A, %b %d"),
                "status": "Scheduled",
                "isToday": False,
                "sessions": [
                    {"time": "18:30 - 20:30", "topic": "Transaction Management & Serializability", "status": "Pending", "focus": "Normal"},
                    {"time": "20:30 - 21:30", "topic": "Mock Practice & Weak Topic Flashcards", "status": "Pending", "focus": "High"}
                ]
            },
            {
                "day": "Day 4",
                "date": f"{exam_target_str} (Exam Day)",
                "status": "Exam Day",
                "isToday": (exam_target_date == local_today),
                "sessions": [
                    {"time": "08:00 - 09:30", "topic": "Final Formula Warmup & Key Definitions", "status": "Scheduled", "focus": "Review"},
                    {"time": "10:00 - 13:00", "topic": f"⚡ {subject} FINAL EXAM", "status": "Exam", "focus": "Critical"}
                ]
            }
        ]
    else:
        # Outdated, unverified, or conflicting date:
        # Mark schedule as tentative / unconfirmed to prevent generating urgent future countdowns
        status_label = "Pending Date Confirmation"
        
        stored_raw = audit.get("stored_date_raw") or "Unknown"
        exam_day_label = f"Stored: {stored_raw} (Outdated / Needs Confirmation)"

        days_list = [
            {
                "day": "Review 1",
                "date": d1.strftime("%A, %b %d"),
                "status": "Tentative Review",
                "isToday": True,
                "sessions": [
                    {"time": "19:00 - 20:30", "topic": "Functional Dependencies & 1NF/2NF", "status": "Pending", "focus": "High"}
                ]
            },
            {
                "day": "Review 2",
                "date": d2.strftime("%A, %b %d"),
                "status": "Tentative Review",
                "isToday": False,
                "sessions": [
                    {"time": "19:00 - 21:00", "topic": "3NF vs BCNF Decomposition & Lossless Join", "status": "Pending", "focus": "Priority (Weak Subject)"}
                ]
            },
            {
                "day": "Review 3",
                "date": d3.strftime("%A, %b %d"),
                "status": "Tentative Review",
                "isToday": False,
                "sessions": [
                    {"time": "18:30 - 20:30", "topic": "Transaction Management & Serializability", "status": "Pending", "focus": "Normal"},
                    {"time": "20:30 - 21:30", "topic": "Mock Practice & Weak Topic Flashcards", "status": "Pending", "focus": "High"}
                ]
            },
            {
                "day": "Exam Day",
                "date": exam_day_label,
                "status": "Needs Confirmation",
                "isToday": False,
                "sessions": [
                    {"time": "--:--", "topic": f"⚡ {subject} FINAL EXAM (Awaiting Date Confirmation)", "status": "Unconfirmed", "focus": "Pending"}
                ]
            }
        ]

    return {
        "subject": subject,
        "plan_status": "CONFIRMED" if is_confirmed_future else "NEEDS_CONFIRMATION",
        "exam_status": audit["status"],
        "status_label": audit["status_label"],
        "requires_confirmation": requires_confirmation,
        "audit": audit,
        "warning": audit.get("warning_message"),
        "prevent_calendar_alerts": requires_confirmation,
        "plan": days_list,
        "progress": calculate_plan_progress(days_list)
    }

def calculate_plan_progress(days_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculates completion percentage strictly from planned revision sessions (excluding final exam event)."""
    if not days_list:
        return {
            "percentage": 0,
            "completed_sessions": 0,
            "total_sessions": 0,
            "metric_label": "Planned Revision Sessions"
        }

    study_sessions = []
    for day in days_list:
        for s in day.get("sessions", []):
            st = (s.get("status") or "").lower()
            topic = (s.get("topic") or "").lower()
            if st != "exam" and "final exam" not in topic:
                study_sessions.append(s)

    total = len(study_sessions)
    if total == 0:
        return {
            "percentage": 0,
            "completed_sessions": 0,
            "total_sessions": 0,
            "metric_label": "Planned Revision Sessions"
        }

    completed = sum(1 for s in study_sessions if (s.get("status") or "").lower() in ("done", "completed"))
    percentage = min(100, max(0, round((completed / total) * 100)))

    return {
        "percentage": percentage,
        "completed_sessions": completed,
        "total_sessions": total,
        "metric_label": "Planned Revision Sessions"
    }

def generate_exam_plan(subject: str = "DBMS") -> Dict[str, Any]:
    return get_current_plan(subject=subject)

def perform_adaptive_rescheduling(subject: str = "DBMS") -> Dict[str, Any]:
    plan_data = get_current_plan(subject=subject)
    days = plan_data.get("plan", [])
    updated_days = []

    for idx, day in enumerate(days):
        if idx == 1:
            updated_day = {
                **day,
                "status": "Adjusted (+45m added load)",
                "sessions": [
                    {
                        "time": "18:30 - 21:15",
                        "topic": "3NF/BCNF + Re-allocated Missed Normalization Practice",
                        "status": "Pending",
                        "focus": "Priority (High Load)"
                    }
                ]
            }
            updated_days.append(updated_day)
        elif idx == 2:
            updated_day = {
                **day,
                "status": "Adjusted (+30m review)",
                "sessions": [
                    {
                        "time": "18:00 - 20:30",
                        "topic": "Transaction Management & Serializability",
                        "status": "Pending",
                        "focus": "Normal"
                    },
                    {
                        "time": "20:30 - 21:45",
                        "topic": "Full Mock Exam Simulation (Decomposition Focus)",
                        "status": "Pending",
                        "focus": "High"
                    }
                ]
            }
            updated_days.append(updated_day)
        else:
            updated_days.append(day)

    plan_data["plan"] = updated_days
    return plan_data

def confirm_or_update_exam_date(subject: str, new_date_str: str, source: str = "User Confirmation") -> Dict[str, Any]:
    """
    Explicitly confirms or updates an upcoming exam date.
    - Validates date string.
    - Ensures date is strictly today or in the future in the configured timezone.
    - Preserves previous historical memory or audit record for full auditability.
    - Updates/inserts verified memory with VERIFIED status.
    """
    now = get_now()
    local_today = now.date()

    parsed = parse_date_string(new_date_str, reference_date=local_today)
    if not parsed["is_valid"]:
        raise ValueError(f"Invalid date format or missing information: {parsed.get('error', 'Cannot parse date')}")

    new_date = parsed["date_obj"]
    if new_date < local_today:
        raise ValueError(
            f"Cannot schedule an exam in the past ({new_date.isoformat()}). "
            f"Today's date is {local_today.isoformat()}. Please select an upcoming date."
        )

    formatted_content = f"{subject} exam is scheduled for {new_date.strftime('%A, %B %d, %Y')}."
    iso_str = new_date.isoformat()

    conn = get_db()
    cursor = conn.cursor()

    # Look for existing exam memory for this subject to archive/update with audit record
    cursor.execute("SELECT * FROM personal_memories WHERE category = 'Exams' AND (title LIKE ? OR content LIKE ?)",
                   (f"%{subject}%", f"%{subject}%"))
    existing = [dict(r) for r in cursor.fetchall()]

    new_mem_id = f"mem-{int(datetime.now().timestamp() * 1000)}"
    today_str = local_today.isoformat()

    if existing:
        # Update existing memory while preserving original provenance and tracking edit history
        target_id = existing[0]["id"]
        old_content = existing[0]["content"]
        audit_source = f"{source} (Updated from: '{old_content}')"
        
        # Load and update edit history
        raw_history = existing[0].get("edit_history", "[]") if isinstance(existing[0], dict) else "[]"
        try:
            history_list = json.loads(raw_history) if raw_history else []
        except Exception:
            history_list = []
            
        history_list.append({
            "timestamp": today_str,
            "field": "content",
            "old_value": old_content,
            "new_value": formatted_content,
            "source": source
        })

        cursor.execute(
            """
            UPDATE personal_memories 
            SET content = ?, confidence = 'Verified', verification_status = 'VERIFIED', lifecycle_state = 'VERIFIED', 
                source = ?, date = ?, last_verified_at = ?, last_updated_at = ?, edit_history = ? 
            WHERE id = ?
            """,
            (formatted_content, audit_source, today_str, today_str, today_str, json.dumps(history_list), target_id)
        )
    else:
        cursor.execute(
            """
            INSERT INTO personal_memories 
            (id, category, title, content, confidence, source, date, verification_status, lifecycle_state, last_verified_at, last_updated_at, original_source, original_date, original_content, edit_history) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (new_mem_id, "Exams", f"{subject} Final Exam Date", formatted_content, "Verified", source, today_str, "VERIFIED", "VERIFIED", today_str, today_str, source, today_str, formatted_content, "[]")
        )

    # Log to recent activities
    act_id = f"act-{int(datetime.now().timestamp() * 1000)}"
    cursor.execute(
        "INSERT INTO recent_activities VALUES (?, ?, ?, ?)",
        (act_id, f"Confirmed {subject} exam date: {new_date.strftime('%b %d, %Y')}", "Just now", "#00f2fe")
    )

    conn.commit()
    conn.close()

    # Return refreshed plan
    return get_current_plan(subject=subject)

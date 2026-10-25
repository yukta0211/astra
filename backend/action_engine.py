import time
from database import get_db

def add_task_action(title, subtext="DBMS · 1 hour", accent="#00f2fe"):
    conn = get_db()
    cursor = conn.cursor()
    task_id = f"task-{int(time.time() * 1000)}"
    cursor.execute(
        "INSERT INTO tasks VALUES (?, ?, ?, ?, ?)",
        (task_id, title, subtext, 0, accent)
    )
    
    # Log Activity
    act_id = f"act-{int(time.time() * 1000)}"
    cursor.execute(
        "INSERT INTO recent_activities VALUES (?, ?, ?, ?)",
        (act_id, f"Added task: {title}", "Just now", accent)
    )

    conn.commit()
    conn.close()

    return {
        "success": True,
        "task_id": task_id,
        "title": title,
        "message": f"Created task '{title}' successfully."
    }

def add_calendar_event_action(title, time_str="7:00 PM", duration="19:00 – 21:00", location="Focus session", dot_color="#f59e0b"):
    conn = get_db()
    cursor = conn.cursor()
    event_id = f"sch-{int(time.time() * 1000)}"
    cursor.execute(
        "INSERT INTO calendar_events VALUES (?, ?, ?, ?, ?, ?)",
        (event_id, time_str, duration, title, location, dot_color)
    )

    # Log Activity
    act_id = f"act-{int(time.time() * 1000)}"
    cursor.execute(
        "INSERT INTO recent_activities VALUES (?, ?, ?, ?)",
        (act_id, f"Synced event '{title}' to Calendar", "Just now", "#00f2fe")
    )

    conn.commit()
    conn.close()

    return {
        "success": True,
        "event_id": event_id,
        "title": title,
        "message": f"Added '{title}' ({duration}) to calendar with 6:45 PM reminder alert."
    }

from time_service import get_now
from memory_service import resolve_verification_status

def add_personal_memory_action(category, title, content, confidence=None, source="Voice / Chat", verification_status=None):
    conn = get_db()
    cursor = conn.cursor()
    mem_id = f"mem-{int(time.time() * 1000)}"
    date_str = get_now().strftime("%Y-%m-%d")
    
    # Resolve verification status
    resolved = resolve_verification_status(
        raw_status=verification_status,
        legacy_confidence=confidence,
        source=source,
        content=content
    )
    v_status = resolved["status"]
    v_label = resolved["label"]

    # Lifecycle and timestamps
    lifecycle = v_status
    last_verified = date_str if v_status == "VERIFIED" else None
    last_updated = date_str

    cursor.execute(
        """
        INSERT INTO personal_memories 
        (id, category, title, content, confidence, source, date, verification_status, lifecycle_state, last_verified_at, last_updated_at, original_source, original_date, original_content, edit_history) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (mem_id, category, title, content, v_label, source, date_str, v_status, lifecycle, last_verified, last_updated, source, date_str, content, "[]")
    )

    # Log Activity
    act_id = f"act-{int(time.time() * 1000)}"
    cursor.execute(
        "INSERT INTO recent_activities VALUES (?, ?, ?, ?)",
        (act_id, f"Remembered ({v_label}): {title}", "Just now", "#00f2fe")
    )

    conn.commit()
    conn.close()

    return {
        "success": True,
        "memory_id": mem_id,
        "title": title,
        "verification_status": v_status,
        "status_label": v_label,
        "message": f"Stored in persistent long-term memory: '{title}' [{v_label}]"
    }

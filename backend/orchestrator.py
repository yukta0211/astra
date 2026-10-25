import sys
import os
import re
from typing import List, Dict, Any, Optional

sys.path.append(os.path.dirname(__file__))

from database import get_db
from time_service import get_system_time_context
from llm.provider import llm_provider
from rag_service import search_rag_chunks, generate_rag_answer
from planner_service import generate_exam_plan, perform_adaptive_rescheduling
from action_engine import add_personal_memory_action, add_calendar_event_action, add_task_action

def process_user_request(query: str, history: List[Dict[str, str]] = None):
    history = history or []
    time_ctx = get_system_time_context()
    
    # 1. Retrieve stored personal memories for LLM context
    db_state = get_latest_db_state()
    memories = db_state.get("memories", [])

    status_state = "Thinking..."
    citations = []
    action_executed = None

    # 2. Call LLM Engine with query, history, time context, and memories
    llm_res = llm_provider.generate_completion(query, history, time_ctx, memories)

    intent = llm_res.get("intent", "GENERAL_CHAT")
    reply = llm_res.get("message", "")
    entities = llm_res.get("entities", {})

    # 3. Deterministic Backend Service Execution based on Intent & Requirements

    # Intent: STORE_MEMORY
    if intent == "STORE_MEMORY" or llm_res.get("requires_memory"):
        status_state = "Saving to memory..."
        category = "Exams" if ("exam" in query.lower() or entities.get("subject")) else "Weak Subjects" if (entities.get("weakness") or any(w in query.lower() for w in ["weak", "difficult", "struggle"])) else "Preferences"
        title = f"{entities.get('subject', 'DBMS')} Memory" if entities.get("subject") else "Student Note"
        
        act = add_personal_memory_action(category, title, query)
        action_executed = {"type": "STORE_MEMORY", "detail": act["message"]}

    # Intent: QUERY_KNOWLEDGE (RAG Search)
    elif intent == "QUERY_KNOWLEDGE" or llm_res.get("requires_knowledge"):
        status_state = "Searching documents..."
        try:
            from rag.retriever import retrieve_relevant_chunks
            from rag.answer_generator import generate_grounded_answer
            qdrant_chunks = retrieve_relevant_chunks(query, top_k=3)
        except Exception:
            qdrant_chunks = []

        if qdrant_chunks:
            try:
                rag_res = generate_grounded_answer(query, qdrant_chunks)
                reply = rag_res.get("answer", "")
                citations = [
                    f"{c.get('filename', 'Notes')} — Page {c.get('page_start', 1)}"
                    for c in rag_res.get("citations", [])
                ]
            except Exception:
                top_chk = qdrant_chunks[0]
                reply = f"According to your notes ({top_chk.get('filename', 'Notes')}, Page {top_chk.get('page_start', 1)}):\n{top_chk.get('text', '')}"
                citations = [f"{top_chk.get('filename', 'Notes')} — Page {top_chk.get('page_start', 1)}"]

            action_executed = {
                "type": "QUERY_KNOWLEDGE",
                "detail": f"Retrieved {len(qdrant_chunks)} document passages with top citation {citations[0] if citations else 'N/A'}"
            }
        else:
            chunks = search_rag_chunks(query)
            rag_res = generate_rag_answer(query, chunks)
            if chunks:
                reply = rag_res["answer"]
                citations = rag_res["citations"]
                action_executed = {"type": "QUERY_KNOWLEDGE", "detail": f"Retrieved {len(chunks)} document passages with top citation {citations[0] if citations else 'N/A'}"}

    # Intent: ADAPT_PLAN
    elif intent == "ADAPT_PLAN":
        status_state = "Planning..."
        updated_plan = perform_adaptive_rescheduling()
        action_executed = {"type": "ADAPT_PLAN", "detail": "Recalculated revision load onto Wed/Thu evening slots"}

    # Intent: CREATE_PLAN / QUERY_PLAN
    elif intent == "CREATE_PLAN" or llm_res.get("requires_planning"):
        status_state = "Planning..."
        from date_service import audit_exam_memories
        subject = entities.get("subject") or "DBMS"
        audit = audit_exam_memories(memories, subject=subject)
        
        if audit["requires_confirmation"]:
            action_executed = {
                "type": "CREATE_PLAN",
                "detail": f"Awaiting exam date confirmation for {subject}: {audit['status_label']}",
                "requires_confirmation": True
            }
            if audit["status"] == "PAST_OUTDATED":
                warning_suffix = f"\n\n⚠️ Note: Your stored {subject} exam date ({audit.get('stored_date_raw')}) has already passed. Please confirm or update your upcoming exam date to generate an active countdown schedule."
                if audit.get("stored_date_raw") not in reply or "passed" not in reply.lower():
                    reply = reply.strip() + warning_suffix
        else:
            action_executed = {
                "type": "CREATE_PLAN",
                "detail": f"Generated revision schedule leading to {audit.get('stored_date_raw')}"
            }

    # Intent: QUERY_MEMORY
    elif intent == "QUERY_MEMORY":
        status_state = "Recalling..."
        from date_service import audit_exam_memories
        subject = entities.get("subject") or "DBMS"
        audit = audit_exam_memories(memories, subject=subject)
        if ("exam" in query.lower() or "when" in query.lower()) and audit["status"] == "PAST_OUTDATED":
            if "passed" not in reply.lower() and "outdated" not in reply.lower():
                reply += f"\n\n⚠️ Stored date notice: {audit.get('warning_message')}"

    # Intent: CREATE_CALENDAR_EVENT
    elif intent == "CREATE_CALENDAR_EVENT" or llm_res.get("requires_action"):
        status_state = "Executing action..."
        from date_service import audit_exam_memories
        subject = entities.get("subject") or "DBMS"
        audit = audit_exam_memories(memories, subject=subject)

        if "exam" in query.lower() and audit["requires_confirmation"]:
            status_state = "Needs Confirmation"
            reply = f"I cannot arm active countdown alerts for {subject} because the stored exam date ({audit.get('stored_date_raw')}) is outdated. Please confirm your upcoming exam date first."
            action_executed = {"type": "CALENDAR_ALERT_BLOCKED", "detail": "Prevented calendar alert for unconfirmed historical exam date."}
        else:
            event_title = entities.get("event_title") or entities.get("subject") or "DBMS revision"
            time_str = entities.get("time_str") or "7:00 PM"
            act = add_calendar_event_action(event_title, time_str=time_str, duration="19:00 – 21:00", location="Focus session")
            action_executed = {"type": "CREATE_CALENDAR_EVENT", "detail": act["message"]}

    # Intent: CREATE_TASK
    elif intent == "CREATE_TASK":
        status_state = "Executing action..."
        task_title = entities.get("task_title") or query
        act = add_task_action(task_title)
        action_executed = {"type": "CREATE_TASK", "detail": act["message"]}

    # Intent: QUERY_SCHEDULE
    elif intent == "QUERY_SCHEDULE":
        status_state = "Checking schedule..."
        action_executed = {"type": "QUERY_SCHEDULE", "detail": f"Retrieved schedule for {time_ctx['today_schedule_header']}"}

    # Intent: QUIZ_MODE
    elif intent == "QUIZ_MODE":
        status_state = "Launching Quiz..."
        action_executed = {"type": "QUIZ_MODE", "detail": "Navigating to Adaptive Quiz Mode"}

    else:
        status_state = "Online"

    # Fetch fresh DB state
    updated_state = get_latest_db_state()

    return {
        "reply": reply,
        "intent": intent,
        "status": status_state,
        "citations": citations,
        "action_executed": action_executed,
        "updated_state": updated_state,
        "time_context": time_ctx
    }

def get_latest_db_state():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM personal_memories ORDER BY date DESC")
    raw_memories = [dict(r) for r in cursor.fetchall()]

    from date_service import parse_date_string, audit_exam_memories
    from time_service import get_now
    from memory_service import audit_and_format_memory
    local_today = get_now().date()

    memories = [audit_and_format_memory(m, reference_date=local_today) for m in raw_memories]

    cursor.execute("SELECT * FROM calendar_events")
    schedule = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM tasks")
    tasks = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM recent_activities ORDER BY id DESC")
    activities = [dict(r) for r in cursor.fetchall()]

    conn.close()

    exam_audit = audit_exam_memories(memories, subject="DBMS")

    return {
        "memories": memories,
        "schedule": schedule,
        "tasks": tasks,
        "recent_activities": activities,
        "exam_audit": exam_audit
    }

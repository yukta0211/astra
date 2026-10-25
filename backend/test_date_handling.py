import pytest
import sqlite3
import os
import sys
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from time_service import get_now, get_tz, get_system_time_context
from date_service import parse_date_string, audit_exam_memories
from planner_service import get_current_plan, confirm_or_update_exam_date
from database import get_db

@pytest.fixture(autouse=True)
def reset_db_memories():
    def do_reset():
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE personal_memories SET content = ?, confidence = ?, source = ?, date = ? WHERE id = 'mem-1'",
            ('DBMS exam is scheduled for Friday, March 21, 2025.', '98%', 'Voice Input / Calendar', '2025-03-16')
        )
        cursor.execute("DELETE FROM personal_memories WHERE id NOT IN ('mem-1', 'mem-2', 'mem-3')")
        conn.commit()
        conn.close()
    do_reset()
    yield
    do_reset()

class TestDateParsingAndValidation:
    """Tests date string parsing, error handling, missing years, and date formats."""

    def test_parse_iso_format(self):
        res = parse_date_string("2026-11-25")
        assert res["is_valid"] is True
        assert res["iso_date"] == "2026-11-25"
        assert res["date_obj"] == date(2026, 11, 25)
        assert res["missing_year"] is False

    def test_parse_textual_full_dates(self):
        # Format: Friday, March 21, 2025
        res1 = parse_date_string("DBMS exam is scheduled for Friday, March 21, 2025.")
        assert res1["is_valid"] is True
        assert res1["iso_date"] == "2025-03-21"
        assert res1["date_obj"] == date(2025, 3, 21)

        # Format: 21st March 2025
        res2 = parse_date_string("My exam is on 21st March 2025")
        assert res2["is_valid"] is True
        assert res2["iso_date"] == "2025-03-21"

        # Format: December 10, 2026
        res3 = parse_date_string("Final project due December 10, 2026")
        assert res3["is_valid"] is True
        assert res3["iso_date"] == "2026-12-10"

    def test_parse_missing_year(self):
        # Missing year should flag missing_year=True and is_valid=False
        res = parse_date_string("The midterm is on Friday, Oct 24.")
        assert res["is_valid"] is False
        assert res["missing_year"] is True
        assert "Missing year" in res["error"]

        res2 = parse_date_string("Exam on March 21")
        assert res2["is_valid"] is False
        assert res2["missing_year"] is True

    def test_parse_invalid_calendar_dates(self):
        # Feb 30 does not exist
        res = parse_date_string("Meeting on February 30, 2026")
        assert res["is_valid"] is False
        assert res["missing_year"] is False
        assert "Invalid calendar date" in res["error"]

    def test_parse_empty_or_gibberish(self):
        res = parse_date_string("No date in this text")
        assert res["is_valid"] is False
        assert res["date_obj"] is None


class TestExamMemoryAuditing:
    """Tests temporal classification: Past/Outdated, Needs Confirmation, Valid Future, Conflicts."""

    def test_stored_date_in_past_classified_as_outdated(self):
        # Given a stored memory from 2025 evaluated against current time
        memories = [
            {
                "id": "mem-1",
                "category": "Exams",
                "title": "DBMS Final Exam Date",
                "content": "DBMS exam is scheduled for Friday, March 21, 2025.",
                "confidence": "98%",
                "source": "Voice Input / Calendar",
                "date": "2025-03-16"
            }
        ]

        audit = audit_exam_memories(memories, subject="DBMS")

        # Stored date must be marked as PAST_OUTDATED
        assert audit["status"] == "PAST_OUTDATED"
        assert audit["requires_confirmation"] is True
        assert audit["stored_date_iso"] == "2025-03-21"
        assert audit["days_diff"] < 0
        assert "already passed" in audit["warning_message"]
        
        # Original text and source must be preserved for auditability
        assert audit["source"] == "Voice Input / Calendar"
        assert audit["memory_id"] == "mem-1"
        assert audit["extracted_at"] == "2025-03-16"

    def test_future_date_classified_as_valid(self):
        now = get_now()
        future_date = (now + timedelta(days=20)).strftime("%B %d, %Y")
        
        memories = [
            {
                "id": "mem-future",
                "category": "Exams",
                "title": "DBMS Final Exam Date",
                "content": f"DBMS exam is scheduled for {future_date}.",
                "confidence": "100%",
                "source": "Student Confirmation",
                "date": now.strftime("%Y-%m-%d")
            }
        ]

        audit = audit_exam_memories(memories, subject="DBMS")
        assert audit["status"] == "VALID_FUTURE"
        assert audit["requires_confirmation"] is False
        assert audit["days_diff"] > 0
        assert audit["warning_message"] is None

    def test_conflicting_exam_dates_detection(self):
        # Two memories specifying different dates for the same exam
        memories = [
            {
                "id": "mem-1",
                "category": "Exams",
                "title": "DBMS Final Exam Date",
                "content": "DBMS exam is scheduled for Friday, March 21, 2025.",
                "confidence": "98%",
                "source": "Voice Input / Calendar",
                "date": "2025-03-16"
            },
            {
                "id": "mem-2",
                "category": "Exams",
                "title": "Rescheduled DBMS Exam",
                "content": "DBMS exam was moved to April 10, 2025.",
                "confidence": "90%",
                "source": "Syllabus Update",
                "date": "2025-03-18"
            }
        ]

        audit = audit_exam_memories(memories, subject="DBMS")
        assert audit["status"] == "NEEDS_CONFIRMATION"
        assert audit["has_conflict"] is True
        assert audit["requires_confirmation"] is True
        assert len(audit["conflicts"]) == 2
        assert "Conflicting exam dates detected" in audit["warning_message"]

    def test_missing_year_triggers_confirmation(self):
        memories = [
            {
                "id": "mem-ambiguous",
                "category": "Exams",
                "title": "DBMS Exam Date",
                "content": "DBMS exam is on Friday, Oct 24.",
                "confidence": "85%",
                "source": "Chat",
                "date": "2026-01-10"
            }
        ]

        audit = audit_exam_memories(memories, subject="DBMS")
        assert audit["status"] == "NEEDS_CONFIRMATION"
        assert audit["missing_year"] is True
        assert audit["requires_confirmation"] is True
        assert "missing the year" in audit["warning_message"]


class TestPlannerDateGuard:
    """Tests that the planning engine prevents countdown schedules for outdated/unverified dates."""

    def test_planner_prevents_active_countdown_for_past_date(self):
        # Stored memory in DB is Friday, March 21, 2025
        plan_result = get_current_plan(subject="DBMS")

        # Plan must be in NEEDS_CONFIRMATION state
        assert plan_result["plan_status"] == "NEEDS_CONFIRMATION"
        assert plan_result["exam_status"] == "PAST_OUTDATED"
        assert plan_result["requires_confirmation"] is True
        assert plan_result["prevent_calendar_alerts"] is True
        assert "already passed" in plan_result["warning"]

        # Timeline cards should NOT be an urgent active exam countdown
        days = plan_result["plan"]
        assert len(days) == 4
        exam_card = days[-1]
        assert exam_card["status"] == "Needs Confirmation"
        assert "Outdated" in exam_card["date"]
        assert "Unconfirmed" in exam_card["sessions"][0]["status"]

    def test_confirm_exam_date_validation_rejects_past_date(self):
        # Attempting to confirm a date in the past must raise ValueError
        with pytest.raises(ValueError, match="Cannot schedule an exam in the past"):
            confirm_or_update_exam_date("DBMS", "2021-05-10")

    def test_confirm_exam_date_updates_plan_and_database(self):
        now = get_now()
        upcoming_date = (now + timedelta(days=14)).strftime("%Y-%m-%d")

        # Confirm upcoming date
        updated = confirm_or_update_exam_date("DBMS", upcoming_date, source="Student UI Confirmation")

        assert updated["plan_status"] == "CONFIRMED"
        assert updated["exam_status"] == "VALID_FUTURE"
        assert updated["requires_confirmation"] is False
        assert updated["prevent_calendar_alerts"] is False

        # Verify DB was updated
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM personal_memories WHERE category = 'Exams' AND title LIKE '%DBMS%'")
        row = cursor.fetchone()
        conn.close()

        assert row is not None
        parsed_db = parse_date_string(row["content"])
        assert parsed_db["is_valid"] is True
        assert parsed_db["iso_date"] == upcoming_date
        assert "Student UI Confirmation" in row["source"]

        # Reset DB back to seed for other test cases
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE personal_memories SET content = ?, confidence = ?, source = ?, date = ? WHERE id = 'mem-1'",
            ('DBMS exam is scheduled for Friday, March 21, 2025.', '98%', 'Voice Input / Calendar', '2025-03-16')
        )
        conn.commit()
        conn.close()


class TestTimezoneAndConsistency:
    """Verifies timezone adherence and consistent dates across components."""

    def test_timezone_is_configured(self):
        tz = get_tz()
        assert str(tz) == "Asia/Kolkata"

    def test_system_time_context_has_all_required_keys(self):
        ctx = get_system_time_context()
        for k in ["iso_datetime", "day_of_week", "date_str", "short_date", "display_date", "today_schedule_header", "time_str", "timezone"]:
            assert k in ctx
            assert ctx[k] is not None

    def test_date_boundary_in_kolkata(self):
        now = get_now()
        ctx = get_system_time_context()
        assert ctx["short_date"] == now.strftime("%Y-%m-%d")
        assert ctx["timezone"] == "Asia/Kolkata"

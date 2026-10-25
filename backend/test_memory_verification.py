"""
Comprehensive Test Suite for ASTRA Memory Verification & Metric Service

Validates:
  1. Missing metric values (None, empty string, missing keys)
  2. Invalid metric values (arbitrary text, negative/out-of-range percentages, non-string types)
  3. Legacy metric values ('98%', '95%', '92%', '100%')
  4. Valid metric values ('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW', case-insensitive)
  5. Distinction between extraction fidelity/source and temporal validity/currency
  6. Migration and database preservation (legacy data remains intact)
  7. Accurate explicit naming and explanatory helper descriptions
"""

import pytest
import sqlite3
import os
import sys
from datetime import date, timedelta

# Add backend directory to path
sys.path.insert(0, os.path.dirname(__file__))

from database import get_db, init_db
from memory_service import (
    resolve_verification_status,
    audit_and_format_memory,
    normalize_status_string,
    is_legacy_percentage,
    STATUS_METADATA
)
from action_engine import add_personal_memory_action
from planner_service import confirm_or_update_exam_date
from time_service import get_now


class TestMetricResolution:
    """Tests resolution of memory verification status across edge cases."""

    # 1. Missing metric values
    def test_missing_metric_values(self):
        # None value
        res1 = resolve_verification_status(raw_status=None, legacy_confidence=None)
        assert res1["status"] == "UNVERIFIED"
        assert res1["label"] == "Unverified"
        assert res1["is_calibrated_percentage"] is False
        assert "Unverified" in res1["tooltip"]

        # Empty string
        res2 = resolve_verification_status(raw_status="", legacy_confidence="")
        assert res2["status"] == "UNVERIFIED"

        # Whitespace
        res3 = resolve_verification_status(raw_status="   ", legacy_confidence="   ")
        assert res3["status"] == "UNVERIFIED"

    # 2. Invalid metric values
    def test_invalid_metric_values(self):
        # Arbitrary strings
        res1 = resolve_verification_status(raw_status="invalid_status", legacy_confidence="random_score")
        assert res1["status"] == "UNVERIFIED"
        assert res1["label"] == "Unverified"
        assert res1["is_calibrated_percentage"] is False

        # Negative or malformed numbers
        res2 = resolve_verification_status(raw_status=None, legacy_confidence="-5%")
        assert res2["status"] == "UNVERIFIED"

        # Non-string types
        res3 = resolve_verification_status(raw_status=12345, legacy_confidence=None)
        assert res3["status"] == "UNVERIFIED"

        res4 = resolve_verification_status(raw_status=None, legacy_confidence=object())
        assert res4["status"] == "UNVERIFIED"

    # 3. Legacy metric values
    def test_legacy_metric_values(self):
        # Legacy 98% (seed value from voice ingestion)
        res_98 = resolve_verification_status(raw_status=None, legacy_confidence="98%")
        assert res_98["status"] == "UNVERIFIED"
        assert res_98["legacy_confidence"] == "98%"
        assert res_98["is_calibrated_percentage"] is False
        assert res_98["label"] == "Unverified"

        # Legacy 95% (seed value from quiz performance)
        res_95 = resolve_verification_status(raw_status=None, legacy_confidence="95%")
        assert res_95["status"] == "UNVERIFIED"
        assert res_95["legacy_confidence"] == "95%"

        # Legacy 92% (seed value from schedule analysis)
        res_92 = resolve_verification_status(raw_status=None, legacy_confidence="92%")
        assert res_92["status"] == "UNVERIFIED"

        # Legacy 100% (from user confirmation action)
        res_100 = resolve_verification_status(raw_status=None, legacy_confidence="100%")
        assert res_100["status"] == "VERIFIED"
        assert res_100["label"] == "Verified"

    # 4. Valid metric values
    def test_valid_metric_values(self):
        # Exact canonical uppercase
        for stat in ["VERIFIED", "UNVERIFIED", "NEEDS_REVIEW"]:
            res = resolve_verification_status(raw_status=stat)
            assert res["status"] == stat

        # Lowercase and mixed-case
        res_v = resolve_verification_status(raw_status="verified")
        assert res_v["status"] == "VERIFIED"
        assert res_v["label"] == "Verified"

        res_u = resolve_verification_status(raw_status="Unverified")
        assert res_u["status"] == "UNVERIFIED"

        res_nr = resolve_verification_status(raw_status="needs_review")
        assert res_nr["status"] == "NEEDS_REVIEW"
        assert res_nr["label"] == "Needs Review"

        # With spaces instead of underscores
        res_spaces = resolve_verification_status(raw_status="Needs Review")
        assert res_spaces["status"] == "NEEDS_REVIEW"


class TestExtractionVsCurrencyDistinction:
    """
    Tests distinction between confidence in extracting a statement
    versus whether that statement is current or true.
    """

    def test_past_date_forces_needs_review_regardless_of_extraction_fidelity(self):
        # A statement accurately extracted with 98% mock confidence in 2025
        # but the date has passed -> must be marked NEEDS_REVIEW, not Verified or 98%
        date_audit = {
            "status": "PAST_OUTDATED",
            "status_label": "Past Exam Date",
            "parsed_date": "2025-03-21",
            "is_valid": True,
            "missing_year": False
        }

        res = resolve_verification_status(
            raw_status="VERIFIED",
            legacy_confidence="98%",
            date_audit=date_audit,
            source="Voice Input / Calendar"
        )

        assert res["status"] == "NEEDS_REVIEW"
        assert res["label"] == "Needs Review"
        assert res["is_outdated"] is True
        assert "outdated or incomplete details" in res["tooltip"].lower()

    def test_missing_year_forces_needs_review(self):
        date_audit = {
            "status": "NEEDS_CONFIRMATION",
            "status_label": "Needs Confirmation (Missing Year)",
            "parsed_date": None,
            "is_valid": False,
            "missing_year": True
        }

        res = resolve_verification_status(
            raw_status=None,
            legacy_confidence="98%",
            date_audit=date_audit,
            source="Voice / Chat"
        )

        assert res["status"] == "NEEDS_REVIEW"
        assert res["missing_year"] is True

    def test_student_confirmation_with_future_date_is_verified(self):
        today = get_now().date()
        future_iso = (today + timedelta(days=30)).isoformat()
        date_audit = {
            "status": "VALID_FUTURE",
            "status_label": "Confirmed Future",
            "parsed_date": future_iso,
            "is_valid": True,
            "missing_year": False
        }

        res = resolve_verification_status(
            raw_status="VERIFIED",
            date_audit=date_audit,
            source="Student Confirmation"
        )

        assert res["status"] == "VERIFIED"
        assert res["label"] == "Verified"
        assert res["is_outdated"] is False


class TestAuditAndFormatMemory:
    """Tests comprehensive memory auditing and dictionary formatting."""

    def test_audit_preserves_legacy_and_adds_explicit_metrics(self):
        today = date(2026, 10, 22)
        raw_memory = {
            "id": "mem-1",
            "category": "Exams",
            "title": "DBMS Final Exam Date",
            "content": "DBMS exam is scheduled for Friday, March 21, 2025.",
            "confidence": "98%",
            "source": "Voice Input / Calendar",
            "date": "2025-03-16",
            "verification_status": None
        }

        audited = audit_and_format_memory(raw_memory, reference_date=today)

        # Verified status correctly evaluates to NEEDS_REVIEW due to expired date
        assert audited["verification_status"] == "NEEDS_REVIEW"
        assert audited["status_label"] == "Needs Review"
        assert audited["metric_name"] == "Verification Status"
        assert audited["is_calibrated_percentage"] is False

        # Preserves legacy values
        assert audited["legacy_confidence"] == "98%"
        assert audited["legacy_confidence_raw"] == "98%"

        # Generates explicit tooltips and descriptions
        assert "Needs Review:" in audited["status_tooltip"]
        assert "past exam date" in audited["status_tooltip"].lower()


class TestDatabaseMigrationAndPersistence:
    """Tests SQLite schema migration and data preservation."""

    def test_database_preserves_existing_memories(self):
        conn = get_db()
        cursor = conn.cursor()

        # Check table columns
        cursor.execute("PRAGMA table_info(personal_memories)")
        cols = {row["name"] for row in cursor.fetchall()}
        assert "verification_status" in cols
        assert "confidence" in cols
        assert "content" in cols
        assert "source" in cols

        # Query existing memories
        cursor.execute("SELECT * FROM personal_memories WHERE id = 'mem-1'")
        row = dict(cursor.fetchone())
        assert row["id"] == "mem-1"
        assert row["content"] == "DBMS exam is scheduled for Friday, March 21, 2025."
        # Stored data is intact
        assert row["source"] == "Voice Input / Calendar"
        assert row["date"] == "2025-03-16"

        conn.close()

    def test_add_memory_action_sets_correct_verification_status(self):
        # Adding an unverified note
        res = add_personal_memory_action(
            category="Preferences",
            title="Night Study Habit",
            content="Prefers quiet sessions after 10 PM.",
            source="Chat Observation"
        )

        assert res["success"] is True
        assert res["verification_status"] == "UNVERIFIED"
        assert res["status_label"] == "Unverified"

        # Verify in DB
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM personal_memories WHERE id = ?", (res["memory_id"],))
        stored = dict(cursor.fetchone())
        assert stored["verification_status"] == "UNVERIFIED"
        assert stored["confidence"] == "Unverified"
        conn.close()

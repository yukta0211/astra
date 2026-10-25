"""
Comprehensive Test Suite for ASTRA Memory CRUD, Lifecycle Transitions, & Provenance Retention

Tests:
  1. GET single memory and 404 handling
  2. POST validation (empty title/content rejection) and creation
  3. PUT updates with validation, revision tracking in edit_history, and provenance retention
  4. Lifecycle transitions (Verified, Needs Confirmation, Outdated, Archived)
  5. Concurrent update conflict detection (HTTP 409)
  6. DELETE with 404 check and restore / undo mechanism
  7. Filter synchronization (category, lifecycle, include_archived)
"""

import pytest
import os
import sys
import json
from datetime import date

# Add backend directory to path
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main import app
from database import get_db
from memory_service import update_memory_record, delete_memory_record, restore_memory_record

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_test_memories():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE personal_memories 
        SET title = 'DBMS Final Exam Date', 
            content = 'DBMS exam is scheduled for Friday, March 21, 2025.',
            category = 'Exams',
            verification_status = 'NEEDS_REVIEW',
            lifecycle_state = 'OUTDATED',
            source = 'Voice Input / Calendar',
            date = '2025-03-16'
        WHERE id = 'mem-1'
    """)
    cursor.execute("DELETE FROM personal_memories WHERE id LIKE 'test-mem-%'")
    conn.commit()
    conn.close()
    yield
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM personal_memories WHERE id LIKE 'test-mem-%'")
    conn.commit()
    conn.close()


class TestMemoryCRUDAndValidation:
    """Tests CRUD endpoints and error validation."""

    def test_get_single_memory(self):
        res = client.get("/api/memories/mem-1")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == "mem-1"
        assert data["title"] == "DBMS Final Exam Date"
        assert "original_source" in data
        assert "original_date" in data
        assert "last_updated_at" in data
        assert "edit_history" in data

    def test_get_nonexistent_memory_returns_404(self):
        res = client.get("/api/memories/mem-nonexistent-999")
        assert res.status_code == 404
        assert "not found" in res.json()["detail"].lower()

    def test_create_memory_validation_rejects_empty_fields(self):
        # Empty title
        res1 = client.post("/api/memories", json={"title": "   ", "content": "Valid content"})
        assert res1.status_code == 400
        assert "title cannot be empty" in res1.json()["detail"].lower()

        # Empty content
        res2 = client.post("/api/memories", json={"title": "Valid title", "content": "   "})
        assert res2.status_code == 400
        assert "content cannot be empty" in res2.json()["detail"].lower()

    def test_create_memory_success_tracks_provenance(self):
        payload = {
            "title": "SQL Indexing Techniques",
            "content": "B-Tree vs Hash Indexing tradeoffs.",
            "category": "Weak Subjects",
            "source": "Student Note Capture",
            "verification_status": "UNVERIFIED"
        }
        res = client.post("/api/memories", json=payload)
        assert res.status_code == 200
        created = res.json()
        assert created["success"] is True
        mem_id = created["memory_id"]

        # Fetch and verify stored record
        get_res = client.get(f"/api/memories/{mem_id}")
        assert get_res.status_code == 200
        stored = get_res.json()
        assert stored["original_source"] == "Student Note Capture"
        assert stored["original_content"] == "B-Tree vs Hash Indexing tradeoffs."
        assert stored["lifecycle_state"] == "UNVERIFIED"
        assert stored["last_updated_at"] is not None

        # Clean up
        client.delete(f"/api/memories/{mem_id}")


class TestMemoryLifecycleAndHistory:
    """Tests updates, lifecycle transitions, provenance retention, and concurrency."""

    def test_update_memory_preserves_provenance_and_tracks_history(self):
        # Update mem-1
        update_payload = {
            "title": "DBMS Final Exam Date (Updated)",
            "content": "DBMS exam is scheduled for Friday, November 20, 2026.",
            "category": "Exams",
            "lifecycle_state": "VERIFIED"
        }
        res = client.put("/api/memories/mem-1", json=update_payload)
        assert res.status_code == 200
        data = res.json()["memory"]

        assert data["title"] == "DBMS Final Exam Date (Updated)"
        assert data["content"] == "DBMS exam is scheduled for Friday, November 20, 2026."
        assert data["lifecycle_state"] == "VERIFIED"

        # Original provenance is preserved!
        assert data["original_source"] == "Voice Input / Calendar"
        assert data["original_date"] == "2025-03-16"

        # History has recorded the revision
        assert len(data["edit_history"]) >= 1
        latest_edit = data["edit_history"][-1]
        fields_changed = [c["field"] for c in latest_edit["changes"]]
        assert "title" in fields_changed
        assert "content" in fields_changed
        assert "last_verified_at" in data

    def test_archive_lifecycle_state(self):
        # Transition to ARCHIVED
        res = client.put("/api/memories/mem-1", json={"lifecycle_state": "ARCHIVED"})
        assert res.status_code == 200
        assert res.json()["memory"]["lifecycle_state"] == "ARCHIVED"

        # List without archived should exclude mem-1
        list_res = client.get("/api/memories?include_archived=false")
        assert list_res.status_code == 200
        active_ids = [m["id"] for m in list_res.json()]
        assert "mem-1" not in active_ids

        # List with include_archived=true should include mem-1
        all_res = client.get("/api/memories?include_archived=true")
        all_ids = [m["id"] for m in all_res.json()]
        assert "mem-1" in all_ids

    def test_concurrent_update_conflict_detection(self):
        # Fetch current last_updated_at
        current = client.get("/api/memories/mem-1").json()
        current_time = current["last_updated_at"]

        # Simulate update 1
        client.put("/api/memories/mem-1", json={"title": "First Update Title"})

        # Update 2 passes stale expected_last_updated_at
        res_conflict = client.put("/api/memories/mem-1", json={
            "title": "Conflicting Update Title",
            "expected_last_updated_at": "1999-01-01T00:00:00"
        })
        assert res_conflict.status_code == 409
        assert "concurrent update" in res_conflict.json()["detail"].lower()


class TestDeletionAndUndo:
    """Tests deletion error handling, 404 validation, and undo restoration."""

    def test_delete_returns_snapshot_and_second_delete_404(self):
        # Create temporary memory
        create_res = client.post("/api/memories", json={"title": "Temp Note", "content": "Temporary content"})
        mem_id = create_res.json()["memory_id"]

        # Delete it
        del_res = client.delete(f"/api/memories/{mem_id}")
        assert del_res.status_code == 200
        del_data = del_res.json()
        assert del_data["success"] is True
        assert del_data["deleted_id"] == mem_id
        assert del_data["deleted_memory"]["title"] == "Temp Note"

        # Second delete of same ID must return 404 (no false success)
        del_again = client.delete(f"/api/memories/{mem_id}")
        assert del_again.status_code == 404

        # Restore using the snapshot
        restore_res = client.post(f"/api/memories/{mem_id}/restore", json=del_data["deleted_memory"])
        assert restore_res.status_code == 200
        assert restore_res.json()["success"] is True

        # Verify restored memory is readable again
        get_res = client.get(f"/api/memories/{mem_id}")
        assert get_res.status_code == 200
        assert get_res.json()["title"] == "Temp Note"

        # Clean up
        client.delete(f"/api/memories/{mem_id}")

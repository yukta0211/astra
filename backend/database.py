import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "astra.db")

_schema_migrated = False

def ensure_schema(conn):
    global _schema_migrated
    if _schema_migrated:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(personal_memories)")
        columns = [row["name"] for row in cursor.fetchall()]
        if columns:
            if "verification_status" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN verification_status TEXT DEFAULT 'UNVERIFIED'")
            if "lifecycle_state" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN lifecycle_state TEXT DEFAULT 'UNVERIFIED'")
            if "last_verified_at" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN last_verified_at TEXT DEFAULT NULL")
            if "last_updated_at" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN last_updated_at TEXT DEFAULT NULL")
            if "original_source" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN original_source TEXT DEFAULT NULL")
            if "original_date" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN original_date TEXT DEFAULT NULL")
            if "original_content" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN original_content TEXT DEFAULT NULL")
            if "edit_history" not in columns:
                cursor.execute("ALTER TABLE personal_memories ADD COLUMN edit_history TEXT DEFAULT '[]'")

            # Backfill initial provenance & timestamps for existing rows
            cursor.execute("UPDATE personal_memories SET original_source = source WHERE original_source IS NULL")
            cursor.execute("UPDATE personal_memories SET original_date = date WHERE original_date IS NULL")
            cursor.execute("UPDATE personal_memories SET original_content = content WHERE original_content IS NULL")
            cursor.execute("UPDATE personal_memories SET last_updated_at = date WHERE last_updated_at IS NULL")
            cursor.execute("""
                UPDATE personal_memories
                SET verification_status = CASE
                    WHEN confidence = '100%' OR source IN ('Student Confirmation', 'Memory Store Update') THEN 'VERIFIED'
                    WHEN category = 'Exams' AND (content LIKE '%2025%' OR title LIKE '%2025%') THEN 'NEEDS_REVIEW'
                    ELSE 'UNVERIFIED'
                END
                WHERE verification_status IS NULL OR verification_status = ''
            """)
            cursor.execute("""
                UPDATE personal_memories
                SET lifecycle_state = CASE
                    WHEN verification_status = 'VERIFIED' OR confidence = '100%' OR source IN ('Student Confirmation', 'Memory Store Update') THEN 'VERIFIED'
                    WHEN category = 'Exams' AND (content LIKE '%2025%' OR title LIKE '%2025%') THEN 'OUTDATED'
                    ELSE 'UNVERIFIED'
                END
                WHERE lifecycle_state IS NULL OR lifecycle_state = ''
            """)
            cursor.execute("""
                UPDATE personal_memories
                SET last_verified_at = date
                WHERE (lifecycle_state = 'VERIFIED' OR verification_status = 'VERIFIED') AND last_verified_at IS NULL
            """)
            conn.commit()
        _schema_migrated = True
    except Exception:
        pass

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Personal Memories Table (Long-Term Memory)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS personal_memories (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence TEXT NOT NULL,
        source TEXT NOT NULL,
        date TEXT NOT NULL
    )
    """)

    # 2. Tasks Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtext TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        accent TEXT NOT NULL
    )
    """)

    # 3. Calendar Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        time TEXT NOT NULL,
        duration TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        dot_color TEXT NOT NULL
    )
    """)

    # 4. Documents & RAG Chunks Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        total_pages INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        page INTEGER NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding_preview TEXT NOT NULL,
        FOREIGN KEY(doc_id) REFERENCES documents(id)
    )
    """)

    # 5. Recent Activity Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recent_activities (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        time TEXT NOT NULL,
        dot_color TEXT NOT NULL
    )
    """)

    conn.commit()
    ensure_schema(conn)

    # Seed Initial Data if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM personal_memories")
    if cursor.fetchone()["cnt"] == 0:
        seed_data(conn)

    conn.close()

def seed_data(conn):
    cursor = conn.cursor()
    
    # Seed Memories with explicit verification statuses, lifecycle states, and preserved legacy provenance
    memories = [
        ('mem-1', 'Exams', 'DBMS Final Exam Date', 'DBMS exam is scheduled for Friday, March 21, 2025.', 'Needs Review', 'Voice Input / Calendar', '2025-03-16', 'NEEDS_REVIEW', 'OUTDATED', None, '2025-03-16', 'Voice Input / Calendar', '2025-03-16', 'DBMS exam is scheduled for Friday, March 21, 2025.', '[]'),
        ('mem-2', 'Weak Subjects', 'Normalization Weakness', 'Struggles with 3NF vs BCNF decomposition and identifying Lossless Join properties.', 'Unverified', 'Quiz Mode Performance', '2025-03-17', 'UNVERIFIED', 'UNVERIFIED', None, '2025-03-17', 'Quiz Mode Performance', '2025-03-17', 'Struggles with 3NF vs BCNF decomposition and identifying Lossless Join properties.', '[]'),
        ('mem-3', 'Preferences', 'Study Time Preference', 'Prefers deep focus revision slots in the evening between 19:00 and 21:00.', 'Unverified', 'Schedule Engine Analysis', '2025-03-15', 'UNVERIFIED', 'UNVERIFIED', None, '2025-03-15', 'Schedule Engine Analysis', '2025-03-15', 'Prefers deep focus revision slots in the evening between 19:00 and 21:00.', '[]')
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO personal_memories 
        (id, category, title, content, confidence, source, date, verification_status, lifecycle_state, last_verified_at, last_updated_at, original_source, original_date, original_content, edit_history) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, memories)

    # Seed Schedule
    schedule = [
        ('sch-1', '10:00 AM', '10:00 – 11:30', 'DBMS lecture', 'Lecture hall · C-204', '#00f2fe'),
        ('sch-2', '2:00 PM', '14:00 – 15:00', 'Project meeting', 'Product design team', '#a855f7'),
        ('sch-3', '7:00 PM', '19:00 – 21:00', 'DBMS revision', 'Focus session · No distractions', '#f59e0b')
    ]
    cursor.executemany("INSERT OR IGNORE INTO calendar_events VALUES (?, ?, ?, ?, ?, ?)", schedule)

    # Seed Tasks
    tasks = [
        ('task-1', 'Review normalization notes', 'DBMS · 2 hours', 0, '#00f2fe'),
        ('task-2', 'Submit project outline', 'Due today · 5:00 PM', 0, '#f59e0b'),
        ('task-3', 'Read transaction management', 'DBMS · 45 minutes', 1, '#a855f7')
    ]
    cursor.executemany("INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?)", tasks)

    # Seed Recent Activity
    activities = [
        ('act-1', 'DBMS Notes processed', '8:42 AM', '#00f2fe'),
        ('act-2', 'Remembered DBMS is a weak subject', 'Yesterday', '#a855f7'),
        ('act-3', 'Revision plan adjusted', 'Mon', '#f59e0b')
    ]
    cursor.executemany("INSERT OR IGNORE INTO recent_activities VALUES (?, ?, ?, ?)", activities)

    # Seed Document & Chunks
    from time_service import get_now
    cursor.execute("INSERT OR IGNORE INTO documents VALUES (?, ?, ?, ?, ?)", ('doc-dbms', 'DBMS_Notes_Normalization.pdf', get_now().strftime('%Y-%m-%d 08:42 AM'), 3, 6))
    
    chunks = [
        ('chk-1', 'doc-dbms', 1, 'First & Second Normal Forms (1NF, 2NF)', 
         'First Normal Form (1NF) requires that attributes contain atomic values with no repeating groups. Second Normal Form (2NF) builds on 1NF by requiring all non-key attributes to be fully functionally dependent on the entire primary key, eliminating partial dependencies.',
         '[0.024, -0.184, 0.492, 0.089, -0.312, 0.771, ... 768 dims]'),
        ('chk-2', 'doc-dbms', 1, 'Third Normal Form (3NF)', 
         'Third Normal Form (3NF) requires a relation to be in 2NF and have no transitive functional dependencies. Formally, for any non-trivial functional dependency X -> A, either X is a superkey or A is a prime attribute.',
         '[0.115, -0.042, 0.621, 0.140, -0.210, 0.814, ... 768 dims]'),
        ('chk-3', 'doc-dbms', 2, 'Boyce-Codd Normal Form (BCNF)', 
         'BCNF is a stricter version of 3NF. A relation is in BCNF if for every non-trivial functional dependency X -> A, X MUST be a superkey. Unlike 3NF, BCNF does not allow A to be a prime attribute if X is not a superkey.',
         '[0.204, 0.081, 0.551, -0.012, -0.402, 0.901, ... 768 dims]'),
        ('chk-4', 'doc-dbms', 2, 'Lossless-Join & Dependency Preservation', 
         'A decomposition of relation R into R1 and R2 is lossless-join if and only if R1 ∩ R2 -> R1 or R1 ∩ R2 -> R2. Not all BCNF decompositions preserve functional dependencies, whereas 3NF decompositions can always guarantee dependency preservation.',
         '[-0.045, 0.212, 0.388, 0.310, -0.119, 0.654, ... 768 dims]'),
        ('chk-5', 'doc-dbms', 3, 'Fourth Normal Form (4NF) & Multi-Valued Dependencies', 
         'Fourth Normal Form (4NF) addresses multi-valued dependencies (MVD). A relation is in 4NF if for every non-trivial MVD X ->-> Y, X is a superkey for R.',
         '[0.088, -0.112, 0.419, 0.005, -0.278, 0.710, ... 768 dims]'),
        ('chk-6', 'doc-dbms', 3, 'Exam Key Formulas & Theorems', 
         'Key Exam Rule: To check BCNF decomposition: 1) Find candidate keys. 2) Check each FD X->Y. If X is not a superkey, decompose into R1(X, Y) and R2(R - Y). Repeat until all relations satisfy BCNF.',
         '[0.310, 0.120, 0.702, -0.090, -0.150, 0.888, ... 768 dims]')
    ]
    cursor.executemany("INSERT OR IGNORE INTO document_chunks VALUES (?, ?, ?, ?, ?, ?)", chunks)

    conn.commit()

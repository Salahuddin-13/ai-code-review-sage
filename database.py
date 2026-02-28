"""
AI Code Review Sage — Database Module
SQLite database for user authentication and history persistence.
"""

import sqlite3
import os
import hashlib
import secrets
import time
import json
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "sage.db"

# ──────────────────────────────────────────────
# Database Initialization
# ──────────────────────────────────────────────

def get_db():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            language TEXT NOT NULL,
            code TEXT NOT NULL,
            result_preview TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")

    conn.commit()
    conn.close()
    print("✅ Database initialized")


# ──────────────────────────────────────────────
# Password Hashing (using hashlib + salt, no bcrypt dependency)
# ──────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash password with salt using SHA-256."""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash."""
    try:
        salt, hashed = stored_hash.split(":")
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed
    except (ValueError, AttributeError):
        return False


# ──────────────────────────────────────────────
# Token Management
# ──────────────────────────────────────────────

def generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(48)


def create_session(user_id: int) -> str:
    """Create a new session token for a user (valid for 7 days)."""
    conn = get_db()
    token = generate_token()
    expires_at = datetime.now() + timedelta(days=7)

    conn.execute(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
        (user_id, token, expires_at.isoformat())
    )

    # Clean up old expired sessions
    conn.execute(
        "DELETE FROM sessions WHERE expires_at < ?",
        (datetime.now().isoformat(),)
    )

    conn.commit()
    conn.close()
    return token


def validate_token(token: str) -> dict | None:
    """Validate a session token and return user info if valid."""
    conn = get_db()
    row = conn.execute(
        """SELECT u.id, u.name, u.email, s.expires_at
           FROM sessions s JOIN users u ON s.user_id = u.id
           WHERE s.token = ?""",
        (token,)
    ).fetchone()
    conn.close()

    if not row:
        return None

    # Check expiry
    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now() > expires_at:
        # Token expired, clean up
        delete_session(token)
        return None

    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def delete_session(token: str):
    """Delete a session (logout)."""
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


# ──────────────────────────────────────────────
# User Management
# ──────────────────────────────────────────────

def create_user(name: str, email: str, password: str) -> dict | None:
    """Register a new user. Returns user dict or None if email exists."""
    conn = get_db()
    try:
        password_hash = hash_password(password)
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email.lower().strip(), password_hash)
        )
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return {"id": user_id, "name": name, "email": email.lower().strip()}
    except sqlite3.IntegrityError:
        conn.close()
        return None


def authenticate_user(email: str, password: str) -> dict | None:
    """Authenticate user with email and password. Returns user dict or None."""
    conn = get_db()
    row = conn.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?",
        (email.lower().strip(),)
    ).fetchone()
    conn.close()

    if not row:
        return None

    if not verify_password(password, row["password_hash"]):
        return None

    return {"id": row["id"], "name": row["name"], "email": row["email"]}


# ──────────────────────────────────────────────
# History Management
# ──────────────────────────────────────────────

def save_history(user_id: int, action: str, language: str, code: str, result_preview: str = "") -> int:
    """Save a history entry. Returns the entry ID."""
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO history (user_id, action, language, code, result_preview) VALUES (?, ?, ?, ?, ?)",
        (user_id, action, language, code[:5000], result_preview[:1000])
    )
    entry_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return entry_id


def get_user_history(user_id: int, limit: int = 50) -> list:
    """Get history for a user, most recent first."""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, action, language, code, result_preview, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_history_item(user_id: int, item_id: int) -> bool:
    """Delete a history item. Returns True if deleted."""
    conn = get_db()
    cursor = conn.execute(
        "DELETE FROM history WHERE id = ? AND user_id = ?",
        (item_id, user_id)
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def clear_user_history(user_id: int):
    """Clear all history for a user."""
    conn = get_db()
    conn.execute("DELETE FROM history WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()

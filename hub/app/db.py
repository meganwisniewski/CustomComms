"""SQLite-backed message store with a delivery-queue lifecycle.

Outbound messages are enqueued (status='queued') and delivered by a background
worker with retries; inbound messages are logged directly (status='received').
Stdlib sqlite3 only, serialized through a lock — plenty for personal-comms volume.

Status lifecycle for outbound:
    queued  -> sent      (delivered)
    queued  -> queued    (retry scheduled; next_attempt_at in the future)
    queued  -> failed    (permanent error hit max_attempts)
"""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    direction       TEXT NOT NULL,            -- 'out' | 'in'
    channel         TEXT NOT NULL,
    peer            TEXT,                      -- recipient (out) or sender (in)
    body            TEXT NOT NULL,
    title           TEXT,
    status          TEXT NOT NULL,            -- queued | sent | failed | received
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,                      -- ISO ts; when the worker may next try
    provider_id     TEXT,
    error           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_due
    ON messages(status, next_attempt_at);
"""


def init(db_path: str) -> None:
    global _conn
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(db_path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    with _lock:
        _conn.executescript(_SCHEMA)
        _conn.commit()


def _c() -> sqlite3.Connection:
    if _conn is None:
        raise RuntimeError("db.init() must be called before use")
    return _conn


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# --- writes -----------------------------------------------------------------

def enqueue(*, channel: str, peer: str | None, body: str, title: str | None = None) -> int:
    """Add an outbound message to the queue, due immediately."""
    now = _iso(_now())
    with _lock:
        cur = _c().execute(
            """
            INSERT INTO messages
                (direction, channel, peer, body, title, status, attempts,
                 next_attempt_at, created_at, updated_at)
            VALUES ('out', ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
            """,
            (channel, peer, body, title, now, now, now),
        )
        _c().commit()
        return int(cur.lastrowid)


def log_inbound(*, channel: str, peer: str | None, body: str,
                provider_id: str | None = None) -> int:
    now = _iso(_now())
    with _lock:
        cur = _c().execute(
            """
            INSERT INTO messages
                (direction, channel, peer, body, status, attempts,
                 provider_id, created_at, updated_at)
            VALUES ('in', ?, ?, ?, 'received', 0, ?, ?, ?)
            """,
            (channel, peer, body, provider_id, now, now),
        )
        _c().commit()
        return int(cur.lastrowid)


def claim_due(limit: int = 20) -> list[dict[str, Any]]:
    """Return queued outbound messages whose next_attempt_at is due."""
    now = _iso(_now())
    with _lock:
        rows = _c().execute(
            """
            SELECT * FROM messages
            WHERE direction='out' AND status='queued'
              AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
            ORDER BY id ASC LIMIT ?
            """,
            (now, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_sent(msg_id: int, provider_id: str | None) -> None:
    now = _iso(_now())
    with _lock:
        _c().execute(
            """UPDATE messages
               SET status='sent', attempts=attempts+1, provider_id=?,
                   error=NULL, next_attempt_at=NULL, updated_at=?
               WHERE id=?""",
            (provider_id, now, msg_id),
        )
        _c().commit()


def mark_failed(msg_id: int, error: str | None) -> None:
    now = _iso(_now())
    with _lock:
        _c().execute(
            """UPDATE messages
               SET status='failed', attempts=attempts+1, error=?,
                   next_attempt_at=NULL, updated_at=?
               WHERE id=?""",
            (error, now, msg_id),
        )
        _c().commit()


def reschedule(msg_id: int, delay_seconds: float, error: str | None) -> None:
    """Keep the message queued and set the next attempt time."""
    now = _now()
    with _lock:
        _c().execute(
            """UPDATE messages
               SET status='queued', attempts=attempts+1, error=?,
                   next_attempt_at=?, updated_at=?
               WHERE id=?""",
            (error, _iso(now + timedelta(seconds=delay_seconds)), _iso(now), msg_id),
        )
        _c().commit()


# --- reads ------------------------------------------------------------------

def recent(limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
    with _lock:
        if status:
            rows = _c().execute(
                "SELECT * FROM messages WHERE status=? ORDER BY id DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = _c().execute(
                "SELECT * FROM messages ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
    return [dict(r) for r in rows]


def get(msg_id: int) -> dict[str, Any] | None:
    with _lock:
        row = _c().execute("SELECT * FROM messages WHERE id=?", (msg_id,)).fetchone()
    return dict(row) if row else None

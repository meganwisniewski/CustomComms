"""Tiny SQLite-backed message log.

Deliberately dependency-free (stdlib sqlite3) so it stays light on the Pi.
Access is serialized through a module-level connection guarded by a lock;
the hub's write volume is low (personal comms), so this is plenty.
"""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    direction   TEXT NOT NULL,              -- 'out' | 'in'
    channel     TEXT NOT NULL,
    peer        TEXT,                        -- recipient (out) or sender (in)
    body        TEXT NOT NULL,
    status      TEXT NOT NULL,              -- 'sent' | 'failed' | 'received'
    provider_id TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
"""


def init(db_path: str) -> None:
    global _conn
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(db_path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    with _lock:
        _conn.executescript(_SCHEMA)
        _conn.commit()


def _require_conn() -> sqlite3.Connection:
    if _conn is None:
        raise RuntimeError("db.init() must be called before use")
    return _conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_message(
    *,
    direction: str,
    channel: str,
    peer: str | None,
    body: str,
    status: str,
    provider_id: str | None = None,
    error: str | None = None,
) -> int:
    conn = _require_conn()
    with _lock:
        cur = conn.execute(
            """
            INSERT INTO messages
                (direction, channel, peer, body, status, provider_id, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (direction, channel, peer, body, status, provider_id, error, _now()),
        )
        conn.commit()
        return int(cur.lastrowid)


def recent(limit: int = 50) -> list[dict[str, Any]]:
    conn = _require_conn()
    with _lock:
        rows = conn.execute(
            "SELECT * FROM messages ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]

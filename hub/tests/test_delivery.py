"""Unit tests for the delivery queue decision logic (no network).

Run from the hub/ directory:

    python -m pytest tests/ -q      # if pytest is installed
    python tests/test_delivery.py   # or standalone
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile

# Deterministic, immediate retries.
os.environ.setdefault("HUB_DATABASE_PATH", os.path.join(tempfile.mkdtemp(), "t.db"))
os.environ.setdefault("CHANNELS_ENABLED", "ntfy")
os.environ.setdefault("HUB_MAX_ATTEMPTS", "3")
os.environ.setdefault("HUB_BACKOFF_BASE_SECONDS", "0")
os.environ.setdefault("HUB_BACKOFF_MAX_SECONDS", "0")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db  # noqa: E402
from app.channels.base import Channel, SendResult  # noqa: E402
from app.delivery import deliver  # noqa: E402

db.init(os.environ["HUB_DATABASE_PATH"])


class Stub(Channel):
    name = "stub"

    def __init__(self, result: SendResult, configured: bool = True):
        self._r = result
        self._configured = configured

    @property
    def configured(self) -> bool:
        return self._configured

    async def send(self, to, body, *, title=None):
        if not self._configured:
            raise AssertionError("send() must not be called on an unconfigured channel")
        return self._r


async def _run(msg_id, channel, rounds=1):
    status = None
    for _ in range(rounds):
        row = db.get(msg_id)
        if row["status"] in ("sent", "failed"):
            break
        status = await deliver(row, channel)
    return status


async def main():
    # success -> sent
    mid = db.enqueue(channel="stub", peer="x", body="ok")
    assert await deliver(db.get(mid), Stub(SendResult(ok=True, provider_id="p1"))) == "sent"
    assert db.get(mid)["status"] == "sent"

    # transient -> queued forever, never fails
    mid = db.enqueue(channel="stub", peer="x", body="wait")
    ch = Stub(SendResult(ok=False, transient=True, error="unreachable"))
    for _ in range(20):
        assert await deliver(db.get(mid), ch) == "queued"
    assert db.get(mid)["status"] == "queued"
    assert db.get(mid)["attempts"] == 20

    # permanent -> fails at HUB_MAX_ATTEMPTS
    mid = db.enqueue(channel="stub", peer="x", body="bad")
    ch = Stub(SendResult(ok=False, transient=False, error="bad recipient"))
    assert await _run(mid, ch, rounds=5) == "failed"
    assert db.get(mid)["attempts"] == 3

    # unconfigured / missing channel -> queued (send not called)
    mid = db.enqueue(channel="stub", peer="x", body="noconf")
    assert await deliver(db.get(mid), Stub(SendResult(ok=True), configured=False)) == "queued"
    mid = db.enqueue(channel="gone", peer="x", body="none")
    assert await deliver(db.get(mid), None) == "queued"

    print("ALL DELIVERY TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())

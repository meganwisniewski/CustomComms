"""Delivery logic for queued outbound messages.

Kept separate from the FastAPI app and the worker loop so the decision logic
(deliver -> sent / retry / fail) can be unit-tested with a stub channel.
"""
from __future__ import annotations

import json

from . import db
from .channels.base import Channel, SendResult
from .config import settings


def backoff_delay(attempts: int) -> float:
    """Exponential backoff, capped. attempts is the count *before* this attempt."""
    base = settings.hub_backoff_base_seconds
    cap = settings.hub_backoff_max_seconds
    # 2**attempts grows fast; cap keeps a down channel retrying at a steady cadence.
    return min(base * (2 ** min(attempts, 16)), cap)


async def _attempt(msg: dict, channel: Channel) -> SendResult:
    """Dispatch one queued row to the channel based on its kind."""
    kind = msg.get("kind") or "send"
    extras: dict = {}
    if msg.get("extras"):
        try:
            extras = json.loads(msg["extras"])
        except (ValueError, TypeError):
            extras = {}

    if kind == "react":
        return await channel.react(
            msg["peer"],
            extras.get("selected_guid"),
            extras.get("reaction"),
            part_index=extras.get("part_index", 0),
        )
    return await channel.send(
        msg["peer"],
        msg["body"],
        title=msg.get("title"),
        reply_to=extras.get("reply_to"),
        effect=extras.get("effect"),
        subject=extras.get("subject"),
    )


async def deliver(msg: dict, channel: Channel | None) -> str:
    """Attempt delivery of one queued message and record the outcome.

    Returns the resulting status: 'sent', 'queued' (rescheduled), or 'failed'.
    """
    msg_id = msg["id"]
    attempts = msg["attempts"]

    # Channel missing or not yet configured -> treat as transient (wait for it).
    if channel is None or not channel.configured:
        db.reschedule(msg_id, backoff_delay(attempts),
                      error=f"channel '{msg['channel']}' unavailable/unconfigured")
        return "queued"

    result = await _attempt(msg, channel)

    if result.ok:
        db.mark_sent(msg_id, result.provider_id)
        return "sent"

    if result.transient:
        # Retry indefinitely (capped cadence) — e.g. the Mac is asleep.
        db.reschedule(msg_id, backoff_delay(attempts), error=result.error)
        return "queued"

    # Permanent error: count it; give up once we hit the ceiling.
    if attempts + 1 >= settings.hub_max_attempts:
        db.mark_failed(msg_id, error=result.error)
        return "failed"
    db.reschedule(msg_id, backoff_delay(attempts), error=result.error)
    return "queued"

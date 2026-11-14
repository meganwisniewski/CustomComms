"""Request/response models for the hub API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SendRequest(BaseModel):
    channel: str = Field(..., description="Channel name, e.g. 'imessage' or 'ntfy'.")
    to: str | None = Field(
        None,
        description="Recipient/target for the channel (phone/handle/chat GUID/topic). "
        "May be omitted if the channel has a configured default.",
    )
    body: str = Field(..., min_length=1, description="Message text.")
    title: str | None = Field(None, description="Optional title (used by push channels).")
    # iMessage rich options (Private API). Ignored by channels that don't support them.
    reply_to: str | None = Field(
        None, description="iMessage: GUID of the message to reply to inline."
    )
    effect: str | None = Field(
        None, description="iMessage: screen/bubble effect, e.g. 'slam', 'confetti', 'gentle'."
    )
    subject: str | None = Field(
        None, description="iMessage: bold subject line shown above the message body."
    )


class ReactRequest(BaseModel):
    channel: str = Field(..., description="Channel name, e.g. 'imessage'.")
    to: str | None = Field(None, description="Chat GUID the target message belongs to.")
    target: str = Field(..., description="GUID of the message to react to (selectedMessageGuid).")
    reaction: str = Field(
        ...,
        description="One of: love, like, dislike, laugh, emphasize, question. "
        "Prefix with '-' to remove (e.g. '-love').",
    )
    part_index: int = Field(0, description="Message part to react to (default 0).")


class EnqueueResponse(BaseModel):
    id: int
    channel: str
    to: str | None
    status: str = "queued"


class MessageRecord(BaseModel):
    id: int
    direction: str
    channel: str
    peer: str | None
    body: str
    title: str | None = None
    status: str
    attempts: int
    next_attempt_at: str | None = None
    provider_id: str | None
    error: str | None
    kind: str = "send"
    extras: str | None = None
    created_at: str
    updated_at: str


class ChannelInfo(BaseModel):
    name: str
    configured: bool


class HealthResponse(BaseModel):
    status: str
    channels: dict[str, str]
    queued: int

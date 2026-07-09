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


class SendResponse(BaseModel):
    id: int
    channel: str
    to: str | None
    status: str
    provider_id: str | None = None
    error: str | None = None


class MessageRecord(BaseModel):
    id: int
    direction: str
    channel: str
    peer: str | None
    body: str
    status: str
    provider_id: str | None
    error: str | None
    created_at: str


class ChannelInfo(BaseModel):
    name: str
    configured: bool


class HealthResponse(BaseModel):
    status: str
    channels: dict[str, str]

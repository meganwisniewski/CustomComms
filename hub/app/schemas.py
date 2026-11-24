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
    # Channel-agnostic rich representation of the body (Markdown). iMessage sends
    # the plain `body`; channels that support formatting (email, Slack, ...) can
    # use this. Captured/persisted now so the composer is future-ready.
    rich: str | None = Field(
        None, description="Markdown/rich version of the body, for channels that support formatting."
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


class SuggestResponse(BaseModel):
    suggestions: list[str] = []


class ChannelInfo(BaseModel):
    name: str
    configured: bool


class HealthResponse(BaseModel):
    status: str
    channels: dict[str, str]
    queued: int


# --- People / contacts (the hub as source-of-truth contact record) ----------
# Deliberately flexible so new means-of-contact can be added without migrations.

class Handle(BaseModel):
    kind: str = "phone"          # phone | email | imessage | sms | other
    value: str
    label: str | None = None     # "mobile", "work", ...


class Social(BaseModel):
    platform: str                # instagram | linkedin | twitter | website | ...
    value: str                   # handle or URL


class Person(BaseModel):
    id: str
    display_name: str = ""
    handles: list[Handle] = []
    birthday: str | None = None
    addresses: list[str] = []
    socials: list[Social] = []
    notes: str | None = None
    tags: list[str] = []
    links: list[str] = []        # conversation GUIDs / handle strings this person maps to
    custom: dict[str, str] = {}  # arbitrary extra fields, future-proofing
    source: str = "manual"       # manual | imported | derived
    created_at: str
    updated_at: str


class PersonCreate(BaseModel):
    id: str | None = None        # generated if omitted
    display_name: str = ""
    handles: list[Handle] = []
    birthday: str | None = None
    addresses: list[str] = []
    socials: list[Social] = []
    notes: str | None = None
    tags: list[str] = []
    links: list[str] = []
    custom: dict[str, str] = {}
    source: str = "manual"


class PersonUpdate(BaseModel):
    # Only fields sent are changed (merge semantics).
    display_name: str | None = None
    handles: list[Handle] | None = None
    birthday: str | None = None
    addresses: list[str] | None = None
    socials: list[Social] | None = None
    notes: str | None = None
    tags: list[str] | None = None
    links: list[str] | None = None
    custom: dict[str, str] | None = None

"""Communication Hub — FastAPI application.

One place to send a message. POST to /messages/send and the hub *queues* it;
a background worker delivers it to the named channel with retries, so a message
survives the target being temporarily unreachable (e.g. the iMessage Mac asleep
or rebooting for updates). Reactions queue the same way via /messages/react.
Inbound bridge events land on /webhooks/{channel}.

The client reads conversations/messages/contacts via /conversations, /contacts —
these proxy and clean BlueBubbles' own data (which holds full history).
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import db, people as people_svc, suggest
from .channels.registry import registry
from .config import settings
from .convo import clean_contact, clean_conversation, clean_message, contacts_map
from .delivery import deliver
from .schemas import (
    ChannelInfo,
    EnqueueResponse,
    Handle,
    HealthResponse,
    MessageRecord,
    Person,
    PersonCreate,
    PersonUpdate,
    ReactRequest,
    SendRequest,
    SuggestResponse,
)

log = logging.getLogger("hub")


async def worker_loop() -> None:
    """Continuously deliver due queued messages."""
    while True:
        try:
            due = db.claim_due(limit=20)
            for msg in due:
                channel = registry.get(msg["channel"])
                status = await deliver(msg, channel)
                if status != "sent":
                    log.info("msg %s -> %s (%s)", msg["id"], status, msg["channel"])
        except asyncio.CancelledError:
            raise
        except Exception:  # keep the worker alive no matter what
            log.exception("worker loop iteration failed")
        await asyncio.sleep(settings.hub_poll_interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init(settings.hub_database_path)
    task = asyncio.create_task(worker_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="CustomComms — Communication Hub",
    version="0.4.0",
    summary="Channel-agnostic messaging hub with a store-and-forward delivery queue.",
    lifespan=lifespan,
)

# The client may run cross-origin in dev (Vite on another host/port). Writes are
# still guarded by the X-Hub-Token header; CORS only governs the browser. On the
# private tailnet, allowing any origin is an acceptable trade for simplicity.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_token(x_hub_token: str | None = Header(default=None)) -> None:
    """Guard write endpoints with a shared token when one is configured."""
    if settings.hub_api_token and x_hub_token != settings.hub_api_token:
        raise HTTPException(status_code=401, detail="invalid or missing X-Hub-Token")


def _imessage():
    """The iMessage channel, or a 503 if it isn't available for reads."""
    ch = registry.get("imessage")
    if ch is None:
        raise HTTPException(status_code=503, detail="imessage channel not enabled")
    if not ch.configured:
        raise HTTPException(status_code=503, detail="imessage channel not configured")
    return ch


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    channels = {name: await ch.health() for name, ch in registry.all().items()}
    queued = len(db.recent(limit=10_000, status="queued"))
    return HealthResponse(status="ok", channels=channels, queued=queued)


@app.get("/channels", response_model=list[ChannelInfo])
async def channels() -> list[ChannelInfo]:
    return [ChannelInfo(name=name, configured=ch.configured) for name, ch in registry.all().items()]


@app.post("/messages/send", response_model=EnqueueResponse, status_code=202,
          dependencies=[Depends(require_token)])
async def send_message(req: SendRequest) -> EnqueueResponse:
    if registry.get(req.channel) is None:
        raise HTTPException(
            status_code=404,
            detail=f"channel '{req.channel}' not enabled. Enabled: {', '.join(registry.names()) or '(none)'}",
        )
    # Rich options ride along in `extras`; a plain text send stores no extras.
    extras = {k: v for k, v in {
        "reply_to": req.reply_to,
        "effect": req.effect,
        "subject": req.subject,
        "rich": req.rich,
    }.items() if v}
    msg_id = db.enqueue(channel=req.channel, peer=req.to, body=req.body,
                        title=req.title, extras=extras or None)
    # Delivered asynchronously by the worker; poll GET /messages/{id} for status.
    return EnqueueResponse(id=msg_id, channel=req.channel, to=req.to, status="queued")


@app.post("/messages/react", response_model=EnqueueResponse, status_code=202,
          dependencies=[Depends(require_token)])
async def react_message(req: ReactRequest) -> EnqueueResponse:
    """Queue a tapback on an existing message (iMessage Private API)."""
    if registry.get(req.channel) is None:
        raise HTTPException(
            status_code=404,
            detail=f"channel '{req.channel}' not enabled. Enabled: {', '.join(registry.names()) or '(none)'}",
        )
    extras = {"selected_guid": req.target, "reaction": req.reaction, "part_index": req.part_index}
    body = f"[reaction {req.reaction} -> {req.target}]"
    msg_id = db.enqueue(channel=req.channel, peer=req.to, body=body, kind="react", extras=extras)
    return EnqueueResponse(id=msg_id, channel=req.channel, to=req.to, status="queued")


@app.get("/messages", response_model=list[MessageRecord])
async def list_messages(limit: int = 50, status: str | None = None) -> list[MessageRecord]:
    limit = max(1, min(limit, 500))
    return [MessageRecord(**row) for row in db.recent(limit, status=status)]


@app.get("/messages/{msg_id}", response_model=MessageRecord)
async def get_message(msg_id: int) -> MessageRecord:
    row = db.get(msg_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"message {msg_id} not found")
    return MessageRecord(**row)


# --- client-facing reads (proxy + clean BlueBubbles data) -------------------

@app.get("/conversations")
async def conversations(limit: int = 50, include_filtered: bool = False,
                        include_archived: bool = False) -> list[dict]:
    """Recent conversations, newest first. Filters SMS spam/archived by default.

    BlueBubbles holds thousands of (mostly spam) chats, so the hub fetches a
    window, drops filtered/archived, sorts by recency, and returns the top N.
    """
    ch = _imessage()
    limit = max(1, min(limit, 200))
    # BlueBubbles' own "lastmessage" sort is unreliable, so fetch a wide window
    # and sort locally by recency regardless of the requested limit.
    fetch_n = 200
    try:
        chats = await ch.list_chats(limit=fetch_n, offset=0)
        cmap = await contacts_map(ch)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"bluebubbles read failed: {exc}")
    out = [clean_conversation(c, cmap) for c in chats]
    if not include_filtered:
        out = [c for c in out if not c["filtered"]]
    if not include_archived:
        out = [c for c in out if not c["archived"]]
    out.sort(key=lambda c: c["last_date"] or 0, reverse=True)
    return out[:limit]


@app.get("/conversations/{guid:path}/messages")
async def conversation_messages(guid: str, limit: int = 50, offset: int = 0) -> list[dict]:
    """Messages in one conversation, newest first."""
    ch = _imessage()
    limit = max(1, min(limit, 200))
    try:
        # iCloud-synced histories can arrive out of date-order, so fetch a wider
        # window and sort by date to return the true most-recent messages.
        raw = await ch.get_chat_messages(guid, limit=min(limit * 2, 200), offset=max(offset, 0))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"bluebubbles read failed: {exc}")
    msgs = [clean_message(m) for m in raw]
    msgs.sort(key=lambda m: m["date"] or 0, reverse=True)
    return msgs[:limit]


@app.get("/conversations/{guid:path}/suggest", response_model=SuggestResponse,
         dependencies=[Depends(require_token)])
async def suggest_reply(guid: str, steer: str | None = None) -> SuggestResponse:
    """Draft 1-3 replies in the user's voice (opt-in; needs ANTHROPIC_API_KEY).

    Optional `steer` lets the user ask for a specific kind of reply, e.g.
    "politely decline and suggest next week".
    """
    if not suggest.api_key():
        raise HTTPException(
            status_code=503,
            detail="suggestions not configured: set ANTHROPIC_API_KEY on the hub",
        )
    ch = _imessage()
    try:
        raw = await ch.get_chat_messages(guid, limit=40, offset=0)
        chats = await ch.list_chats(limit=60, offset=0)
        cmap = await contacts_map(ch)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"bluebubbles read failed: {exc}")

    # Conversation context: real messages only (no tapbacks), oldest-first, last ~20.
    msgs = [clean_message(m) for m in raw]
    convo = [m for m in msgs if not m["reaction_to"] and (m["text"] or "").strip()]
    convo.sort(key=lambda m: m["date"] or 0)
    thread = convo[-20:]

    # Voice samples: my messages in this thread + my recent last-messages elsewhere.
    samples: list[str] = [m["text"].strip() for m in convo if m["from_me"] and m["text"].strip()]
    for c in chats:
        lm = c.get("lastMessage")
        if not lm:
            continue
        lc = clean_message(lm)
        if lc["from_me"] and lc["reaction_to"] is None and lc["text"].strip():
            samples.append(lc["text"].strip())
    # Dedupe (case-insensitive), keep sendable-length lines, cap the set.
    seen: set[str] = set()
    voice: list[str] = []
    for s in samples:
        if 2 <= len(s) <= 200 and s.lower() not in seen:
            seen.add(s.lower())
            voice.append(s)
    voice = voice[:40]

    target = next((c for c in chats if c.get("guid") == guid), None)
    name = clean_conversation(target, cmap)["name"] if target else "them"

    try:
        suggestions = await suggest.generate(name, thread, voice, (steer or "")[:300])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"claude api error {exc.response.status_code}: {exc.response.text[:200]}")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"claude api request failed: {exc}")
    return SuggestResponse(suggestions=suggestions)


@app.get("/contacts")
async def contacts() -> list[dict]:
    """All contacts (name + handles) for name/face resolution in the client."""
    ch = _imessage()
    try:
        raw = await ch.list_contacts()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"bluebubbles read failed: {exc}")
    return [clean_contact(c) for c in raw or []]


# --- people: hub-owned, editable contact records (source of truth) ----------

@app.get("/people", response_model=list[Person])
async def list_people() -> list[Person]:
    return people_svc.list_all()


@app.post("/people", response_model=Person, status_code=201,
          dependencies=[Depends(require_token)])
async def create_person(data: PersonCreate) -> Person:
    return people_svc.create(data)


@app.post("/people/import", dependencies=[Depends(require_token)])
async def import_people() -> dict:
    """Seed people from the Mac's address book (BlueBubbles /contact). Only adds
    contacts not already present, so manual edits survive a re-import."""
    ch = _imessage()
    try:
        raw = await ch.list_contacts()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"bluebubbles read failed: {exc}")
    added = 0
    for c in raw or []:
        clean = clean_contact(c)
        pid = clean["id"]
        if not pid or people_svc.get(pid):
            continue
        handles = [
            Handle(kind="email" if "@" in h else "phone", value=h) for h in clean["handles"]
        ]
        people_svc.create(
            PersonCreate(id=pid, display_name=clean["name"], handles=handles, source="imported")
        )
        added += 1
    return {"imported": added, "total": len(raw or [])}


@app.get("/people/{pid}", response_model=Person)
async def get_person(pid: str) -> Person:
    p = people_svc.get(pid)
    if p is None:
        raise HTTPException(status_code=404, detail=f"person '{pid}' not found")
    return p


@app.patch("/people/{pid}", response_model=Person, dependencies=[Depends(require_token)])
async def update_person(pid: str, patch: PersonUpdate) -> Person:
    p = people_svc.update(pid, patch)
    if p is None:
        raise HTTPException(status_code=404, detail=f"person '{pid}' not found")
    return p


@app.delete("/people/{pid}", status_code=204, dependencies=[Depends(require_token)])
async def delete_person(pid: str) -> Response:
    if not people_svc.delete(pid):
        raise HTTPException(status_code=404, detail=f"person '{pid}' not found")
    return Response(status_code=204)


@app.post("/webhooks/{channel_name}")
async def inbound_webhook(
    channel_name: str,
    request: Request,
    x_hub_token: str | None = Header(default=None),
    token: str | None = None,
) -> dict:
    # Webhook senders (e.g. BlueBubbles) can't set custom headers, so accept the
    # token either in the X-Hub-Token header or as a ?token= query parameter.
    if settings.hub_api_token and settings.hub_api_token not in (x_hub_token, token):
        raise HTTPException(status_code=401, detail="invalid or missing token (X-Hub-Token header or ?token=)")
    channel = registry.get(channel_name)
    if channel is None:
        raise HTTPException(status_code=404, detail=f"channel '{channel_name}' not enabled")
    payload = await request.json()
    inbound = channel.parse_inbound(payload)
    if inbound is None:
        return {"stored": False, "reason": "ignored by channel"}
    msg_id = db.log_inbound(
        channel=channel_name,
        peer=inbound.peer,
        body=inbound.body,
        provider_id=inbound.provider_id,
    )
    return {"stored": True, "id": msg_id}


# Serve the built client at the root — registered LAST so every API route above
# takes precedence. Present only in the Docker image (guarded for local/dev runs).
_client_dist = Path(__file__).resolve().parent.parent / "client_dist"
if _client_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_client_dist), html=True), name="client")

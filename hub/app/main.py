"""Communication Hub — FastAPI application.

One place to send a message. POST to /messages/send and the hub *queues* it;
a background worker delivers it to the named channel with retries, so a message
survives the target being temporarily unreachable (e.g. the iMessage Mac asleep
or rebooting for updates). Inbound bridge events land on /webhooks/{channel}.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request

from . import db
from .channels.registry import registry
from .config import settings
from .delivery import deliver
from .schemas import (
    ChannelInfo,
    EnqueueResponse,
    HealthResponse,
    MessageRecord,
    SendRequest,
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
    version="0.2.0",
    summary="Channel-agnostic messaging hub with a store-and-forward delivery queue.",
    lifespan=lifespan,
)


def require_token(x_hub_token: str | None = Header(default=None)) -> None:
    """Guard write endpoints with a shared token when one is configured."""
    if settings.hub_api_token and x_hub_token != settings.hub_api_token:
        raise HTTPException(status_code=401, detail="invalid or missing X-Hub-Token")


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
    msg_id = db.enqueue(channel=req.channel, peer=req.to, body=req.body, title=req.title)
    # Delivered asynchronously by the worker; poll GET /messages/{id} for status.
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


@app.post("/webhooks/{channel_name}", dependencies=[Depends(require_token)])
async def inbound_webhook(channel_name: str, request: Request) -> dict:
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

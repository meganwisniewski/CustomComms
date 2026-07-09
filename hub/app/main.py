"""Communication Hub — FastAPI application.

One place to send a message. POST to /messages/send, the hub routes it to the
named channel and logs it. Inbound bridge events land on /webhooks/{channel}.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request

from . import db
from .channels.registry import registry
from .config import settings
from .schemas import (
    ChannelInfo,
    HealthResponse,
    MessageRecord,
    SendRequest,
    SendResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init(settings.hub_database_path)
    yield


app = FastAPI(
    title="CustomComms — Communication Hub",
    version="0.1.0",
    summary="Channel-agnostic messaging hub for the personal comms stack.",
    lifespan=lifespan,
)


def require_token(x_hub_token: str | None = Header(default=None)) -> None:
    """Guard write endpoints with a shared token when one is configured."""
    if settings.hub_api_token and x_hub_token != settings.hub_api_token:
        raise HTTPException(status_code=401, detail="invalid or missing X-Hub-Token")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    channels = {name: await ch.health() for name, ch in registry.all().items()}
    return HealthResponse(status="ok", channels=channels)


@app.get("/channels", response_model=list[ChannelInfo])
async def channels() -> list[ChannelInfo]:
    return [ChannelInfo(name=name, configured=ch.configured) for name, ch in registry.all().items()]


@app.post("/messages/send", response_model=SendResponse, dependencies=[Depends(require_token)])
async def send_message(req: SendRequest) -> SendResponse:
    channel = registry.get(req.channel)
    if channel is None:
        raise HTTPException(
            status_code=404,
            detail=f"channel '{req.channel}' not enabled. Enabled: {', '.join(registry.names()) or '(none)'}",
        )
    result = await channel.send(req.to, req.body, title=req.title)
    msg_id = db.log_message(
        direction="out",
        channel=req.channel,
        peer=req.to,
        body=req.body,
        status="sent" if result.ok else "failed",
        provider_id=result.provider_id,
        error=result.error,
    )
    if not result.ok:
        # Logged as failed, but signal the caller clearly.
        raise HTTPException(status_code=502, detail={"id": msg_id, "error": result.error})
    return SendResponse(
        id=msg_id,
        channel=req.channel,
        to=req.to,
        status="sent",
        provider_id=result.provider_id,
    )


@app.get("/messages", response_model=list[MessageRecord])
async def list_messages(limit: int = 50) -> list[MessageRecord]:
    limit = max(1, min(limit, 500))
    return [MessageRecord(**row) for row in db.recent(limit)]


@app.post("/webhooks/{channel_name}", dependencies=[Depends(require_token)])
async def inbound_webhook(channel_name: str, request: Request) -> dict:
    channel = registry.get(channel_name)
    if channel is None:
        raise HTTPException(status_code=404, detail=f"channel '{channel_name}' not enabled")
    payload = await request.json()
    inbound = channel.parse_inbound(payload)
    if inbound is None:
        return {"stored": False, "reason": "ignored by channel"}
    msg_id = db.log_message(
        direction="in",
        channel=channel_name,
        peer=inbound.peer,
        body=inbound.body,
        status="received",
        provider_id=inbound.provider_id,
    )
    return {"stored": True, "id": msg_id}

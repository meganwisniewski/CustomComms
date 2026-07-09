"""iMessage channel via a BlueBubbles server running on a Mac.

The hub runs on the Pi; to originate an iMessage it calls a BlueBubbles server
(https://bluebubbles.app/) which drives Messages.app on Apple hardware and
exposes a REST API. ``to`` is a chat GUID (e.g. "iMessage;-;+15551234567").

BlueBubbles auth is a shared password passed as the ``password`` query param.
"""
from __future__ import annotations

import httpx

from ..config import settings
from .base import Channel, InboundMessage, SendResult


class IMessageChannel(Channel):
    name = "imessage"

    def __init__(self) -> None:
        self.base_url = settings.bluebubbles_url.rstrip("/")
        self.password = settings.bluebubbles_password
        self.default_guid = settings.bluebubbles_default_guid

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.password)

    def _params(self) -> dict[str, str]:
        return {"password": self.password}

    async def send(self, to: str | None, body: str, *, title: str | None = None) -> SendResult:
        if not self.configured:
            return SendResult(
                ok=False,
                error="imessage not configured (BLUEBUBBLES_URL / BLUEBUBBLES_PASSWORD missing)",
            )
        guid = to or self.default_guid
        if not guid:
            return SendResult(ok=False, error="imessage send requires 'to' (a chat GUID)")

        # BlueBubbles expects a tempGuid so it can de-dupe retries. It's derived
        # deterministically from the target + body to stay idempotent per message.
        temp_guid = f"hub-{abs(hash((guid, body)))}"
        payload = {
            "chatGuid": guid,
            "message": body,
            "method": "apple-script",
            "tempGuid": temp_guid,
        }
        url = f"{self.base_url}/api/v1/message/text"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(url, params=self._params(), json=payload)
            resp.raise_for_status()
            data = resp.json()
            provider_id = (data.get("data") or {}).get("guid")
            return SendResult(ok=True, provider_id=provider_id)
        except httpx.HTTPStatusError as exc:
            return SendResult(ok=False, error=f"bluebubbles http {exc.response.status_code}: {exc.response.text[:200]}")
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=f"bluebubbles request failed: {exc}")

    async def health(self) -> str:
        if not self.configured:
            return "unconfigured"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/v1/ping", params=self._params())
            return "ok" if resp.status_code == 200 else f"http {resp.status_code}"
        except httpx.HTTPError as exc:
            return f"unreachable: {exc}"

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        # BlueBubbles webhook: {"type": "new-message", "data": {...}}
        if payload.get("type") != "new-message":
            return None
        data = payload.get("data") or {}
        if data.get("isFromMe"):
            return None
        handle = (data.get("handle") or {}).get("address")
        return InboundMessage(
            peer=handle,
            body=data.get("text") or "",
            provider_id=data.get("guid"),
        )

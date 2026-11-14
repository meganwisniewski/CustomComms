"""iMessage channel via a BlueBubbles server running on a Mac.

The hub runs on the Pi; to originate an iMessage it calls a BlueBubbles server
(https://bluebubbles.app/) which drives Messages.app on Apple hardware and
exposes a REST API. ``to`` is a chat GUID (e.g. "iMessage;-;+15551234567").

BlueBubbles auth is a shared password passed as the ``password`` query param.

Plain text goes out via the AppleScript method. Rich features — inline replies,
screen/bubble effects, subjects, and tapbacks — require the Private API
(enabled on the server, which needs SIP disabled on the Mac).
"""
from __future__ import annotations

import httpx

from ..config import settings
from .base import Channel, InboundMessage, SendResult

# Friendly effect name -> Apple effect identifier. Callers may also pass a raw
# "com.apple.*" identifier, which is used as-is.
EFFECTS = {
    # bubble effects
    "slam": "com.apple.MobileSMS.expressivesend.impact",
    "loud": "com.apple.MobileSMS.expressivesend.loud",
    "gentle": "com.apple.MobileSMS.expressivesend.gentle",
    "invisible-ink": "com.apple.MobileSMS.expressivesend.invisibleink",
    "invisibleink": "com.apple.MobileSMS.expressivesend.invisibleink",
    # screen effects
    "echo": "com.apple.messages.effect.CKEchoEffect",
    "spotlight": "com.apple.messages.effect.CKSpotlightEffect",
    "balloons": "com.apple.messages.effect.CKHappyBirthdayEffect",
    "confetti": "com.apple.messages.effect.CKConfettiEffect",
    "love": "com.apple.messages.effect.CKHeartEffect",
    "lasers": "com.apple.messages.effect.CKLasersEffect",
    "fireworks": "com.apple.messages.effect.CKFireworksEffect",
    "celebration": "com.apple.messages.effect.CKSparklesEffect",
}
# NB: "shooting star" has no confirmed effectId in any BlueBubbles source, so it
# is deliberately omitted. A raw "com.apple.*" id can still be passed through.

# Tapback reactions BlueBubbles accepts. Prefix with "-" to remove one.
REACTIONS = {"love", "like", "dislike", "laugh", "emphasize", "question"}


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

    def _resolve_effect(self, effect: str) -> str | None:
        """Map a friendly name to an Apple effect id; pass raw ids through; else None."""
        if effect in EFFECTS:
            return EFFECTS[effect]
        if effect.startswith("com.apple"):
            return effect
        return None

    async def _post(self, path: str, payload: dict) -> SendResult:
        """POST to BlueBubbles and turn the outcome into a SendResult."""
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(url, params=self._params(), json=payload)
            resp.raise_for_status()
            data = resp.json()
            provider_id = (data.get("data") or {}).get("guid")
            return SendResult(ok=True, provider_id=provider_id)
        except httpx.HTTPStatusError as exc:
            # 4xx = permanent (bad chat GUID, auth); 5xx = transient (server hiccup).
            transient = exc.response.status_code >= 500
            return SendResult(
                ok=False,
                transient=transient,
                error=f"bluebubbles http {exc.response.status_code}: {exc.response.text[:200]}",
            )
        except httpx.HTTPError as exc:
            # Connection refused/timeout — the Mac is asleep or BlueBubbles is down.
            # Store-and-forward: keep it queued and retry.
            return SendResult(ok=False, transient=True, error=f"bluebubbles unreachable: {exc}")

    async def send(
        self,
        to: str | None,
        body: str,
        *,
        title: str | None = None,
        reply_to: str | None = None,
        effect: str | None = None,
        subject: str | None = None,
    ) -> SendResult:
        if not self.configured:
            # Waiting on config counts as transient — keep the message queued.
            return SendResult(
                ok=False,
                transient=True,
                error="imessage not configured (BLUEBUBBLES_URL / BLUEBUBBLES_PASSWORD missing)",
            )
        guid = to or self.default_guid
        if not guid:
            return SendResult(ok=False, transient=False,
                              error="imessage send requires 'to' (a chat GUID)")

        effect_id = None
        if effect:
            effect_id = self._resolve_effect(effect)
            if effect_id is None:
                return SendResult(ok=False, transient=False,
                                  error=f"unknown effect '{effect}' (known: {', '.join(sorted(EFFECTS))})")

        # Rich features (reply/effect/subject) require the Private API method;
        # plain text uses AppleScript, which needs no SIP changes.
        rich = bool(reply_to or effect_id or subject)
        temp_guid = f"hub-{abs(hash((guid, body, reply_to, effect_id, subject)))}"
        payload: dict = {
            "chatGuid": guid,
            "message": body,
            "method": "private-api" if rich else "apple-script",
            "tempGuid": temp_guid,
        }
        if reply_to:
            payload["selectedMessageGuid"] = reply_to
            payload["partIndex"] = 0
        if effect_id:
            payload["effectId"] = effect_id
        if subject:
            payload["subject"] = subject

        return await self._post("/api/v1/message/text", payload)

    async def react(
        self,
        to: str | None,
        selected_guid: str,
        reaction: str,
        *,
        part_index: int = 0,
    ) -> SendResult:
        if not self.configured:
            return SendResult(
                ok=False, transient=True,
                error="imessage not configured (BLUEBUBBLES_URL / BLUEBUBBLES_PASSWORD missing)",
            )
        guid = to or self.default_guid
        if not guid:
            return SendResult(ok=False, transient=False,
                              error="imessage react requires 'to' (a chat GUID)")
        if not selected_guid:
            return SendResult(ok=False, transient=False,
                              error="imessage react requires 'target' (the message GUID to react to)")
        if not reaction or reaction.lstrip("-") not in REACTIONS:
            return SendResult(
                ok=False, transient=False,
                error=f"unknown reaction '{reaction}' (use one of {', '.join(sorted(REACTIONS))}, "
                      f"optionally prefixed with '-' to remove)",
            )
        payload = {
            "chatGuid": guid,
            "selectedMessageGuid": selected_guid,
            "reaction": reaction,
            "partIndex": part_index,
        }
        return await self._post("/api/v1/message/react", payload)

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

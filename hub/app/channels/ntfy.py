"""ntfy push channel — Pi-native, no Apple hardware required.

Sends to a topic on an ntfy server (ntfy.sh or self-hosted). ``to`` is the
topic name; falls back to nothing (caller must supply a topic).
"""
from __future__ import annotations

import httpx

from ..config import settings
from .base import Channel, SendResult


class NtfyChannel(Channel):
    name = "ntfy"

    def __init__(self) -> None:
        self.base_url = settings.ntfy_url.rstrip("/")
        self.token = settings.ntfy_token

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    def _headers(self, title: str | None) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if title:
            headers["Title"] = title
        return headers

    async def send(self, to: str | None, body: str, *, title: str | None = None) -> SendResult:
        if not self.configured:
            return SendResult(ok=False, error="ntfy not configured (NTFY_URL missing)")
        if not to:
            return SendResult(ok=False, error="ntfy send requires 'to' (the topic name)")
        url = f"{self.base_url}/{to}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, content=body.encode("utf-8"), headers=self._headers(title))
            resp.raise_for_status()
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            return SendResult(ok=True, provider_id=str(data.get("id")) if data.get("id") else None)
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error=f"ntfy request failed: {exc}")

    async def health(self) -> str:
        if not self.configured:
            return "unconfigured"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/v1/health")
            return "ok" if resp.status_code == 200 else f"http {resp.status_code}"
        except httpx.HTTPError as exc:
            return f"unreachable: {exc}"

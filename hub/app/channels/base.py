"""Channel interface. Every messaging backend implements this."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SendResult:
    ok: bool
    provider_id: str | None = None
    error: str | None = None
    # transient=True means "couldn't deliver right now, but retrying later may work"
    # (channel unreachable/unconfigured, server 5xx, timeout). The queue keeps such
    # messages and retries indefinitely — this is what lets an iMessage wait for a
    # sleeping Mac. transient=False means a permanent rejection (bad recipient, 4xx)
    # that counts toward max_attempts and eventually fails.
    transient: bool = False


@dataclass
class InboundMessage:
    peer: str | None
    body: str
    provider_id: str | None = None


class Channel:
    """Base class for a messaging channel.

    Subclasses set ``name`` and implement ``send``. ``react``, ``health`` and
    ``parse_inbound`` are optional overrides.
    """

    name: str = "base"

    @property
    def configured(self) -> bool:
        """True when the channel has everything it needs to operate."""
        return True

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
        """Send a message. ``reply_to``/``effect``/``subject`` are rich options
        that a channel may support (iMessage) or ignore (push)."""
        raise NotImplementedError

    async def react(
        self,
        to: str | None,
        selected_guid: str,
        reaction: str,
        *,
        part_index: int = 0,
    ) -> SendResult:
        """Add or remove a tapback on an existing message. Channels that don't
        support reactions return a permanent error."""
        return SendResult(
            ok=False,
            transient=False,
            error=f"channel '{self.name}' does not support reactions",
        )

    async def health(self) -> str:
        """Return 'ok', 'unconfigured', or a short error string."""
        return "ok" if self.configured else "unconfigured"

    def parse_inbound(self, payload: dict) -> InboundMessage | None:
        """Turn a raw webhook payload into an InboundMessage, or None to ignore."""
        return None

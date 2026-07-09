"""Builds the set of enabled channels from configuration."""
from __future__ import annotations

from ..config import settings
from .base import Channel
from .imessage import IMessageChannel
from .ntfy import NtfyChannel

_BUILDERS = {
    "imessage": IMessageChannel,
    "ntfy": NtfyChannel,
}


class ChannelRegistry:
    def __init__(self) -> None:
        self._channels: dict[str, Channel] = {}
        for name in settings.enabled_channels:
            builder = _BUILDERS.get(name)
            if builder is None:
                raise ValueError(
                    f"Unknown channel '{name}' in CHANNELS_ENABLED. "
                    f"Known channels: {', '.join(sorted(_BUILDERS))}"
                )
            self._channels[name] = builder()

    def get(self, name: str) -> Channel | None:
        return self._channels.get(name)

    def names(self) -> list[str]:
        return list(self._channels)

    def all(self) -> dict[str, Channel]:
        return dict(self._channels)


registry = ChannelRegistry()

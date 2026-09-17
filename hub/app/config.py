"""Environment-driven configuration for the hub."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core
    channels_enabled: str = "ntfy"
    hub_database_path: str = "/data/hub.db"
    hub_api_token: str = ""

    # Delivery queue / retry (store-and-forward)
    hub_poll_interval_seconds: float = 5.0   # how often the worker scans for due messages
    hub_max_attempts: int = 12               # give up after this many *permanent* failures
    hub_backoff_base_seconds: float = 5.0    # first retry delay
    hub_backoff_max_seconds: float = 300.0   # cap; a sleeping Mac is retried at this cadence

    # iMessage / BlueBubbles
    bluebubbles_url: str = ""
    bluebubbles_password: str = ""
    bluebubbles_default_guid: str = ""

    # ntfy
    ntfy_url: str = "https://ntfy.sh"
    ntfy_token: str = ""

    @property
    def enabled_channels(self) -> list[str]:
        return [c.strip().lower() for c in self.channels_enabled.split(",") if c.strip()]


settings = Settings()

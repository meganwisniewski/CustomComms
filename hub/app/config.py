"""Environment-driven configuration for the hub."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Core
    channels_enabled: str = "ntfy"
    hub_database_path: str = "/data/hub.db"
    hub_api_token: str = ""

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

"""App settings via env vars / .env (SecretProvider indirection, DESIGN_v1 §1.1).

Never log or expose these values (CLAUDE.md / PRD §12).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"


settings = Settings()

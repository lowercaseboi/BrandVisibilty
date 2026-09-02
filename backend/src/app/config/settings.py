"""App settings via env vars / .env (SecretProvider indirection, DESIGN_v1 §1.1).

Never log or expose these values (CLAUDE.md / PRD §12).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Checked in order; a repo-root .env.local (one level up from backend/, where
        # uv run/pytest execute) takes precedence over a backend/-local .env.
        env_file=("../.env.local", "../.env", ".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str | None = None
    # "gemini-2.0-flash"/"gemini-2.5-flash"/"gemini-2.5-pro" are all retired for new API
    # keys as of this key's account (confirmed live via /v1beta/models); "gemini-3.6-flash"
    # is the model Google's own 404 message on this key recommends as the replacement.
    gemini_model: str = "gemini-3.6-flash"


settings = Settings()

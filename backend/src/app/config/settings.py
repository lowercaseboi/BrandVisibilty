"""App settings via env vars / .env (SecretProvider indirection, DESIGN_v1 §1.1).

Never log or expose these values (CLAUDE.md / PRD §12).

Per-provider rpm/rpd/daily_budget here are env-overridable defaults for
`collection.providers.catalog` (§3.4) — the catalog's own values are the fallback when an
env var isn't set. Overriding here means retuning a rate limit is a config change, not a
code change, when a provider's published ceiling drifts.
"""

from __future__ import annotations

from pathlib import Path

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
    gemini_rpm: int = 10
    # Published free-tier docs for a gemini-3-class flash model say ~1500 RPD, but the key
    # this project developed against measured a hard 20-per-day ceiling on
    # "generativelanguage.googleapis.com/generate_content_free_tier_requests" for
    # gemini-3.6-flash specifically (confirmed 2026-09-02, via a live 429's quota detail —
    # preview models appear to carry a much smaller free allowance than GA ones). Check
    # actual usage at https://aistudio.google.com/rate-limit and override via
    # GEMINI_RPD/GEMINI_DAILY_BUDGET rather than trusting this default.
    gemini_rpd: int = 1500
    gemini_daily_budget: int = 1200

    groq_api_key: str | None = None
    # "llama-3.3-70b-versatile" (the originally intended default) has been retired from
    # Groq's catalog as of 2026-09-02 (confirmed via GET /openai/v1/models — 404 on use).
    # "openai/gpt-oss-20b" is a current free-tier text model, measured at 1000 RPD / ~30 RPM
    # for this key on the same date.
    groq_model: str = "openai/gpt-oss-20b"
    groq_rpm: int = 30
    groq_rpd: int = 1000
    groq_daily_budget: int = 800

    openrouter_api_key: str | None = None
    openrouter_models: str = ""  # comma-separated; §3.4 recommends ~3 free models
    openrouter_rpm: int = 20
    openrouter_rpd_per_model: int = 50

    # Comma-separated provider ids to actually use this run — lets a debugging session
    # or a quota-exhausted day drop a provider without touching code (PRD §8.1 graceful
    # degradation is enforced downstream by `registry.build_providers` skipping any
    # provider with no configured key, independent of this list).
    enabled_providers: str = "gemini,groq"

    response_store_root: Path = Path("data/responses")
    usage_ledger_path: Path = Path("data/usage/ledger.json")
    tracking_root: Path = Path("data/tracking")

    # Dev-friendly SQLite default; production overrides via DATABASE_URL to a
    # postgresql+psycopg://... DSN.
    database_url: str = "sqlite:///./data/app.db"


settings = Settings()

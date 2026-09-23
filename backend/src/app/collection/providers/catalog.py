"""Known (provider, model) rate/quota ceilings (DESIGN_v1 §3.4).

Free-tier ceilings drift — PRD §8's own table is already given as a range — so each entry
below is dated. Re-check the provider's published limits periodically rather than trusting
these indefinitely; `Settings`' env-var overrides (see `config/settings.py`) exist
precisely so a stale ceiling here doesn't require a code change to correct.

Keyed by (provider_id, model_id), matching `ProviderLimits.ledger_key` and DESIGN §2.1's
`ProviderModel` split from `Provider` — the unit that actually has a quota is the model,
not the provider (most visible for OpenRouter's per-model ~50/day cap).
"""

from __future__ import annotations

from app.collection.limits import ProviderLimits

# Checked 2026-09-02. Published free-tier docs for a gemini-3-class flash model say
# ~1500 RPD, but a live 429 against this project's own key measured a hard 20-per-day
# ceiling on the "generate_content_free_tier_requests" metric for gemini-3.6-flash
# specifically — preview models appear to carry a much smaller free allowance than GA
# ones. Treat `rpd`/`daily_budget` here as an upper bound, not a promise; check
# https://aistudio.google.com/rate-limit for the real number and override via
# Settings.gemini_rpd / .gemini_daily_budget (env GEMINI_RPD / GEMINI_DAILY_BUDGET).
GEMINI_FLASH = ProviderLimits(
    provider_id="gemini",
    model_id="gemini-3.6-flash",
    rpm=10,
    rpd=1500,
    daily_budget=1200,
    daily_reset_tz="America/Los_Angeles",  # Gemini's free-tier day resets at midnight Pacific
)

# Checked 2026-09-02, live against this project's key. "llama-3.3-70b-versatile" (an
# earlier candidate default) is retired from Groq's catalog as of this date (confirmed via
# GET /openai/v1/models). "openai/gpt-oss-20b" is a current free-tier text model, measured
# at 1000 RPD / ~30 RPM (8000 tokens/min) for this key. Groq's day resets UTC.
GROQ_GPT_OSS_20B = ProviderLimits(
    provider_id="groq",
    model_id="openai/gpt-oss-20b",
    rpm=30,
    rpd=1000,
    daily_budget=800,
    daily_reset_tz="UTC",
)

CATALOG: dict[tuple[str, str], ProviderLimits] = {
    (GEMINI_FLASH.provider_id, GEMINI_FLASH.model_id): GEMINI_FLASH,
    (GROQ_GPT_OSS_20B.provider_id, GROQ_GPT_OSS_20B.model_id): GROQ_GPT_OSS_20B,
}

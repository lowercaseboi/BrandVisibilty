"""Bring-your-own-model provider registry (docs/CONTRACT.md §1).

Add any one key to the environment (or repo-root `.env.local`) and `resolve_provider_ids("auto")`
picks it up; with no keys at all the pipeline falls back to the offline `synthetic` provider.

`Settings()` is constructed fresh on every call so env changes (tests, a user editing
`.env.local` while the API runs) apply without a restart. Keys are read here and passed
straight to adapters — they never appear in `ProviderInfo`, logs or error messages.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from app.collection.providers.anthropic import AnthropicAdapter
from app.collection.providers.gemini import GeminiAdapter
from app.collection.providers.openai_compat import OpenAICompatibleAdapter
from app.collection.providers.replay import ReplayProvider
from app.collection.providers.synthetic import MODEL_VERSION as SYNTHETIC_MODEL
from app.collection.providers.synthetic import SyntheticProvider
from app.collection.types import LLMProvider
from app.config.settings import OLLAMA_DEFAULT_BASE_URL, Settings

if TYPE_CHECKING:  # pragma: no cover
    from app.brands.registry import BrandConfig

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_BACKEND_DIR = Path(__file__).resolve().parents[3]

LIVE_PROVIDER_IDS: tuple[str, ...] = ("gemini", "openai", "groq", "openrouter", "anthropic", "ollama", "custom")
OFFLINE_PROVIDER_IDS: tuple[str, ...] = ("synthetic", "replay")
ALL_PROVIDER_IDS: tuple[str, ...] = LIVE_PROVIDER_IDS + OFFLINE_PROVIDER_IDS

_LABELS = {
    "gemini": "Google Gemini",
    "openai": "OpenAI",
    "groq": "Groq",
    "openrouter": "OpenRouter",
    "anthropic": "Anthropic Claude",
    "ollama": "Ollama (local)",
    "custom": "Custom OpenAI-compatible",
    "synthetic": "Synthetic demo data (offline)",
    "replay": "Replay recorded responses",
}


def provider_label(provider_id: str) -> str:
    """Human-readable provider name for progress messages; unknown ids are returned as-is."""
    return _LABELS.get(provider_id, provider_id)


@dataclass(frozen=True)
class ProviderInfo:
    provider_id: str
    label: str
    configured: bool  # key/base-url present (synthetic/replay: always True)
    model: str | None  # model that will be used; never the key
    kind: Literal["live", "offline"]


def data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", _BACKEND_DIR / "data"))


def replay_cache_path(brand_key: str) -> Path:
    return data_dir() / "replay" / f"{brand_key}.json"


def _configured(provider_id: str, s: Settings) -> bool:
    return {
        "gemini": bool(s.gemini_api_key),
        "openai": bool(s.openai_api_key),
        "groq": bool(s.groq_api_key),
        "openrouter": bool(s.openrouter_api_key),
        "anthropic": bool(s.anthropic_api_key),
        # Ollama needs no key; it counts as configured (and joins "auto") only when the
        # user sets OLLAMA_BASE_URL, so a machine without Ollama never tries to reach it.
        "ollama": bool(s.ollama_base_url),
        "custom": bool(s.custom_llm_base_url and s.custom_llm_model),
        "synthetic": True,
        "replay": True,
    }[provider_id]


def _model(provider_id: str, s: Settings) -> str | None:
    return {
        "gemini": s.gemini_model,
        "openai": s.openai_model,
        "groq": s.groq_model,
        "openrouter": s.openrouter_model,
        "anthropic": s.anthropic_model,
        "ollama": s.ollama_model,
        "custom": s.custom_llm_model,
        "synthetic": SYNTHETIC_MODEL,
        "replay": None,
    }[provider_id]


def available_providers() -> list[ProviderInfo]:
    s = Settings()
    return [
        ProviderInfo(
            provider_id=pid,
            label=_LABELS[pid],
            configured=_configured(pid, s),
            model=_model(pid, s),
            kind="live" if pid in LIVE_PROVIDER_IDS else "offline",
        )
        for pid in ALL_PROVIDER_IDS
    ]


def resolve_provider_ids(spec: str) -> list[str]:
    """"auto" (or empty) -> every configured live provider, or ["synthetic"] if none are.
    "gemini,groq" -> that list, de-duplicated, order kept. ValueError on an unknown id or
    an unconfigured live provider (Ollama may be requested explicitly without
    OLLAMA_BASE_URL; it then uses http://localhost:11434)."""
    s = Settings()
    spec = (spec or "auto").strip().lower()
    if spec == "auto":
        live = [pid for pid in LIVE_PROVIDER_IDS if _configured(pid, s)]
        return live or ["synthetic"]

    ids: list[str] = []
    for raw in spec.split(","):
        pid = raw.strip()
        if not pid or pid in ids:
            continue
        if pid not in ALL_PROVIDER_IDS:
            raise ValueError(f"unknown provider {pid!r}; known: {', '.join(ALL_PROVIDER_IDS)}")
        if pid in LIVE_PROVIDER_IDS and pid != "ollama" and not _configured(pid, s):
            raise ValueError(f"provider {pid!r} is not configured (set its API key / base URL in .env.local)")
        ids.append(pid)
    if not ids:
        raise ValueError("no providers given")
    return ids


def build_provider(provider_id: str, *, brand: BrandConfig | Any | None = None, round: int = 1) -> LLMProvider:  # noqa: A002
    s = Settings()
    if provider_id == "synthetic":
        return SyntheticProvider(brand, round=round)
    if provider_id == "replay":
        if brand is None:
            raise ValueError("replay provider needs a brand (the cache is per brand)")
        return ReplayProvider(replay_cache_path(brand.brand_key))
    if provider_id not in LIVE_PROVIDER_IDS:
        raise ValueError(f"unknown provider {provider_id!r}; known: {', '.join(ALL_PROVIDER_IDS)}")
    if provider_id != "ollama" and not _configured(provider_id, s):
        raise ValueError(f"provider {provider_id!r} is not configured")

    if provider_id == "gemini":
        return GeminiAdapter(api_key=s.gemini_api_key, model=s.gemini_model)
    if provider_id == "anthropic":
        return AnthropicAdapter(api_key=s.anthropic_api_key, model=s.anthropic_model)
    if provider_id == "openai":
        return OpenAICompatibleAdapter("openai", s.openai_base_url, s.openai_api_key, s.openai_model)
    if provider_id == "groq":
        return OpenAICompatibleAdapter("groq", GROQ_BASE_URL, s.groq_api_key, s.groq_model)
    if provider_id == "openrouter":
        return OpenAICompatibleAdapter(
            "openrouter",
            OPENROUTER_BASE_URL,
            s.openrouter_api_key,
            s.openrouter_model,
            extra_headers={"X-Title": "AI Visibility Platform"},
        )
    if provider_id == "ollama":
        base = (s.ollama_base_url or OLLAMA_DEFAULT_BASE_URL).rstrip("/")
        if not base.endswith("/v1"):
            base += "/v1"
        return OpenAICompatibleAdapter("ollama", base, None, s.ollama_model, timeout=180.0)
    # custom
    return OpenAICompatibleAdapter("custom", s.custom_llm_base_url, s.custom_llm_api_key, s.custom_llm_model)

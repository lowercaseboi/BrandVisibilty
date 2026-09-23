"""Build the resilient provider handles for a run from `Settings` (DESIGN_v1 §1.3, §3.4).

The single place that wires an adapter + its `ProviderLimits` (from `catalog.py`, overridden
by `Settings` env vars) + a shared `UsageLedger` into a `ResilientProvider`. Adding
OpenRouter later means one adapter file, one catalog entry, and a branch here — the
collection runner, resilience wrapper, response store, and admissibility gate all stay
untouched, because they only ever see the `LLMProvider` / `ProviderHandle` interface.

Any provider with no configured API key is silently omitted (PRD §8.1 graceful
degradation) rather than raising — a run with one missing key should collect from the
providers it does have, not fail outright.
"""

from __future__ import annotations

from dataclasses import replace

from app.collection.ledger import UsageLedger
from app.collection.limits import ProviderLimits
from app.collection.providers.catalog import CATALOG
from app.collection.providers.gemini import GeminiAdapter
from app.collection.providers.groq import GroqAdapter
from app.collection.resilient import ResilientProvider
from app.config.settings import Settings
from app.orchestration.collection_runner import ProviderHandle


def _enabled(settings: Settings) -> frozenset[str]:
    return frozenset(p.strip() for p in settings.enabled_providers.split(",") if p.strip())


def build_providers(
    settings: Settings, *, ledger: UsageLedger, sleep=None
) -> tuple[ProviderHandle, ...]:
    enabled = _enabled(settings)
    handles: list[ProviderHandle] = []

    if "gemini" in enabled and settings.gemini_api_key:
        base_limits = CATALOG.get(
            ("gemini", settings.gemini_model),
            ProviderLimits(provider_id="gemini", model_id=settings.gemini_model, rpm=10, rpd=1500),
        )
        limits = replace(
            base_limits,
            rpm=settings.gemini_rpm,
            rpd=settings.gemini_rpd,
            daily_budget=settings.gemini_daily_budget,
        )
        inner = GeminiAdapter(api_key=settings.gemini_api_key, model=settings.gemini_model)
        kwargs = {"sleep": sleep} if sleep is not None else {}
        handles.append(
            ProviderHandle(
                limits=limits,
                provider=ResilientProvider(inner, limits, ledger=ledger, **kwargs),
            )
        )

    if "groq" in enabled and settings.groq_api_key:
        base_limits = CATALOG.get(
            ("groq", settings.groq_model),
            ProviderLimits(provider_id="groq", model_id=settings.groq_model, rpm=30, rpd=1000),
        )
        limits = replace(
            base_limits,
            rpm=settings.groq_rpm,
            rpd=settings.groq_rpd,
            daily_budget=settings.groq_daily_budget,
        )
        inner = GroqAdapter(api_key=settings.groq_api_key, model=settings.groq_model)
        kwargs = {"sleep": sleep} if sleep is not None else {}
        handles.append(
            ProviderHandle(
                limits=limits,
                provider=ResilientProvider(inner, limits, ledger=ledger, **kwargs),
            )
        )

    # OpenRouter (§3.4 P=3, §6.8's third provider): deferred to a later chunk — one adapter
    # file plus one branch here, once `openrouter_api_key` is set and its per-model catalog
    # entries exist. `openrouter_models` (comma-separated) already anticipates one
    # ProviderHandle per model, since its ~50/day cap is per-model, not per-provider.

    return tuple(handles)

"""registry.build_providers — graceful degradation and env-override wiring (PRD §8.1,
DESIGN_v1 §3.4)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.collection.ledger import FileUsageLedger
from app.collection.registry import build_providers
from app.config.settings import Settings


def _ledger(tmp_path) -> FileUsageLedger:
    return FileUsageLedger(tmp_path / "ledger.json", clock=lambda: datetime(2026, 9, 2, tzinfo=UTC))


def test_missing_key_omits_the_provider(tmp_path):
    settings = Settings(gemini_api_key=None, groq_api_key=None, _env_file=None)
    handles = build_providers(settings, ledger=_ledger(tmp_path))
    assert handles == ()


def test_both_keys_present_yields_two_handles(tmp_path):
    settings = Settings(gemini_api_key="g-key", groq_api_key="q-key", _env_file=None)
    handles = build_providers(settings, ledger=_ledger(tmp_path))
    provider_ids = {h.limits.provider_id for h in handles}
    assert provider_ids == {"gemini", "groq"}


def test_disabling_a_provider_via_enabled_providers_omits_it_even_with_a_key(tmp_path):
    settings = Settings(
        gemini_api_key="g-key", groq_api_key="q-key", enabled_providers="gemini", _env_file=None
    )
    handles = build_providers(settings, ledger=_ledger(tmp_path))
    assert {h.limits.provider_id for h in handles} == {"gemini"}


def test_env_overrides_flow_into_provider_limits(tmp_path):
    settings = Settings(
        gemini_api_key="g-key", groq_api_key=None, gemini_rpm=5, gemini_rpd=100, _env_file=None
    )
    handles = build_providers(settings, ledger=_ledger(tmp_path))
    gemini_handle = next(h for h in handles if h.limits.provider_id == "gemini")
    assert gemini_handle.limits.rpm == 5
    assert gemini_handle.limits.rpd == 100

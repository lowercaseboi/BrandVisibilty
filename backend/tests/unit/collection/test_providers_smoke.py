"""Smoke tests for the bring-your-own-model provider layer (docs/CONTRACT.md §1)."""

from __future__ import annotations

from dataclasses import dataclass, field

import httpx
import pytest

from app.analysis.mention_detector import detect_mentions
from app.analysis.types import EntityAlias
from app.collection import registry
from app.collection.providers.openai_compat import OpenAICompatibleAdapter
from app.collection.providers.replay import ReplayMiss, ReplayProvider, record_response
from app.collection.providers.synthetic import SyntheticProvider
from app.collection.types import SamplingParams
from app.querysets.templates import BrandParams

_KEY_VARS = (
    "GEMINI_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY", "OLLAMA_BASE_URL", "CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL",
)


@dataclass(frozen=True)
class _Brand:
    brand_key: str = "gajanan_vada_pav"
    params: BrandParams = BrandParams(brand="Gajanan Vada Pav", category="vada pav outlet", cities=("Mumbai",))
    self_aliases: tuple[str, ...] = ("Gajanan Vada Pav", "Gajanan")
    competitors: dict = field(
        default_factory=lambda: {"ashok": ("Ashok Vada Pav",), "anand": ("Anand Stall",), "shivaji": ("Shivaji Vada Pav",)}
    )


def _clear_keys(monkeypatch):
    # Blank (not deleted) so they also override any real repo-root .env.local file.
    for var in _KEY_VARS:
        monkeypatch.setenv(var, "")


def test_synthetic_is_deterministic_and_sometimes_mentions_brand():
    brand = _Brand()
    prompts = [f"vada pav outlet in Mumbai {i}" for i in range(40)]
    a = [SyntheticProvider(brand).query(p, SamplingParams()).payload for p in prompts]
    b = [SyntheticProvider(brand).query(p, SamplingParams()).payload for p in prompts]
    assert a == b

    alias_table = (EntityAlias("self", "self", brand.self_aliases),) + tuple(
        EntityAlias(cid, "competitor", aliases) for cid, aliases in brand.competitors.items()
    )
    mentioned = [any(m.entity_id == "self" for m in detect_mentions(t, alias_table)) for t in a]
    assert 0 < sum(mentioned) < len(prompts)
    assert any(any(m.entity_id != "self" for m in detect_mentions(t, alias_table)) for t in a)

    result = SyntheticProvider(None).query("best perfume", SamplingParams())
    assert result.payload and result.model_version == "synthetic-v1" and result.raw_meta == {"synthetic": True}


def test_auto_resolves_to_synthetic_without_keys(monkeypatch):
    _clear_keys(monkeypatch)
    assert registry.resolve_provider_ids("auto") == ["synthetic"]
    with pytest.raises(ValueError):
        registry.resolve_provider_ids("groq")

    monkeypatch.setenv("GROQ_API_KEY", "gsk-test-secret")
    assert registry.resolve_provider_ids("auto") == ["groq"]
    infos = {p.provider_id: p for p in registry.available_providers()}
    assert infos["groq"].configured and infos["synthetic"].configured
    assert "gsk-test-secret" not in repr(infos)


def test_openai_compat_adapter_parses_response(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(
            200,
            json={
                "id": "x",
                "model": "llama-3.3-70b-versatile-resolved",
                "choices": [{"message": {"role": "assistant", "content": "1. Ashok Vada Pav"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 7},
            },
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: httpx.Client(transport=transport).post(*a, **kw))
    adapter = OpenAICompatibleAdapter("groq", "https://api.groq.com/openai/v1/", "k", "llama-3.3-70b-versatile")
    result = adapter.query("vada pav in Mumbai", SamplingParams(temperature=0.2))
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert seen["auth"] == "Bearer k"
    assert result.source_id == "groq" and result.payload == "1. Ashok Vada Pav"
    assert result.model_version == "llama-3.3-70b-versatile-resolved"
    assert result.token_usage == {"prompt_tokens": 5, "completion_tokens": 7}


def test_replay_roundtrip(tmp_path):
    cache = tmp_path / "replay" / "b.json"
    result = SyntheticProvider(None).query("q", SamplingParams())
    record_response(cache, "q", result)
    replay = ReplayProvider(cache)
    assert replay.query("q", SamplingParams()).payload == result.payload
    with pytest.raises(ReplayMiss):
        replay.query("other", SamplingParams())

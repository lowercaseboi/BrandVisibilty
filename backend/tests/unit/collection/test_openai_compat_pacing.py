"""OpenAI-compatible adapter: answer cap, provider extras and rate-limit-header pacing (Groq)."""

from __future__ import annotations

import httpx
import pytest

from app.collection import registry
from app.collection.providers import openai_compat
from app.collection.providers.openai_compat import (
    OpenAICompatibleAdapter,
    RateBudget,
    parse_reset,
)
from app.collection.types import SamplingParams


@pytest.fixture(autouse=True)
def _fresh_budgets():
    openai_compat.reset_budgets()
    yield
    openai_compat.reset_budgets()


def _mock_post(monkeypatch, headers: dict[str, str] | None = None, status: int = 200):
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        bodies.append(json.loads(request.content))
        return httpx.Response(
            status,
            headers=headers or {},
            json={
                "model": "m",
                "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                "usage": {"total_tokens": 700},
            },
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(httpx, "post", lambda *a, **kw: httpx.Client(transport=transport).post(*a, **kw))
    return bodies


@pytest.mark.parametrize(
    ("value", "seconds"),
    [("7.66s", 7.66), ("2m59.56s", 179.56), ("1h2m", 3720.0), ("450ms", 0.45), ("12", 12.0), (None, None), ("soon", None)],
)
def test_parse_reset(value, seconds):
    got = parse_reset(value)
    assert got == pytest.approx(seconds) if seconds is not None else got is None


def test_max_tokens_and_extra_body_are_sent(monkeypatch):
    bodies = _mock_post(monkeypatch)
    adapter = OpenAICompatibleAdapter(
        "groq", "https://g.example/v1", "k", "openai/gpt-oss-120b", max_tokens=1024, extra_body={"reasoning_effort": "low"}
    )
    adapter.query("q", SamplingParams())
    adapter.query("q", SamplingParams(max_output_tokens=200))  # explicit params win
    assert bodies[0]["max_tokens"] == 1024 and bodies[0]["reasoning_effort"] == "low"
    assert bodies[1]["max_tokens"] == 200


def test_low_remaining_tokens_paces_until_reset(monkeypatch):
    _mock_post(monkeypatch, {"x-ratelimit-remaining-tokens": "500", "x-ratelimit-reset-tokens": "7.5s"})
    adapter = OpenAICompatibleAdapter("groq", "https://g.example/v1", "k", "m", max_tokens=1024)
    assert adapter.pace_seconds("q", SamplingParams()) == 0.0  # nothing known yet
    adapter.query("q", SamplingParams())
    wait = adapter.pace_seconds("q", SamplingParams())
    assert 7.0 < wait <= 7.5 + 0.25
    # A small request that fits the remaining budget is not held back.
    assert adapter.pace_seconds("q", SamplingParams(max_output_tokens=100)) == 0.0


def test_budget_is_shared_between_adapter_instances(monkeypatch):
    _mock_post(monkeypatch, {"x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "30s"})
    OpenAICompatibleAdapter("groq", "https://g.example/v1", "k", "m").query("q", SamplingParams())
    later_run = OpenAICompatibleAdapter("groq", "https://g.example/v1/", "k", "m")
    assert later_run.pace_seconds("q", SamplingParams()) > 29
    assert OpenAICompatibleAdapter("groq", "https://g.example/v1", "k", "other").pace_seconds("q", SamplingParams()) == 0


def test_429_headers_update_the_budget(monkeypatch):
    _mock_post(monkeypatch, {"x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "5s"}, status=429)
    adapter = OpenAICompatibleAdapter("groq", "https://g.example/v1", "k", "m", max_tokens=1024)
    with pytest.raises(httpx.HTTPStatusError):
        adapter.query("q", SamplingParams())
    assert adapter.pace_seconds("q", SamplingParams()) > 4.5


def test_rpm_spaces_requests():
    clock = [100.0]
    budget = RateBudget(min_interval=2.0, clock=lambda: clock[0])
    assert budget.pace_seconds(10) == 0.0
    budget.started()
    clock[0] += 0.5
    assert budget.pace_seconds(10) == pytest.approx(1.5)
    clock[0] += 2.0
    assert budget.pace_seconds(10) == 0.0


def test_no_headers_means_no_pacing(monkeypatch):
    _mock_post(monkeypatch)
    adapter = OpenAICompatibleAdapter("openrouter", "https://o.example/v1", "k", "m")
    adapter.query("q", SamplingParams())
    assert adapter.pace_seconds("q", SamplingParams()) == 0.0


def _clear_groq_env(monkeypatch):
    for name in ("GROQ_MODEL", "GROQ_MAX_TOKENS", "GROQ_REASONING_EFFORT", "GROQ_RPM"):
        monkeypatch.setenv(name, "")  # blank = default, and masks any local .env.local value
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")


def test_groq_defaults_cap_answers_and_use_low_reasoning(monkeypatch):
    _clear_groq_env(monkeypatch)
    bodies = _mock_post(monkeypatch)
    adapter = registry.build_provider("groq")
    adapter.query("q", SamplingParams())
    assert bodies[0]["model"] == "openai/gpt-oss-120b"
    assert bodies[0]["max_tokens"] == 1024 and bodies[0]["reasoning_effort"] == "low"


def test_groq_non_gpt_oss_model_gets_no_reasoning_effort(monkeypatch):
    _clear_groq_env(monkeypatch)
    monkeypatch.setenv("GROQ_MODEL", "llama-3.1-8b-instant")
    bodies = _mock_post(monkeypatch)
    registry.build_provider("groq").query("q", SamplingParams())
    assert "reasoning_effort" not in bodies[0]

"""ResilientProvider — the DESIGN_v1 §1.5 wrapper. Everything scripted: a FakeProvider that
raises on cue, a no-op sleep so the tests run instantly while still asserting on the
*durations* that would have been slept, and an in-memory ledger."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.collection.breaker import CircuitBreaker
from app.collection.errors import (
    CircuitOpenError,
    PermanentProviderError,
    ProviderErrorInfo,
    QuotaExhaustedError,
    RateLimitedError,
    TransientProviderError,
)
from app.collection.ledger import FileUsageLedger
from app.collection.limits import MinIntervalPacer, ProviderLimits
from app.collection.resilient import ResilientProvider, RetryPolicy
from app.collection.types import CollectionResult, QuotaState, SamplingParams

LIMITS = ProviderLimits(provider_id="gemini", model_id="m", rpm=10, rpd=1500, daily_budget=1500, max_attempts=3)


class FakeProvider:
    def __init__(self, effects: list):
        self._effects = list(effects)
        self.call_count = 0

    def query(self, prompt, params):
        self.call_count += 1
        effect = self._effects.pop(0)
        if isinstance(effect, Exception):
            raise effect
        return effect

    def quota_state(self):
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)


def _ledger(tmp_path):
    return FileUsageLedger(tmp_path / "ledger.json", clock=lambda: datetime(2026, 9, 2, 12, tzinfo=timezone.utc))


def _result():
    return CollectionResult(
        source_id="gemini", source_kind="llm", model_version="m-001", payload="ok", latency_ms=10
    )


def _wrap(inner, tmp_path, *, sleeps: list, limits: ProviderLimits = LIMITS, breaker=None):
    pacer = MinIntervalPacer(interval_s=0.0, _sleep=lambda s: None)  # pacing itself not under test here
    return ResilientProvider(
        inner,
        limits,
        ledger=_ledger(tmp_path),
        pacer=pacer,
        breaker=breaker,
        retry=RetryPolicy(max_attempts=limits.max_attempts, jitter_ratio=0.0),
        sleep=lambda s: sleeps.append(s),
        rng=__import__("random").Random(0),
    )


def _rate_limited(retry_after_s=None):
    return RateLimitedError(
        ProviderErrorInfo(provider_id="gemini", model_id="m", status_code=429, retry_after_s=retry_after_s)
    )


def _quota_exhausted():
    return QuotaExhaustedError(
        ProviderErrorInfo(provider_id="gemini", model_id="m", status_code=429, quota_id="PerDay")
    )


def _transient():
    return TransientProviderError(ProviderErrorInfo(provider_id="gemini", model_id="m", status_code=503))


def _permanent():
    return PermanentProviderError(ProviderErrorInfo(provider_id="gemini", model_id="m", status_code=400))


def test_rate_limited_then_success_sleeps_at_least_65s_once(tmp_path):
    sleeps: list[float] = []
    inner = FakeProvider([_rate_limited(), _result()])
    provider = _wrap(inner, tmp_path, sleeps=sleeps)
    result = provider.query("hi", SamplingParams())
    assert result.payload == "ok"
    assert inner.call_count == 2
    assert len(sleeps) == 1
    assert sleeps[0] >= 65.0


def test_rate_limited_honors_server_retry_after_over_computed_ladder(tmp_path):
    sleeps: list[float] = []
    inner = FakeProvider([_rate_limited(retry_after_s=12.0), _result()])
    provider = _wrap(inner, tmp_path, sleeps=sleeps)
    provider.query("hi", SamplingParams())
    assert sleeps == [12.0]


def test_quota_exhausted_never_retries_and_opens_breaker(tmp_path):
    sleeps: list[float] = []
    inner = FakeProvider([_quota_exhausted()])
    provider = _wrap(inner, tmp_path, sleeps=sleeps)
    with pytest.raises(QuotaExhaustedError):
        provider.query("hi", SamplingParams())
    assert inner.call_count == 1  # zero retries
    assert sleeps == []
    with pytest.raises(CircuitOpenError):
        provider.query("hi", SamplingParams())
    assert inner.call_count == 1  # breaker stopped the second call before it reached inner


def test_permanent_error_never_retries(tmp_path):
    sleeps: list[float] = []
    inner = FakeProvider([_permanent()])
    provider = _wrap(inner, tmp_path, sleeps=sleeps)
    with pytest.raises(PermanentProviderError):
        provider.query("hi", SamplingParams())
    assert inner.call_count == 1
    assert sleeps == []


def test_transient_error_retries_with_2_4_8_ladder_then_raises(tmp_path):
    sleeps: list[float] = []
    inner = FakeProvider([_transient(), _transient(), _transient()])
    provider = _wrap(inner, tmp_path, sleeps=sleeps, limits=LIMITS)
    with pytest.raises(TransientProviderError):
        provider.query("hi", SamplingParams())
    assert inner.call_count == 3
    assert sleeps == [2.0, 4.0]  # two sleeps between three attempts; no sleep after the last


def test_open_breaker_prevents_any_call(tmp_path):
    sleeps: list[float] = []
    breaker = CircuitBreaker(provider_id="gemini", model_id="m")
    breaker.trip("pre-tripped for test")
    inner = FakeProvider([_result()])
    provider = _wrap(inner, tmp_path, sleeps=sleeps, breaker=breaker)
    with pytest.raises(CircuitOpenError):
        provider.query("hi", SamplingParams())
    assert inner.call_count == 0


def test_preflight_daily_budget_stop_makes_no_call(tmp_path):
    sleeps: list[float] = []
    limits = ProviderLimits(provider_id="gemini", model_id="m", rpm=10, rpd=1500, daily_budget=1)
    ledger = _ledger(tmp_path)
    ledger.record("gemini:m", outcome="success")  # pre-fill today's usage to the budget
    inner = FakeProvider([_result()])
    pacer = MinIntervalPacer(interval_s=0.0, _sleep=lambda s: None)
    provider = ResilientProvider(
        inner, limits, ledger=ledger, pacer=pacer, sleep=lambda s: sleeps.append(s)
    )
    with pytest.raises(QuotaExhaustedError):
        provider.query("hi", SamplingParams())
    assert inner.call_count == 0
    assert sleeps == []


def test_success_reports_via_quota_state_when_ledger_backed(tmp_path):
    limits = ProviderLimits(provider_id="gemini", model_id="m", rpm=10, rpd=1500, daily_budget=100)
    ledger = _ledger(tmp_path)
    inner = FakeProvider([_result()])
    pacer = MinIntervalPacer(interval_s=0.0, _sleep=lambda s: None)
    provider = ResilientProvider(inner, limits, ledger=ledger, pacer=pacer, sleep=lambda s: None)
    provider.query("hi", SamplingParams())
    state = provider.quota_state()
    assert state.remaining_today == 99
    assert not state.exhausted

"""CircuitBreaker — a one-way latch, no half-open probing (DESIGN_v1 §1.5: "stays open
for the remainder of the run")."""

from __future__ import annotations

import pytest

from app.collection.breaker import CircuitBreaker
from app.collection.errors import CircuitOpenError, ProviderErrorInfo, TransientProviderError


def _err() -> TransientProviderError:
    return TransientProviderError(ProviderErrorInfo(provider_id="gemini", model_id="m", message="x"))


def test_opens_after_threshold_consecutive_failures():
    breaker = CircuitBreaker(provider_id="gemini", model_id="m", failure_threshold=3)
    for _ in range(3):
        breaker.record_failure(_err())
    assert breaker.is_open
    with pytest.raises(CircuitOpenError):
        breaker.before_call()


def test_success_resets_the_consecutive_counter():
    breaker = CircuitBreaker(provider_id="gemini", model_id="m", failure_threshold=3)
    breaker.record_failure(_err())
    breaker.record_failure(_err())
    breaker.record_success()
    breaker.record_failure(_err())
    breaker.record_failure(_err())
    assert not breaker.is_open  # only 2 consecutive since the reset


def test_trip_opens_immediately_regardless_of_threshold():
    breaker = CircuitBreaker(provider_id="gemini", model_id="m", failure_threshold=100)
    breaker.trip("quota_exhausted:daily")
    assert breaker.is_open
    assert breaker.open_reason == "quota_exhausted:daily"


def test_latch_never_recloses():
    breaker = CircuitBreaker(provider_id="gemini", model_id="m", failure_threshold=1)
    breaker.record_failure(_err())
    assert breaker.is_open
    breaker.record_success()
    assert breaker.is_open  # no half-open reset — latched for the run


def test_before_call_passes_when_closed():
    breaker = CircuitBreaker(provider_id="gemini", model_id="m")
    breaker.before_call()  # must not raise

"""query_with_retry: backoff source (Retry-After vs exponential) and permanent-error passthrough."""

from __future__ import annotations

import time

import httpx
import pytest

from app.collection import retry
from app.collection.types import CollectionResult, QuotaExhausted, SamplingParams


def _status_error(status: int, headers: dict[str, str] | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.invalid")
    response = httpx.Response(status, headers=headers or {}, request=request)
    return httpx.HTTPStatusError("err", request=request, response=response)


class _FlakyProvider:
    def __init__(self, errors: list[Exception]):
        self._errors = list(errors)
        self.calls = 0

    def query(self, prompt, params):
        self.calls += 1
        if self._errors:
            raise self._errors.pop(0)
        return CollectionResult(source_id="fake", source_kind="llm", model_version="m", payload="ok", latency_ms=1)


def test_retry_after_header_sets_the_wait():
    sleeps: list[float] = []
    provider = _FlakyProvider([_status_error(429, {"retry-after": "30"})])
    result = retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append)
    assert result.payload == "ok"
    assert len(sleeps) == 1 and 30.0 <= sleeps[0] <= 30.0 * 1.25


def test_retry_after_is_capped():
    sleeps: list[float] = []
    provider = _FlakyProvider([_status_error(429, {"retry-after": "45"}), _status_error(503, {"retry-after": "3600"})])
    retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append)
    assert 45.0 <= sleeps[0] <= 45.0 * 1.25
    assert sleeps[1] <= retry.RETRY_AFTER_CAP_SECONDS * 1.25


def test_long_retry_after_on_429_is_quota_exhausted_not_retried():
    sleeps: list[float] = []
    provider = _FlakyProvider([_status_error(429, {"retry-after": "3600"})])
    with pytest.raises(QuotaExhausted) as info:
        retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append)
    assert provider.calls == 1 and sleeps == [] and info.value.resets_in == 3600.0


def _body_429(message: str, headers: dict[str, str] | None = None) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.invalid")
    response = httpx.Response(
        429, headers=headers or {}, json={"error": {"message": message, "code": "rate_limit_exceeded"}}, request=request
    )
    return httpx.HTTPStatusError("err", request=request, response=response)


@pytest.mark.parametrize(
    "message",
    [
        (
            "Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` "
            "on tokens per day (TPD): Limit 200000, Used 199500, Requested 1200. Please try again in 7m12s."
        ),
        "Rate limit reached for model `openai/gpt-oss-120b` on requests per day (RPD): Limit 1000, Used 1000.",
        (
            "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, "
            "limit: 20, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier"
        ),
    ],
)
def test_daily_quota_429_is_not_retried(message):
    provider = _FlakyProvider([_body_429(message, {"retry-after": "30"})])
    with pytest.raises(QuotaExhausted, match="daily quota used up"):
        retry.query_with_retry(provider, "p", SamplingParams(), sleep=lambda s: None)
    assert provider.calls == 1


def test_per_minute_429_is_still_retried():
    sleeps: list[float] = []
    err = _body_429("Rate limit reached ... on tokens per minute (TPM): Limit 8000, Used 7600, Requested 1100.",
                    {"retry-after": "3"})
    provider = _FlakyProvider([err])
    assert retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append).payload == "ok"
    assert provider.calls == 2 and 3.0 <= sleeps[0] <= 3.75


class _PacedProvider(_FlakyProvider):
    def __init__(self, paces: list[float]):
        super().__init__([])
        self._paces = list(paces)

    def pace_seconds(self, prompt, params):
        return self._paces.pop(0) if self._paces else 0.0


def test_pace_seconds_is_waited_out_before_the_call():
    sleeps: list[float] = []
    waits: list[tuple[float, str]] = []
    provider = _PacedProvider([5.0, 0.0])
    retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append, on_wait=lambda s, r: waits.append((s, r)))
    assert sleeps == [5.0] and waits == [(5.0, retry.PACE_REASON)] and provider.calls == 1


def test_should_stop_during_pacing_skips_the_call():
    provider = _PacedProvider([5.0])
    stops = iter([False, True])
    with pytest.raises(retry.Skipped):
        retry.query_with_retry(provider, "p", SamplingParams(), sleep=lambda s: None, should_stop=lambda: next(stops))
    assert provider.calls == 0


def test_without_retry_after_uses_exponential_backoff():
    sleeps: list[float] = []
    provider = _FlakyProvider([_status_error(503), _status_error(503)])
    retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append)
    assert 2.0 <= sleeps[0] <= 2.5 and 4.0 <= sleeps[1] <= 5.0


def test_permanent_error_is_not_retried():
    provider = _FlakyProvider([_status_error(404)])
    with pytest.raises(httpx.HTTPStatusError):
        retry.query_with_retry(provider, "p", SamplingParams(), sleep=lambda s: None)
    assert provider.calls == 1


def test_on_wait_reports_seconds_and_reason():
    waits: list[tuple[float, str]] = []
    provider = _FlakyProvider([_status_error(429, {"retry-after": "40"}), _status_error(503), httpx.ReadTimeout("slow")])
    retry.query_with_retry(provider, "p", SamplingParams(), sleep=lambda s: None, on_wait=lambda s, r: waits.append((s, r)))
    assert [r for _, r in waits] == ["rate limited", "provider error 503", "timed out"]
    assert 40.0 <= waits[0][0] <= 50.0


def test_should_stop_interrupts_a_long_wait():
    """A 60s Retry-After wait is abandoned within one slice once should_stop flips."""
    waits: list[float] = []
    provider = _FlakyProvider([_status_error(429, {"retry-after": "60"})])
    started = time.monotonic()
    stop_at = started + 0.3
    with pytest.raises(retry.Skipped):
        retry.query_with_retry(
            provider, "p", SamplingParams(),
            should_stop=lambda: time.monotonic() >= stop_at,
            on_wait=lambda s, r: waits.append(s),
        )
    elapsed = time.monotonic() - started
    assert provider.calls == 1 and len(waits) == 1 and waits[0] >= 60.0
    assert elapsed < 0.3 + retry.WAIT_SLICE_SECONDS + 0.5


def test_should_stop_before_the_first_attempt_skips_the_call():
    provider = _FlakyProvider([])
    with pytest.raises(retry.Skipped):
        retry.query_with_retry(provider, "p", SamplingParams(), should_stop=lambda: True)
    assert provider.calls == 0


def test_sliced_wait_completes_when_not_stopped(monkeypatch):
    monkeypatch.setattr(retry, "BACKOFF_BASE_SECONDS", 0.05)
    monkeypatch.setattr(retry.random, "uniform", lambda a, b: 0.0)
    provider = _FlakyProvider([_status_error(503)])
    assert retry.query_with_retry(provider, "p", SamplingParams(), should_stop=lambda: False).payload == "ok"
    assert provider.calls == 2

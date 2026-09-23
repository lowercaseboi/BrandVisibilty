"""GroqAdapter error classification — RPM vs RPD discrimination from message text, plus
Retry-After / x-ratelimit-* headers (DESIGN_v1 §1.5)."""

from __future__ import annotations

import httpx
import pytest

from app.collection.errors import PermanentProviderError, QuotaExhaustedError, RateLimitedError, TransientProviderError
from app.collection.providers.groq import GroqAdapter
from app.collection.types import SamplingParams

MODEL = "openai/gpt-oss-20b"


def _adapter(handler) -> GroqAdapter:
    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    return GroqAdapter(api_key="test-key", model=MODEL, client=client)


def test_rpd_message_is_quota_exhausted():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={
                "error": {
                    "message": (
                        "Rate limit reached for model `llama-3.3-70b-versatile` in organization "
                        "`org_x` on requests per day (RPD): Limit 1000, Used 1000, Requested 1. "
                        "Please try again in 3m45s."
                    )
                }
            },
        )

    adapter = _adapter(handler)
    with pytest.raises(QuotaExhaustedError) as exc_info:
        adapter.query("hi", SamplingParams())
    info = exc_info.value.info
    assert info.quota_scope == "day"
    assert info.retry_after_s == pytest.approx(225.0)


def test_rpm_message_is_rate_limited():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={
                "error": {
                    "message": (
                        "Rate limit reached for model `llama-3.3-70b-versatile` on requests per "
                        "minute (RPM): Limit 30, Used 30, Requested 1. Please try again in 12.5s."
                    )
                }
            },
        )

    adapter = _adapter(handler)
    with pytest.raises(RateLimitedError) as exc_info:
        adapter.query("hi", SamplingParams())
    info = exc_info.value.info
    assert info.quota_scope == "minute"
    assert info.retry_after_s == pytest.approx(12.5)


def test_retry_after_header_used_when_message_has_no_duration():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={"error": {"message": "Rate limit reached"}},
            headers={"retry-after": "20"},
        )

    adapter = _adapter(handler)
    with pytest.raises(RateLimitedError) as exc_info:
        adapter.query("hi", SamplingParams())
    assert exc_info.value.info.retry_after_s == 20.0


def test_400_is_permanent():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "invalid_request_error"}})

    adapter = _adapter(handler)
    with pytest.raises(PermanentProviderError):
        adapter.query("hi", SamplingParams())


def test_503_is_transient():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"message": "service unavailable"}})

    adapter = _adapter(handler)
    with pytest.raises(TransientProviderError):
        adapter.query("hi", SamplingParams())

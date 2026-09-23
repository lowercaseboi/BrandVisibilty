"""GeminiAdapter error classification (DESIGN_v1 §1.5 retry classification).

All offline — httpx.MockTransport, no network. Bodies mirror what Gemini actually returns
per its documented error format (google.rpc.Status with RetryInfo/QuotaFailure details).
"""

from __future__ import annotations

import httpx
import pytest

from app.collection.errors import (
    MalformedResponseError,
    PermanentProviderError,
    QuotaExhaustedError,
    RateLimitedError,
    TransientProviderError,
)
from app.collection.providers.gemini import GeminiAdapter
from app.collection.types import SamplingParams

MODEL = "gemini-3.6-flash"


def _adapter(handler) -> GeminiAdapter:
    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    return GeminiAdapter(api_key="test-key", model=MODEL, client=client)


def _ok_candidate(text: str = "hello") -> dict:
    return {
        "candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}],
        "modelVersion": "gemini-3.6-flash-001",
    }


def test_per_minute_429_with_quota_id_is_rate_limited():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={
                "error": {
                    "code": 429,
                    "message": "Resource exhausted",
                    "status": "RESOURCE_EXHAUSTED",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                            "violations": [
                                {
                                    "quotaMetric": "generativelanguage.googleapis.com/generate_requests_per_model",
                                    "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
                                }
                            ],
                        },
                        {
                            "@type": "type.googleapis.com/google.rpc.RetryInfo",
                            "retryDelay": "44s",
                        },
                    ],
                }
            },
        )

    adapter = _adapter(handler)
    with pytest.raises(RateLimitedError) as exc_info:
        adapter.query("hi", SamplingParams())
    info = exc_info.value.info
    assert info.quota_scope == "minute"
    assert info.retry_after_s == 44.0
    assert info.quota_id == "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"


def test_per_day_429_with_quota_id_is_quota_exhausted():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={
                "error": {
                    "code": 429,
                    "message": "Resource exhausted",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                            "violations": [
                                {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}
                            ],
                        },
                    ],
                }
            },
        )

    adapter = _adapter(handler)
    with pytest.raises(QuotaExhaustedError) as exc_info:
        adapter.query("hi", SamplingParams())
    assert exc_info.value.info.quota_scope == "day"


def test_429_with_no_quota_id_and_long_retry_delay_is_inferred_daily():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={
                "error": {
                    "code": 429,
                    "message": "Resource exhausted",
                    "details": [
                        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "3600s"},
                    ],
                }
            },
        )

    adapter = _adapter(handler)
    with pytest.raises(QuotaExhaustedError) as exc_info:
        adapter.query("hi", SamplingParams())
    info = exc_info.value.info
    assert info.quota_scope == "inferred"
    assert info.retry_after_s == 3600.0


def test_429_with_no_quota_id_and_short_retry_delay_is_inferred_per_minute():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={
                "error": {
                    "code": 429,
                    "message": "Resource exhausted",
                    "details": [
                        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "12s"},
                    ],
                }
            },
        )

    adapter = _adapter(handler)
    with pytest.raises(RateLimitedError) as exc_info:
        adapter.query("hi", SamplingParams())
    assert exc_info.value.info.quota_scope == "inferred"
    assert exc_info.value.info.retry_after_s == 12.0


def test_429_with_no_details_at_all_defaults_to_rate_limited():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"code": 429, "message": "Too many requests"}})

    adapter = _adapter(handler)
    with pytest.raises(RateLimitedError) as exc_info:
        adapter.query("hi", SamplingParams())
    assert exc_info.value.info.retry_after_s is None


def test_400_is_permanent_not_retryable():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"code": 400, "message": "Invalid argument"}})

    adapter = _adapter(handler)
    with pytest.raises(PermanentProviderError) as exc_info:
        adapter.query("hi", SamplingParams())
    assert not isinstance(exc_info.value, TransientProviderError)


def test_503_is_transient():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"code": 503, "message": "Unavailable"}})

    adapter = _adapter(handler)
    with pytest.raises(TransientProviderError):
        adapter.query("hi", SamplingParams())


def test_200_with_safety_finish_reason_and_no_parts_is_malformed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"candidates": [{"finishReason": "SAFETY"}], "modelVersion": "gemini-3.6-flash-001"},
        )

    adapter = _adapter(handler)
    with pytest.raises(MalformedResponseError) as exc_info:
        adapter.query("hi", SamplingParams())
    assert exc_info.value.info.finish_reason == "SAFETY"


def test_200_with_no_candidates_at_all_is_malformed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"modelVersion": "gemini-3.6-flash-001"})

    adapter = _adapter(handler)
    with pytest.raises(MalformedResponseError):
        adapter.query("hi", SamplingParams())


def test_healthy_response_returns_collection_result():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_ok_candidate("hello there"))

    adapter = _adapter(handler)
    result = adapter.query("hi", SamplingParams())
    assert result.payload == "hello there"
    assert result.model_version == "gemini-3.6-flash-001"

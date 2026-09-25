"""query_with_retry: backoff source (Retry-After vs exponential) and permanent-error passthrough."""

from __future__ import annotations

import httpx
import pytest

from app.collection import retry
from app.collection.types import CollectionResult, SamplingParams


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
    provider = _FlakyProvider([_status_error(429, {"retry-after": "3600"})])
    retry.query_with_retry(provider, "p", SamplingParams(), sleep=sleeps.append)
    assert sleeps[0] <= retry.RETRY_AFTER_CAP_SECONDS * 1.25


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

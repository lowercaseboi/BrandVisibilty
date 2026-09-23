"""GroqAdapter — LLMProvider implementation for Groq's OpenAI-compatible chat-completions
API (DESIGN_v1 §1.3, §3.4 P=3 providers; §8 secondary/load-spreading tier).

Groq's free tier is far looser than Gemini's (roughly 30 RPM / up to 14,400 RPD depending
on model, vs. Gemini's ~10 RPM / ~1500 RPD), which is what makes adding it the structural
fix for a rate-limited single-provider loop rather than just a bigger backoff ladder.
Like `GeminiAdapter`, this is a pure HTTP <-> types translator: request building, response
parsing, error classification into `app.collection.errors`. No retry/pacing/circuit logic
here — `ResilientProvider` wraps this exactly as it wraps Gemini, unmodified.
"""

from __future__ import annotations

import re
import time

import httpx

from app.collection.errors import (
    MalformedResponseError,
    PermanentProviderError,
    ProviderError,
    ProviderErrorInfo,
    QuotaExhaustedError,
    RateLimitedError,
    TransientProviderError,
)
from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams

_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
_TIMEOUT_SECONDS = 30.0
_TRANSIENT_STATUS = {500, 502, 503, 504}

# Groq's rate-limit message text names the window explicitly, e.g.
# "Rate limit reached for model `llama-3.3-70b-versatile` in organization `...` on
# requests per day (RPD): Limit 1000, Used 1000, Requested 1. Please try again in 3m45s."
_DAILY_HINTS = ("per day", "(rpd)", "requests per day")
_MINUTE_HINTS = ("per minute", "(rpm)", "requests per minute")

# "3m45s" / "45.2s" / "1h2m3s" -> seconds. Groq's Retry-After / reset headers and message
# text use this compact duration form rather than Gemini's protobuf "44s".
_DURATION_COMPONENT_RE = re.compile(r"(\d+(?:\.\d+)?)(h|m|s)")

PROVIDER_ID = "groq"


def _parse_compact_duration(value: str | None) -> float | None:
    if not value:
        return None
    total = 0.0
    matched = False
    for amount, unit in _DURATION_COMPONENT_RE.findall(value):
        matched = True
        total += float(amount) * {"h": 3600.0, "m": 60.0, "s": 1.0}[unit]
    if matched:
        return total
    # Plain numeric Retry-After (seconds), per RFC 7231.
    try:
        return float(value)
    except ValueError:
        return None


def _classify_quota_scope(message: str) -> str:
    lowered = message.lower()
    if any(hint in lowered for hint in _DAILY_HINTS):
        return "day"
    if any(hint in lowered for hint in _MINUTE_HINTS):
        return "minute"
    return "unknown"


class GroqAdapter(LLMProvider):
    def __init__(self, api_key: str, model: str, *, client: httpx.Client | None = None):
        if not api_key:
            raise ValueError("GroqAdapter requires a non-empty api_key")
        if not model:
            raise ValueError("GroqAdapter requires a non-empty model")
        self._api_key = api_key
        self._model = model
        self._client = client or httpx.Client()
        # Last-seen rate-limit headers, refreshed on every response (success or error) —
        # this is what makes quota_state() a measured number instead of an inference.
        self._last_remaining: int | None = None
        self._last_limit: int | None = None
        self._last_reset_s: float | None = None

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        messages = []
        if params.system_prompt:
            messages.append({"role": "system", "content": params.system_prompt})
        messages.append({"role": "user", "content": prompt})

        body: dict = {"model": self._model, "messages": messages}
        # Temperature omitted (not defaulted to 0) when unset — §3.5: the research question
        # is what a typical user sees under provider-default sampling.
        if params.temperature is not None:
            body["temperature"] = params.temperature
        if params.max_output_tokens is not None:
            body["max_completion_tokens"] = params.max_output_tokens
        # No `tools` key at all — tool use / web search is off for v1 (Decisions Log #4).

        start = time.monotonic()
        response = self._client.post(
            _ENDPOINT,
            headers={"Authorization": f"Bearer {self._api_key}"},
            json=body,
            timeout=_TIMEOUT_SECONDS,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        self._capture_rate_limit_headers(response)

        if response.status_code >= 400:
            raise self._classify_error(response)

        data = response.json()
        choices = data.get("choices") or []
        message = choices[0].get("message") if choices else None
        text = message.get("content") if message else None
        finish_reason = choices[0].get("finish_reason") if choices else None
        if not text:
            raise MalformedResponseError(
                ProviderErrorInfo(
                    provider_id=PROVIDER_ID,
                    model_id=self._model,
                    status_code=response.status_code,
                    message="200 response carried no usable content",
                    finish_reason=finish_reason,
                )
            )

        resolved_version = data.get("model", self._model)  # C-3: resolved, not the alias
        usage = data.get("usage")

        return CollectionResult(
            source_id=PROVIDER_ID,
            source_kind="llm",
            model_version=resolved_version,
            payload=text,
            latency_ms=latency_ms,
            token_usage=usage,
            raw_meta=data,
        )

    def _capture_rate_limit_headers(self, response: httpx.Response) -> None:
        headers = response.headers
        remaining = headers.get("x-ratelimit-remaining-requests")
        limit = headers.get("x-ratelimit-limit-requests")
        reset = headers.get("x-ratelimit-reset-requests")
        if remaining is not None:
            try:
                self._last_remaining = int(remaining)
            except ValueError:
                pass
        if limit is not None:
            try:
                self._last_limit = int(limit)
            except ValueError:
                pass
        if reset is not None:
            self._last_reset_s = _parse_compact_duration(reset)

    def _classify_error(self, response: httpx.Response) -> ProviderError:
        try:
            body = response.json()
        except ValueError:
            body = {}
        error = body.get("error", {})
        message = error.get("message", response.text[:500])

        retry_after_s = _parse_compact_duration(response.headers.get("retry-after"))
        # The message text usually carries a "Please try again in <duration>" clause with
        # finer granularity than the header; prefer it when present.
        message_delay_match = re.search(r"try again in ([\dhms.]+)", message, re.IGNORECASE)
        if message_delay_match:
            parsed = _parse_compact_duration(message_delay_match.group(1))
            if parsed is not None:
                retry_after_s = parsed

        info_kwargs = dict(
            provider_id=PROVIDER_ID,
            model_id=self._model,
            status_code=response.status_code,
            message=message,
            retry_after_s=retry_after_s,
        )

        if response.status_code == 429:
            scope = _classify_quota_scope(message)
            if scope == "day":
                return QuotaExhaustedError(ProviderErrorInfo(**info_kwargs, quota_scope="day"))
            if scope == "minute":
                return RateLimitedError(ProviderErrorInfo(**info_kwargs, quota_scope="minute"))
            return RateLimitedError(ProviderErrorInfo(**info_kwargs, quota_scope="inferred"))

        if response.status_code in _TRANSIENT_STATUS:
            return TransientProviderError(ProviderErrorInfo(**info_kwargs))

        return PermanentProviderError(ProviderErrorInfo(**info_kwargs))

    def quota_state(self) -> QuotaState:
        if self._last_remaining is None:
            return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)
        return QuotaState(
            remaining_today=self._last_remaining,
            daily_limit=self._last_limit,
            exhausted=self._last_remaining <= 0,
        )

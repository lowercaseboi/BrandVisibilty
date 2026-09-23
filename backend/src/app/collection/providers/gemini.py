"""GeminiAdapter — LLMProvider implementation for Google Gemini (DESIGN_v1 §1.3, §8 Primary tier).

A pure HTTP <-> types translator: build the request, parse the response, classify any
error into the `app.collection.errors` taxonomy. No retry, no pacing, no circuit
breaking — `ResilientProvider` (§1.5) wraps this once, at the call site, and every other
adapter is expected to do the same rather than reimplement resilience per-provider.
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

_ENDPOINT_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_TIMEOUT_SECONDS = 30.0
_TRANSIENT_STATUS = {500, 502, 503, 504}

_RETRY_INFO_TYPE = "type.googleapis.com/google.rpc.RetryInfo"
_QUOTA_FAILURE_TYPE = "type.googleapis.com/google.rpc.QuotaFailure"
_DURATION_RE = re.compile(r"^(\d+(?:\.\d+)?)s$")

# Above this, a retryDelay with no explicit quotaId is treated as a daily (not per-minute)
# ceiling — nothing per-minute should ever ask a caller to wait this long.
_INFERRED_DAILY_THRESHOLD_S = 300.0

PROVIDER_ID = "gemini"


def _parse_duration_seconds(value: str | None) -> float | None:
    """Parse a protobuf Duration string like "44s" or "1.5s". Returns None if unparseable."""
    if not value:
        return None
    match = _DURATION_RE.match(value.strip())
    return float(match.group(1)) if match else None


class GeminiAdapter(LLMProvider):
    def __init__(self, api_key: str, model: str, *, client: httpx.Client | None = None):
        if not api_key:
            raise ValueError("GeminiAdapter requires a non-empty api_key")
        if not model:
            raise ValueError("GeminiAdapter requires a non-empty model")
        self._api_key = api_key
        self._model = model
        # Injected client makes the adapter testable via httpx.MockTransport with no
        # network, and reuses one connection/TLS session across calls in production
        # instead of paying a fresh handshake per query.
        self._client = client or httpx.Client()

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        body: dict = {"contents": [{"parts": [{"text": prompt}]}]}
        generation_config = {}
        if params.temperature is not None:
            generation_config["temperature"] = params.temperature
        if params.max_output_tokens is not None:
            generation_config["maxOutputTokens"] = params.max_output_tokens
        if generation_config:
            body["generationConfig"] = generation_config
        if params.system_prompt:
            body["systemInstruction"] = {"parts": [{"text": params.system_prompt}]}

        url = _ENDPOINT_TEMPLATE.format(model=self._model)
        start = time.monotonic()
        response = self._client.post(
            url,
            # Key travels as a header, not a query param (PRD §12 / CLAUDE.md): a query
            # param lands verbatim in exception messages built from the request URL —
            # confirmed the hard way when a failed run printed it to stdout on every retry.
            headers={"x-goog-api-key": self._api_key},
            json=body,
            timeout=_TIMEOUT_SECONDS,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        if response.status_code >= 400:
            raise self._classify_error(response)

        data = response.json()
        candidates = data.get("candidates") or []
        parts = candidates[0].get("content", {}).get("parts") if candidates else None
        text = parts[0].get("text") if parts else None
        if not text:
            finish_reason = candidates[0].get("finishReason") if candidates else None
            raise MalformedResponseError(
                ProviderErrorInfo(
                    provider_id=PROVIDER_ID,
                    model_id=self._model,
                    status_code=response.status_code,
                    message="200 response carried no usable text",
                    finish_reason=finish_reason,
                )
            )

        resolved_version = data.get("modelVersion", self._model)  # C-3: resolved, not the alias
        usage = data.get("usageMetadata")

        return CollectionResult(
            source_id=PROVIDER_ID,
            source_kind="llm",
            model_version=resolved_version,
            payload=text,
            latency_ms=latency_ms,
            token_usage=usage,
            raw_meta=data,
        )

    def _classify_error(self, response: httpx.Response) -> ProviderError:
        """Turn a Gemini error response into the shared taxonomy (`app.collection.errors`).

        Gemini's 429 body carries structured detail in `error.details[]`: a `RetryInfo`
        entry with a `retryDelay` duration, and usually a `QuotaFailure` entry naming the
        specific `quotaId` that was hit (its "PerDay"/"PerMinute" substring is what
        distinguishes a daily ceiling — not retryable within this run — from a per-minute
        throttle — retryable after the window refills). When Google omits the quotaId,
        fall back to the retryDelay's *magnitude*: a per-minute wait is at most ~60s, so a
        server-requested wait past `_INFERRED_DAILY_THRESHOLD_S` is inferred to be daily.
        The result is marked `quota_scope="inferred"` so downstream logs show the
        classification was a guess, not a confirmed field.
        """
        try:
            body = response.json()
        except ValueError:
            body = {}
        error = body.get("error", {})
        message = error.get("message", response.text[:500])

        retry_after_s = None
        retry_after_header = response.headers.get("retry-after")
        if retry_after_header is not None:
            try:
                retry_after_s = float(retry_after_header)
            except ValueError:
                retry_after_s = None

        quota_id: str | None = None
        quota_metric: str | None = None
        for detail in error.get("details", []):
            detail_type = detail.get("@type", "")
            if detail_type == _RETRY_INFO_TYPE:
                parsed = _parse_duration_seconds(detail.get("retryDelay"))
                if parsed is not None:
                    retry_after_s = parsed
            elif detail_type == _QUOTA_FAILURE_TYPE:
                violations = detail.get("violations") or []
                if violations:
                    quota_id = violations[0].get("quotaId")
                    quota_metric = violations[0].get("quotaMetric")

        info_kwargs = dict(
            provider_id=PROVIDER_ID,
            model_id=self._model,
            status_code=response.status_code,
            message=message,
            quota_id=quota_id,
            quota_metric=quota_metric,
            retry_after_s=retry_after_s,
        )

        if response.status_code == 429:
            if quota_id and "PerDay" in quota_id:
                return QuotaExhaustedError(ProviderErrorInfo(**info_kwargs, quota_scope="day"))
            if quota_id and "PerMinute" in quota_id:
                return RateLimitedError(ProviderErrorInfo(**info_kwargs, quota_scope="minute"))
            if retry_after_s is not None and retry_after_s > _INFERRED_DAILY_THRESHOLD_S:
                return QuotaExhaustedError(ProviderErrorInfo(**info_kwargs, quota_scope="inferred"))
            return RateLimitedError(ProviderErrorInfo(**info_kwargs, quota_scope="inferred"))

        if response.status_code in _TRANSIENT_STATUS:
            return TransientProviderError(ProviderErrorInfo(**info_kwargs))

        return PermanentProviderError(ProviderErrorInfo(**info_kwargs))

    def quota_state(self) -> QuotaState:
        # Gemini's free tier doesn't expose remaining-quota via the response headers or
        # body on success; real accounting is ResilientProvider's UsageLedger (§1.5).
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)

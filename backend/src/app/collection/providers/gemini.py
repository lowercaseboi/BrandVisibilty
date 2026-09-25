"""GeminiAdapter — LLMProvider implementation for Google Gemini (DESIGN_v1 §1.3, §8 Primary tier).

Minimal for now: a single timed, unretried call. RateLimiter / RetryPolicy /
CircuitBreaker / UsageLedger (§1.5) wrap every provider once the orchestrator
(L1) exists — this adapter alone is only what the query-template generator's
LLM-expansion step (§3.1) needs today.
"""

from __future__ import annotations

import time

import httpx

from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams

_ENDPOINT_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_TIMEOUT_SECONDS = 30.0


class GeminiAdapter(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-3.1-flash-lite"):
        if not api_key:
            raise ValueError("GeminiAdapter requires a non-empty api_key")
        self._api_key = api_key
        self._model = model

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
        response = httpx.post(
            url,
            params={"key": self._api_key},
            json=body,
            timeout=_TIMEOUT_SECONDS,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        response.raise_for_status()
        data = response.json()

        text = data["candidates"][0]["content"]["parts"][0]["text"]
        resolved_version = data.get("modelVersion", self._model)  # C-3: resolved, not the alias
        usage = data.get("usageMetadata")

        return CollectionResult(
            source_id="gemini",
            source_kind="llm",
            model_version=resolved_version,
            payload=text,
            latency_ms=latency_ms,
            token_usage=usage,
            raw_meta=data,
        )

    def quota_state(self) -> QuotaState:
        # Gemini's free tier doesn't expose remaining-quota via the API response;
        # real accounting lives in ProviderUsageLedger (§1.5) once L1/L2 exist.
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)

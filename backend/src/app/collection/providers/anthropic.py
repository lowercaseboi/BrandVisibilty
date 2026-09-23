"""AnthropicAdapter — LLMProvider for Anthropic Claude via the Messages API (plain httpx, no SDK)."""

from __future__ import annotations

import time

import httpx

from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams

_ENDPOINT = "https://api.anthropic.com/v1/messages"
_API_VERSION = "2023-06-01"
_DEFAULT_MAX_TOKENS = 1024
_TIMEOUT_SECONDS = 60.0


class AnthropicAdapter(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-haiku-4-5-20251001"):
        if not api_key:
            raise ValueError("AnthropicAdapter requires a non-empty api_key")
        self._api_key = api_key
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        body: dict = {
            "model": self._model,
            "max_tokens": params.max_output_tokens or _DEFAULT_MAX_TOKENS,
            "messages": [{"role": "user", "content": prompt}],
        }
        if params.system_prompt:
            body["system"] = params.system_prompt
        if params.temperature is not None:
            body["temperature"] = params.temperature

        start = time.monotonic()
        response = httpx.post(
            _ENDPOINT,
            json=body,
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": _API_VERSION,
                "content-type": "application/json",
            },
            timeout=_TIMEOUT_SECONDS,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        response.raise_for_status()
        data = response.json()

        text = "".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
        return CollectionResult(
            source_id="anthropic",
            source_kind="llm",
            model_version=data.get("model", self._model),
            payload=text,
            latency_ms=latency_ms,
            token_usage=data.get("usage"),
            raw_meta={"id": data.get("id"), "stop_reason": data.get("stop_reason")},
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)

"""OpenAICompatibleAdapter — one LLMProvider for every chat-completions-speaking endpoint.

Used for OpenAI, Groq, OpenRouter, Ollama (`<base>/v1`, no key) and any custom
OpenAI-compatible server (LM Studio, vLLM, Together, ...). Plain httpx, no SDK.
The API key is only ever placed in the Authorization header — never logged or returned.
"""

from __future__ import annotations

import time

import httpx

from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams

_TIMEOUT_SECONDS = 60.0


class OpenAICompatibleAdapter(LLMProvider):
    def __init__(
        self,
        provider_id: str,
        base_url: str,
        api_key: str | None,
        model: str,
        *,
        extra_headers: dict[str, str] | None = None,
        timeout: float = _TIMEOUT_SECONDS,
    ):
        if not base_url:
            raise ValueError(f"{provider_id}: base_url is required")
        if not model:
            raise ValueError(f"{provider_id}: model is required")
        self._provider_id = provider_id
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._extra_headers = dict(extra_headers or {})
        self._timeout = timeout

    @property
    def model(self) -> str:
        return self._model

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        messages = []
        if params.system_prompt:
            messages.append({"role": "system", "content": params.system_prompt})
        messages.append({"role": "user", "content": prompt})

        body: dict = {"model": self._model, "messages": messages}
        if params.temperature is not None:
            body["temperature"] = params.temperature
        if params.max_output_tokens is not None:
            body["max_tokens"] = params.max_output_tokens

        headers = {"Content-Type": "application/json", **self._extra_headers}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        start = time.monotonic()
        response = httpx.post(
            f"{self._base_url}/chat/completions",
            json=body,
            headers=headers,
            timeout=self._timeout,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        response.raise_for_status()
        data = response.json()

        message = data["choices"][0]["message"]
        content = message.get("content") or ""
        if isinstance(content, list):  # some gateways return content parts
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))

        return CollectionResult(
            source_id=self._provider_id,
            source_kind="llm",
            model_version=data.get("model", self._model),  # C-3: resolved, not the alias
            payload=content,
            latency_ms=latency_ms,
            token_usage=data.get("usage"),
            raw_meta={"id": data.get("id"), "finish_reason": data["choices"][0].get("finish_reason")},
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)

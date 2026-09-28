"""OpenAICompatibleAdapter — one LLMProvider for every chat-completions-speaking endpoint.

Used for OpenAI, Groq, OpenRouter, Ollama (`<base>/v1`, no key) and any custom
OpenAI-compatible server (LM Studio, vLLM, Together, ...). Plain httpx, no SDK.
The API key is only ever placed in the Authorization header — never logged or returned.

Client-side pacing: Groq (and OpenAI) return `x-ratelimit-remaining-tokens` /
`x-ratelimit-reset-tokens` on every response. The adapter keeps them in a process-wide
`RateBudget` per (provider, base URL, model) — the provider enforces limits per account and
model, so every run in this process shares one budget — and `pace_seconds()` tells the retry
loop how long to wait before the next request would fit. The provider counts a request as
prompt tokens + max_tokens, so that is what is checked. `min_interval` (from a requests-per-
minute limit) additionally spaces requests out. Endpoints that send no such headers
(OpenRouter, Ollama, most local servers) are never paced by headers.
"""

from __future__ import annotations

import re
import threading
import time
from typing import Any

import httpx

from app.collection.types import (
    CollectionResult,
    LLMProvider,
    QuotaState,
    SamplingParams,
)

_TIMEOUT_SECONDS = 60.0
# Token cost assumed for a request whose max_tokens is unset and no usage has been seen yet.
_DEFAULT_COMPLETION_ESTIMATE = 1024
_PACE_MARGIN_SECONDS = 0.25
_DURATION_PART = re.compile(r"(\d+(?:\.\d+)?)(ms|h|m|s)")


def parse_reset(value: str | None) -> float | None:
    """Groq/OpenAI reset durations ("7.66s", "2m59.56s", "1h2m", "450ms") -> seconds."""
    if not value:
        return None
    value = value.strip()
    try:
        return max(0.0, float(value))  # bare number of seconds
    except ValueError:
        pass
    parts = _DURATION_PART.findall(value)
    if not parts or "".join(n + u for n, u in parts) != value:
        return None
    scale = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}
    return sum(float(n) * scale[u] for n, u in parts)


def estimate_prompt_tokens(prompt: str, system_prompt: str | None = None) -> int:
    """Deliberately generous (~3 chars/token + chat-template overhead): under-estimating
    means a request the provider rejects."""
    return (len(prompt) + len(system_prompt or "")) // 3 + 64


class RateBudget:
    """Per-minute token budget as last reported by the provider, plus request spacing."""

    def __init__(self, min_interval: float = 0.0, clock=time.monotonic):
        self.min_interval = min_interval
        self._clock = clock
        self._lock = threading.Lock()
        self._remaining_tokens: int | None = None
        self._tokens_reset_at: float | None = None
        self._last_request_at: float | None = None
        self.last_total_tokens: int | None = None

    def pace_seconds(self, needed_tokens: int) -> float:
        with self._lock:
            now = self._clock()
            wait = 0.0
            if self._last_request_at is not None and self.min_interval > 0:
                wait = max(wait, self._last_request_at + self.min_interval - now)
            if (
                self._remaining_tokens is not None
                and self._tokens_reset_at is not None
                and now < self._tokens_reset_at
                and self._remaining_tokens < needed_tokens
            ):
                wait = max(wait, self._tokens_reset_at - now + _PACE_MARGIN_SECONDS)
            return wait

    def started(self) -> None:
        with self._lock:
            self._last_request_at = self._clock()

    def update(self, headers: httpx.Headers, usage: dict | None = None) -> None:
        with self._lock:
            remaining = headers.get("x-ratelimit-remaining-tokens")
            reset = parse_reset(headers.get("x-ratelimit-reset-tokens"))
            if remaining is not None and reset is not None:
                try:
                    self._remaining_tokens = int(float(remaining))
                    self._tokens_reset_at = self._clock() + reset
                except ValueError:
                    pass
            if usage and isinstance(usage.get("total_tokens"), int):
                self.last_total_tokens = usage["total_tokens"]


_BUDGETS: dict[tuple[str, str, str], RateBudget] = {}
_BUDGETS_LOCK = threading.Lock()


def budget_for(provider_id: str, base_url: str, model: str, *, rpm: int | None = None) -> RateBudget:
    """The shared budget for this provider/model (created on first use)."""
    key = (provider_id, base_url.rstrip("/"), model)
    with _BUDGETS_LOCK:
        budget = _BUDGETS.get(key)
        if budget is None:
            budget = _BUDGETS[key] = RateBudget()
        budget.min_interval = 60.0 / rpm if rpm else 0.0
        return budget


def reset_budgets() -> None:
    """Forget all remembered budgets (tests)."""
    with _BUDGETS_LOCK:
        _BUDGETS.clear()


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
        max_tokens: int | None = None,
        extra_body: dict[str, Any] | None = None,
        rpm: int | None = None,
    ):
        """`max_tokens` caps each answer unless SamplingParams sets its own;
        `extra_body` adds provider-specific fields (e.g. Groq's reasoning_effort);
        `rpm` spaces requests at least 60/rpm seconds apart."""
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
        self._max_tokens = max_tokens
        self._extra_body = dict(extra_body or {})
        self._budget = budget_for(provider_id, self._base_url, model, rpm=rpm)

    @property
    def model(self) -> str:
        return self._model

    def _effective_max_tokens(self, params: SamplingParams) -> int | None:
        return params.max_output_tokens if params.max_output_tokens is not None else self._max_tokens

    def pace_seconds(self, prompt: str, params: SamplingParams) -> float:
        """Seconds to wait before this request fits the provider's reported budget."""
        completion = self._effective_max_tokens(params)
        if completion is None:
            completion = self._budget.last_total_tokens or _DEFAULT_COMPLETION_ESTIMATE
        return self._budget.pace_seconds(estimate_prompt_tokens(prompt, params.system_prompt) + completion)

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        messages = []
        if params.system_prompt:
            messages.append({"role": "system", "content": params.system_prompt})
        messages.append({"role": "user", "content": prompt})

        body: dict = {**self._extra_body, "model": self._model, "messages": messages}
        if params.temperature is not None:
            body["temperature"] = params.temperature
        max_tokens = self._effective_max_tokens(params)
        if max_tokens is not None:
            body["max_tokens"] = max_tokens

        headers = {"Content-Type": "application/json", **self._extra_headers}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        start = time.monotonic()
        self._budget.started()
        response = httpx.post(
            f"{self._base_url}/chat/completions",
            json=body,
            headers=headers,
            timeout=self._timeout,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        self._budget.update(response.headers)  # 429s carry the headers too
        response.raise_for_status()
        data = response.json()
        self._budget.update(httpx.Headers(), data.get("usage"))

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

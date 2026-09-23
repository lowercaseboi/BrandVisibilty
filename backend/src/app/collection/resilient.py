"""ResilientProvider — the DESIGN_v1 §1.5 retry/pacing/circuit-breaker/ledger wrapper.

Wraps any `LLMProvider` at the call boundary. Imports only `app.collection.errors`,
`limits`, `breaker`, and `ledger` — never `httpx`, never a provider name — so it works
unmodified for Gemini, Groq, or a future OpenRouter adapter, and can be pointed at a
Redis-backed pacer / Postgres-backed ledger later by swapping two constructor arguments.

The two changes here that actually fix the original 429 storm (3% success rate, 1 sample
collected out of 34 attempted):

1. `pacer.acquire()` runs before *every* attempt, including the first. The old loop fired
   requests back to back with zero spacing; a ~10 RPM ceiling was blown through in
   seconds.
2. The 429 backoff ladder starts at `rate_limit_base_s` (default 65s), not 2s. The old
   ladder (2s, 4s, 8s) spent its entire retry budget inside the same 60-second window that
   caused the first 429 — every attempt was guaranteed to fail. 65s (rather than a bare
   60s) allows for clock skew and window-boundary alignment; the server's own
   `retry_after_s` always takes precedence when present.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Callable

from app.collection.breaker import CircuitBreaker
from app.collection.errors import (
    PermanentProviderError,
    QuotaExhaustedError,
    RateLimitedError,
    TransientProviderError,
)
from app.collection.ledger import UsageLedger
from app.collection.limits import MinIntervalPacer, Pacer, ProviderLimits
from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    transient_base_s: float = 2.0
    transient_cap_s: float = 30.0
    rate_limit_base_s: float = 65.0
    rate_limit_cap_s: float = 300.0
    jitter_ratio: float = 0.25

    def transient_delay(self, attempt: int) -> float:
        return min(self.transient_cap_s, self.transient_base_s * (2 ** (attempt - 1)))

    def rate_limit_delay(self, attempt: int) -> float:
        return min(self.rate_limit_cap_s, self.rate_limit_base_s * (2 ** (attempt - 1)))


def _jitter(delay: float, ratio: float, rng: random.Random) -> float:
    return delay + rng.uniform(0, delay * ratio)


class ResilientProvider(LLMProvider):
    def __init__(
        self,
        inner: LLMProvider,
        limits: ProviderLimits,
        *,
        ledger: UsageLedger,
        pacer: Pacer | None = None,
        breaker: CircuitBreaker | None = None,
        retry: RetryPolicy | None = None,
        sleep: Callable[[float], None] = time.sleep,
        rng: random.Random | None = None,
        on_event: Callable[[str, dict], None] | None = None,
    ) -> None:
        self._inner = inner
        self._limits = limits
        self._ledger = ledger
        self._pacer = pacer or MinIntervalPacer(interval_s=limits.pacing_interval_s)
        self._breaker = breaker or CircuitBreaker(
            provider_id=limits.provider_id, model_id=limits.model_id
        )
        self._retry = retry or RetryPolicy(max_attempts=limits.max_attempts)
        self._sleep = sleep
        self._rng = rng or random.Random()
        self._on_event = on_event or (lambda name, data: None)

    def _emit(self, name: str, **data) -> None:
        self._on_event(name, data)

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        self._breaker.before_call()

        usage = self._ledger.usage_today(self._limits.ledger_key, reset_tz=self._limits.daily_reset_tz)
        if usage.requests >= self._limits.effective_daily_budget:
            self._breaker.trip("daily_budget_reached")
            self._emit("daily_budget_reached", key=self._limits.ledger_key, requests=usage.requests)
            raise QuotaExhaustedError(
                self._inner_error_info(
                    message=f"local daily budget reached ({usage.requests}/{self._limits.effective_daily_budget})",
                    quota_scope="day",
                )
            )

        last_error: Exception | None = None
        for attempt in range(1, self._retry.max_attempts + 1):
            self._pacer.acquire()
            try:
                result = self._inner.query(prompt, params)
            except QuotaExhaustedError as exc:
                self._ledger.record(
                    self._limits.ledger_key, outcome="error", reset_tz=self._limits.daily_reset_tz
                )
                self._ledger.mark_exhausted(
                    self._limits.ledger_key,
                    quota_id=exc.info.quota_id,
                    reset_tz=self._limits.daily_reset_tz,
                )
                self._breaker.trip(f"quota_exhausted:{exc.info.quota_id or 'unknown'}")
                self._emit("quota_exhausted", key=self._limits.ledger_key, quota_id=exc.info.quota_id)
                raise
            except RateLimitedError as exc:
                self._ledger.record(
                    self._limits.ledger_key, outcome="rate_limited", reset_tz=self._limits.daily_reset_tz
                )
                self._breaker.record_failure(exc)
                last_error = exc
                if attempt == self._retry.max_attempts:
                    raise
                delay = exc.info.retry_after_s or self._retry.rate_limit_delay(attempt)
                self._pacer.penalize(delay)
                sleep_for = _jitter(delay, self._retry.jitter_ratio, self._rng)
                self._emit("rate_limited_retry", attempt=attempt, sleep_s=sleep_for)
                self._sleep(sleep_for)
            except TransientProviderError as exc:
                self._ledger.record(
                    self._limits.ledger_key, outcome="error", reset_tz=self._limits.daily_reset_tz
                )
                self._breaker.record_failure(exc)
                last_error = exc
                if attempt == self._retry.max_attempts:
                    raise
                delay = exc.info.retry_after_s or self._retry.transient_delay(attempt)
                sleep_for = _jitter(delay, self._retry.jitter_ratio, self._rng)
                self._emit("transient_retry", attempt=attempt, sleep_s=sleep_for)
                self._sleep(sleep_for)
            except PermanentProviderError as exc:
                self._ledger.record(
                    self._limits.ledger_key, outcome="error", reset_tz=self._limits.daily_reset_tz
                )
                self._breaker.record_failure(exc)
                raise
            else:
                self._ledger.record(
                    self._limits.ledger_key,
                    outcome="success",
                    reset_tz=self._limits.daily_reset_tz,
                    token_usage=result.token_usage,
                )
                self._breaker.record_success()
                return result

        assert last_error is not None
        raise last_error

    def _inner_error_info(self, *, message: str, quota_scope: str):
        from app.collection.errors import ProviderErrorInfo

        return ProviderErrorInfo(
            provider_id=self._limits.provider_id,
            model_id=self._limits.model_id,
            message=message,
            quota_scope=quota_scope,  # type: ignore[arg-type]
        )

    def quota_state(self) -> QuotaState:
        inner_state = self._inner.quota_state()
        if inner_state.remaining_today is not None:
            return inner_state

        usage = self._ledger.usage_today(self._limits.ledger_key, reset_tz=self._limits.daily_reset_tz)
        budget = self._limits.effective_daily_budget
        remaining = max(0, budget - usage.requests)
        exhausted = self._breaker.is_open or remaining <= 0
        return QuotaState(remaining_today=remaining, daily_limit=self._limits.rpd, exhausted=exhausted)

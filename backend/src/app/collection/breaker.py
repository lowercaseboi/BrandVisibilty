"""Per-(provider, model) circuit breaker (DESIGN_v1 §1.5).

A latch, not a half-open/retry-probe breaker: "opens after M consecutive failures or on
quota exhaustion, and stays open for the remainder of the run" (§1.5) is explicit that
this is a one-way gate for the run's lifetime, not a self-healing breaker. Scoped per
(provider, model) to match `ProviderLimits.ledger_key`, so one exhausted OpenRouter model
doesn't stop the other two free models sharing the same provider_id.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.collection.errors import CircuitOpenError, ProviderError, ProviderErrorInfo


@dataclass
class CircuitBreaker:
    provider_id: str
    model_id: str
    failure_threshold: int = 5

    _consecutive_failures: int = field(default=0, init=False)
    _open_reason: str | None = field(default=None, init=False)

    @property
    def is_open(self) -> bool:
        return self._open_reason is not None

    @property
    def open_reason(self) -> str | None:
        return self._open_reason

    def before_call(self) -> None:
        if self._open_reason is not None:
            raise CircuitOpenError(
                ProviderErrorInfo(
                    provider_id=self.provider_id,
                    model_id=self.model_id,
                    message=f"circuit open: {self._open_reason}",
                )
            )

    def record_success(self) -> None:
        self._consecutive_failures = 0

    def record_failure(self, err: ProviderError) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.failure_threshold:
            self.trip(f"{self._consecutive_failures} consecutive failures ({err.info.describe()})")

    def trip(self, reason: str) -> None:
        """Open the breaker immediately, bypassing the consecutive-failure count.

        Used for quota exhaustion and the pre-flight daily-budget check, where a single
        event is sufficient reason to stop — waiting for `failure_threshold` more failed
        calls would just burn quota confirming what is already known.
        """
        if self._open_reason is None:
            self._open_reason = reason

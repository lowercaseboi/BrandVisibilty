"""Provider error taxonomy — the vocabulary the resilience layer reasons over (DESIGN_v1 §1.5).

Every adapter's one extra job beyond translating requests and responses is translating
its provider's error wire format into these types. `ResilientProvider` then imports this
module and nothing else provider-specific: no `httpx`, no provider names, no status-code
tables. That is what lets a Groq or OpenRouter adapter drop in without the retry, pacing,
or circuit-breaker code changing at all.

**One deliberate refinement of §1.5.** The design doc classifies "429 / 5xx / timeout" as
transient and retryable. That is right for a per-minute throttle and wrong for a per-day
quota: a daily 429 cannot succeed before the quota window rolls over, so retrying it only
burns the circuit breaker's failure budget and delays the clean stop. §1.5 separately says
the breaker opens "on quota exhaustion," so `QuotaExhaustedError` is filling in *how
exhaustion is detected*, not overriding the doc. It deliberately does not subclass
`TransientProviderError`, so the distinction is enforced by the type system rather than by
a status-code check every caller has to remember to write.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

QuotaScope = Literal["minute", "day", "inferred", "unknown"]


@dataclass(frozen=True)
class ProviderErrorInfo:
    """Structured detail about one failed provider call.

    `message` must be the provider's own error text and nothing more — never a URL, never
    a header dump. The credentials in this project have already leaked once through an
    exception message built from a request URL (the API key used to travel as a query
    parameter), so error construction is treated as a place secrets escape from.
    """

    provider_id: str
    model_id: str
    status_code: int | None = None
    message: str = ""
    quota_id: str | None = None  # e.g. "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"
    quota_metric: str | None = None
    quota_scope: QuotaScope = "unknown"
    retry_after_s: float | None = None  # server's own hint; always beats a computed backoff
    finish_reason: str | None = None  # set on MalformedResponseError: SAFETY, RECITATION, ...

    def describe(self) -> str:
        """One-line, secret-free summary for logs and stored failure records."""
        parts = [f"{self.provider_id}:{self.model_id}"]
        if self.status_code is not None:
            parts.append(f"HTTP {self.status_code}")
        if self.quota_id:
            parts.append(f"quota={self.quota_id} ({self.quota_scope})")
        if self.retry_after_s is not None:
            parts.append(f"retry_after={self.retry_after_s:g}s")
        if self.finish_reason:
            parts.append(f"finish_reason={self.finish_reason}")
        if self.message:
            parts.append(self.message)
        return " | ".join(parts)


class ProviderError(Exception):
    """Base for every provider failure. Carries `info` so callers classify on type, not text."""

    def __init__(self, info: ProviderErrorInfo):
        super().__init__(info.describe())
        self.info = info


class PermanentProviderError(ProviderError):
    """A 4xx that is not a 429 — a malformed request, a bad key, a retired model.

    Never retried (§1.5: "Retrying a 400 just burns quota").
    """


class MalformedResponseError(PermanentProviderError):
    """HTTP 200 carrying no usable text.

    Gemini returns this shape when a candidate finishes on SAFETY / RECITATION /
    MAX_TOKENS: the response is structurally valid but has no `parts`. Retrying the same
    prompt reproduces it, so it is permanent — but it is a distinct subclass because it is
    a property of the prompt rather than of the request, and a run with many of these is
    telling you something about the query set, not about the transport.
    """


class TransientProviderError(ProviderError):
    """5xx, timeout, connection reset — retry with exponential backoff."""


class RateLimitedError(TransientProviderError):
    """429 against a per-minute window. Retryable, but only after the window refills.

    The window is the reason the previous 2s/4s/8s ladder never recovered: it spent every
    attempt inside the same throttled minute. Backoff for this class starts above 60s.
    """


class QuotaExhaustedError(ProviderError):
    """429 against a per-day ceiling, or a locally-tracked daily budget being reached.

    Not a `TransientProviderError` on purpose — see the module docstring. Opens the
    circuit breaker so the rest of the run stops cleanly instead of grinding through
    every remaining tuple to collect an identical error.
    """


class CircuitOpenError(ProviderError):
    """The breaker is latched for this (provider, model); no request was made.

    Distinct from the error that opened the breaker so a run report can separate "this
    call failed" from "this call was never attempted" (PRD §15.4 partial-result
    accounting).
    """

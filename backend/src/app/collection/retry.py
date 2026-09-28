"""Bounded retry for transient provider failures (PRD §15.4).

Timeouts, 429 and 5xx are retried with capped exponential backoff plus jitter;
anything else propagates immediately — retrying a permanent error just burns quota.
A numeric Retry-After header (Groq sends one on its per-minute token limit) wins over
the exponential backoff, capped at RETRY_AFTER_CAP_SECONDS.

A 429 for a *daily* quota (Groq "tokens per day (TPD)" / "requests per day (RPD)", Gemini
"...PerDay...") or one whose Retry-After is longer than RETRY_AFTER_CAP_SECONDS is not
retried: it raises `QuotaExhausted` at once, because the quota won't return within the run.

Providers may also expose `pace_seconds(prompt, params) -> float` (the OpenAI-compatible
adapter does, from the provider's rate-limit headers). It is checked before every attempt
and a positive value is waited out first, so a run slows down to stay under a per-minute
token limit instead of slamming into 429s.

Waits are interruptible: they run in short slices and check `should_stop` between
slices, raising `Skipped` as soon as it returns True — so a user (or the pipeline's
auto-skip) can abandon a provider stuck on a rate limit without waiting it out.
"""

from __future__ import annotations

import logging
import random
import re
import threading
import time
from collections.abc import Callable

import httpx

from app.collection.types import (
    CollectionResult,
    LLMProvider,
    QuotaExhausted,
    SamplingParams,
)

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 4
BACKOFF_BASE_SECONDS = 2.0
BACKOFF_CAP_SECONDS = 20.0
RETRY_AFTER_CAP_SECONDS = 60.0
WAIT_SLICE_SECONDS = 0.5
PACE_REASON = "pacing to stay under the rate limit"

# Matches Groq's "tokens per day (TPD)" / "requests per day (RPD)" and Gemini's
# "GenerateRequestsPerDayPerProjectPerModel" 429 messages.
_DAILY_LIMIT_RE = re.compile(r"per[ _-]?day|\b(?:TPD|RPD)\b", re.IGNORECASE)


class Skipped(Exception):
    """should_stop() returned True: the caller asked to abandon this call (provider skipped)."""


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS
    return isinstance(exc, httpx.TimeoutException)


def _raw_retry_after(exc: Exception) -> float | None:
    if not isinstance(exc, httpx.HTTPStatusError):
        return None
    try:
        return max(0.0, float(exc.response.headers.get("retry-after", "")))
    except ValueError:  # absent, or an HTTP-date (not sent by any provider we use)
        return None


def _retry_after_seconds(exc: Exception) -> float | None:
    raw = _raw_retry_after(exc)
    return None if raw is None else min(RETRY_AFTER_CAP_SECONDS, raw)


def quota_exhausted(exc: Exception) -> QuotaExhausted | None:
    """A QuotaExhausted for a 429 that won't clear within a run (daily quota, or a
    Retry-After beyond RETRY_AFTER_CAP_SECONDS); None for anything else."""
    if not (isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429):
        return None
    retry_after = _raw_retry_after(exc)
    try:
        body = exc.response.text
    except Exception:  # noqa: BLE001 - unread/streamed body: judge by the header alone
        body = ""
    if _DAILY_LIMIT_RE.search(body or ""):
        return QuotaExhausted("daily quota used up", retry_after)
    if retry_after is not None and retry_after > RETRY_AFTER_CAP_SECONDS:
        return QuotaExhausted("quota used up", retry_after)
    return None


def wait_reason(exc: Exception) -> str:
    """Short, safe description of a retryable failure (never the request or URL)."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return "rate limited" if code == 429 else f"provider error {code}"
    return "timed out"


def _interruptible_wait(seconds: float, should_stop: Callable[[], bool] | None) -> None:
    deadline = time.monotonic() + seconds
    pause = threading.Event()  # never set: wait() is just a sleep that time.sleep patches don't touch
    while True:
        if should_stop is not None and should_stop():
            raise Skipped
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        pause.wait(min(WAIT_SLICE_SECONDS, remaining))


def query_with_retry(
    provider: LLMProvider,
    prompt: str,
    params: SamplingParams,
    *,
    max_attempts: int = MAX_ATTEMPTS,
    sleep: Callable[[float], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
    on_wait: Callable[[float, str], None] | None = None,
) -> CollectionResult:
    """Call the provider, retrying transient failures.

    `should_stop` is checked before every attempt and throughout every wait; when it returns
    True, `Skipped` is raised. `on_wait(seconds, reason)` is called before each wait.
    `sleep` replaces the sliced wait (tests); should_stop is then checked before and after it.
    """
    pace = getattr(provider, "pace_seconds", None)
    for attempt in range(1, max_attempts + 1):
        if should_stop is not None and should_stop():
            raise Skipped
        if callable(pace):
            _wait_for_pace(pace, prompt, params, sleep=sleep, should_stop=should_stop, on_wait=on_wait)
        try:
            return provider.query(prompt, params)
        except Exception as exc:
            exhausted = quota_exhausted(exc)
            if exhausted is not None:
                logger.warning("provider quota used up (%s); not retrying", exhausted)
                raise exhausted from exc
            if not _is_retryable(exc) or attempt == max_attempts:
                raise
            backoff = _retry_after_seconds(exc)
            if backoff is None:
                backoff = min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
            backoff += random.uniform(0, max(backoff, 1.0) * 0.25)
            reason = wait_reason(exc)
            # Log the reason only — never the request (it may carry a key).
            logger.warning("transient error (%s), retrying in %.1fs (attempt %d/%d)", reason, backoff, attempt, max_attempts)
            if on_wait is not None:
                on_wait(backoff, reason)
        if sleep is None:
            _interruptible_wait(backoff, should_stop)
        else:
            sleep(backoff)
    raise RuntimeError("unreachable")  # pragma: no cover


def _wait_for_pace(
    pace: Callable[[str, SamplingParams], float],
    prompt: str,
    params: SamplingParams,
    *,
    sleep: Callable[[float], None] | None,
    should_stop: Callable[[], bool] | None,
    on_wait: Callable[[float, str], None] | None,
) -> None:
    # Re-check after each wait: another run (or a bigger request) may have used the budget.
    for _ in range(5):
        seconds = float(pace(prompt, params) or 0.0)
        if seconds <= 0:
            return
        seconds = min(seconds, RETRY_AFTER_CAP_SECONDS)
        if on_wait is not None:
            on_wait(seconds, PACE_REASON)
        if sleep is None:
            _interruptible_wait(seconds, should_stop)
        else:
            sleep(seconds)
            if should_stop is not None and should_stop():
                raise Skipped

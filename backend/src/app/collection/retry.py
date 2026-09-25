"""Bounded retry for transient provider failures (PRD §15.4).

Timeouts, 429 and 5xx are retried with capped exponential backoff plus jitter;
anything else propagates immediately — retrying a permanent error just burns quota.
A numeric Retry-After header (Groq sends one on its per-minute token limit) wins over
the exponential backoff, capped at RETRY_AFTER_CAP_SECONDS.
"""

from __future__ import annotations

import logging
import random
import time

import httpx

from app.collection.types import CollectionResult, LLMProvider, SamplingParams

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 4
BACKOFF_BASE_SECONDS = 2.0
BACKOFF_CAP_SECONDS = 20.0
RETRY_AFTER_CAP_SECONDS = 60.0


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS
    return isinstance(exc, httpx.TimeoutException)


def _retry_after_seconds(exc: Exception) -> float | None:
    if not isinstance(exc, httpx.HTTPStatusError):
        return None
    try:
        return min(RETRY_AFTER_CAP_SECONDS, max(0.0, float(exc.response.headers.get("retry-after", ""))))
    except ValueError:  # absent, or an HTTP-date (not sent by any provider we use)
        return None


def query_with_retry(
    provider: LLMProvider,
    prompt: str,
    params: SamplingParams,
    *,
    max_attempts: int = MAX_ATTEMPTS,
    sleep=time.sleep,
) -> CollectionResult:
    for attempt in range(1, max_attempts + 1):
        try:
            return provider.query(prompt, params)
        except Exception as exc:
            if not _is_retryable(exc) or attempt == max_attempts:
                raise
            backoff = _retry_after_seconds(exc)
            if backoff is None:
                backoff = min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
            backoff += random.uniform(0, max(backoff, 1.0) * 0.25)
            # Log the exception type/status only — never the request (it may carry a key).
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
            logger.warning("transient error (%s), retrying in %.1fs (attempt %d/%d)", status, backoff, attempt, max_attempts)
            sleep(backoff)
    raise RuntimeError("unreachable")  # pragma: no cover

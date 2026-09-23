"""Per-provider pacing configuration (DESIGN_v1 §1.5, §3.4).

`ProviderLimits` is the file-mode config unit, and it is keyed by **(provider, model)**,
not by provider alone — the file-mode expression of DESIGN §2.1 splitting `ProviderModel`
from `Provider`. OpenRouter's ~50-requests/day/model cap only makes sense per model; a
per-provider limit would either under- or over-count it once several free models are in
play.

**Divergence from §1.5, deliberate.** The design doc specifies a Redis token bucket.
A bucket with capacity N permits an instantaneous burst of N requests — which is exactly
the traffic shape that caused the original incident against a sliding 60-second window:
the loop fired everything back to back, burned the whole per-minute allowance in seconds,
then spent its retry budget re-hitting an already-exhausted window. `MinIntervalPacer`
enforces a hard minimum spacing between calls and cannot burst by construction. Keep
min-interval as the default even after a Redis-backed limiter exists; a burst allowance
can be added later as an explicit, opt-in parameter rather than the implicit default.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Protocol


@dataclass(frozen=True)
class ProviderLimits:
    """Static rate/quota configuration for one (provider, model) pair.

    `daily_budget` is deliberately allowed to sit below `rpd` — leaving headroom below the
    provider's hard daily ceiling absorbs the (provider-scoped, not machine-scoped) usage
    this file-mode ledger cannot see, e.g. calls made from another machine or process
    sharing the same API key.
    """

    provider_id: str
    model_id: str
    rpm: int
    rpd: int
    daily_budget: int | None = None
    safety_factor: float = 1.15  # pace slower than the nominal RPM to absorb clock skew/jitter
    min_interval_s: float | None = None  # overrides the rpm-derived interval when set
    daily_reset_tz: str = "UTC"
    max_attempts: int = 3
    enabled: bool = True

    @property
    def pacing_interval_s(self) -> float:
        if self.min_interval_s is not None:
            return self.min_interval_s
        return (60.0 / self.rpm) * self.safety_factor

    @property
    def effective_daily_budget(self) -> int:
        return self.daily_budget if self.daily_budget is not None else self.rpd

    @property
    def ledger_key(self) -> str:
        return f"{self.provider_id}:{self.model_id}"


class Pacer(Protocol):
    def acquire(self) -> None:
        """Block (if needed) until the next call is permitted, then reserve that slot."""
        ...

    def penalize(self, seconds: float) -> None:
        """Push the next-allowed time forward by `seconds` from now, e.g. after a 429."""
        ...


@dataclass
class MinIntervalPacer:
    """Enforces a hard minimum spacing between successive `acquire()` calls.

    `monotonic`/`sleep` are injectable so tests can assert on the computed wait without
    a real clock or a real sleep.
    """

    interval_s: float
    _monotonic: Callable[[], float] = field(default=time.monotonic)
    _sleep: Callable[[float], None] = field(default=time.sleep)
    _next_allowed: float | None = field(default=None, init=False)

    def acquire(self) -> None:
        now = self._monotonic()
        if self._next_allowed is not None and self._next_allowed > now:
            self._sleep(self._next_allowed - now)
            now = self._monotonic()
        self._next_allowed = now + self.interval_s

    def penalize(self, seconds: float) -> None:
        candidate = self._monotonic() + seconds
        if self._next_allowed is None or candidate > self._next_allowed:
            self._next_allowed = candidate

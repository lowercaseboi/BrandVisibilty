"""Durable per-day usage ledger — file-mode stand-in for the Postgres `ProviderUsageLedger`
(DESIGN_v1 §1.5, AC-11).

A day is scoped per provider because free-tier quota days don't all reset at the same
instant: Gemini's free tier resets at midnight Pacific time, Groq's at midnight UTC.
Getting this wrong drifts the local budget out of sync with the real one in either
direction, so `daily_reset_tz` is per `ProviderLimits` and threaded through here.

Single-process only for now — concurrent writers would race on the read-modify-write in
`record()`. The seam for a lock (an `fcntl.flock` on the ledger file, or later a Postgres
row-level lock) is the `_load`/`_save` pair; note that here rather than build it before it
is needed.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal, Protocol
from zoneinfo import ZoneInfo

Outcome = Literal["success", "rate_limited", "error"]


@dataclass(frozen=True)
class DailyUsage:
    day: str
    requests: int = 0
    successes: int = 0
    rate_limited: int = 0
    errors: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    exhausted_at: str | None = None
    exhausted_quota_id: str | None = None


class UsageLedger(Protocol):
    def usage_today(self, key: str, *, reset_tz: str = "UTC") -> DailyUsage: ...

    def record(
        self,
        key: str,
        *,
        outcome: Outcome,
        reset_tz: str = "UTC",
        token_usage: dict | None = None,
    ) -> None: ...

    def mark_exhausted(self, key: str, *, quota_id: str | None, reset_tz: str = "UTC") -> None: ...

    def last_call_at(self, key: str) -> datetime | None: ...


def _day_key(now: datetime, tz_name: str) -> str:
    return now.astimezone(ZoneInfo(tz_name)).date().isoformat()


class FileUsageLedger:
    """JSON-on-disk ledger: `{day: {"<provider>:<model>": {...DailyUsage fields...}}}`.

    Writes are atomic (`.tmp` + `os.replace`) so a crash mid-write can't corrupt the file
    a resumed run depends on. A corrupt or unreadable file is treated as an empty ledger
    with a printed warning rather than a crash — losing today's usage count is recoverable
    (the pre-flight daily-budget check just becomes conservative-by-omission for one run);
    refusing to start collecting is not.
    """

    def __init__(self, path: Path, *, clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)):
        self._path = path
        self._clock = clock
        # last_call_at is tracked separately, keyed by (provider:model), independent of
        # day-bucketing, since pacing needs "when was the most recent call" not "how many
        # calls today."
        self._last_call_key = "_last_call_at"

    def _load(self) -> dict:
        if not self._path.exists():
            return {}
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"warning: usage ledger at {self._path} unreadable ({exc!r}); starting fresh")
            return {}

    def _save(self, data: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_suffix(self._path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp_path, self._path)

    def usage_today(self, key: str, *, reset_tz: str = "UTC") -> DailyUsage:
        data = self._load()
        day = _day_key(self._clock(), reset_tz)
        raw = data.get(day, {}).get(key)
        if raw is None:
            return DailyUsage(day=day)
        return DailyUsage(**{**raw, "day": day})

    def record(
        self,
        key: str,
        *,
        outcome: Outcome,
        reset_tz: str = "UTC",
        token_usage: dict | None = None,
    ) -> None:
        data = self._load()
        now = self._clock()
        day = _day_key(now, reset_tz)
        bucket = data.setdefault(day, {})
        current = DailyUsage(**{**bucket.get(key, {}), "day": day}) if key in bucket else DailyUsage(day=day)

        prompt_tokens = current.prompt_tokens
        completion_tokens = current.completion_tokens
        if token_usage:
            prompt_tokens += int(token_usage.get("promptTokenCount") or token_usage.get("prompt_tokens") or 0)
            completion_tokens += int(
                token_usage.get("candidatesTokenCount") or token_usage.get("completion_tokens") or 0
            )

        updated = DailyUsage(
            day=day,
            requests=current.requests + 1,
            successes=current.successes + (1 if outcome == "success" else 0),
            rate_limited=current.rate_limited + (1 if outcome == "rate_limited" else 0),
            errors=current.errors + (1 if outcome == "error" else 0),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            exhausted_at=current.exhausted_at,
            exhausted_quota_id=current.exhausted_quota_id,
        )
        bucket[key] = asdict(updated)
        data.setdefault(self._last_call_key, {})[key] = now.isoformat()
        self._save(data)

    def mark_exhausted(self, key: str, *, quota_id: str | None, reset_tz: str = "UTC") -> None:
        data = self._load()
        now = self._clock()
        day = _day_key(now, reset_tz)
        bucket = data.setdefault(day, {})
        current = DailyUsage(**{**bucket.get(key, {}), "day": day}) if key in bucket else DailyUsage(day=day)
        updated = asdict(current)
        updated["exhausted_at"] = now.isoformat()
        updated["exhausted_quota_id"] = quota_id
        bucket[key] = updated
        self._save(data)

    def last_call_at(self, key: str) -> datetime | None:
        data = self._load()
        raw = data.get(self._last_call_key, {}).get(key)
        if raw is None:
            return None
        return datetime.fromisoformat(raw)

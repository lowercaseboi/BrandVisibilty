"""FileUsageLedger — durable per-day usage counter (DESIGN_v1 §1.5, AC-11 stand-in)."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from app.collection.ledger import FileUsageLedger


def _clock(fixed: datetime):
    return lambda: fixed


def test_record_increments_requests_and_successes(tmp_path):
    ledger = FileUsageLedger(
        tmp_path / "ledger.json", clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc))
    )
    ledger.record("gemini:m", outcome="success")
    ledger.record("gemini:m", outcome="rate_limited")
    usage = ledger.usage_today("gemini:m")
    assert usage.requests == 2
    assert usage.successes == 1
    assert usage.rate_limited == 1


def test_token_usage_accumulates(tmp_path):
    ledger = FileUsageLedger(
        tmp_path / "ledger.json", clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc))
    )
    ledger.record("gemini:m", outcome="success", token_usage={"promptTokenCount": 10, "candidatesTokenCount": 20})
    ledger.record("gemini:m", outcome="success", token_usage={"promptTokenCount": 5, "candidatesTokenCount": 7})
    usage = ledger.usage_today("gemini:m")
    assert usage.prompt_tokens == 15
    assert usage.completion_tokens == 27


def test_mark_exhausted_records_quota_id(tmp_path):
    ledger = FileUsageLedger(
        tmp_path / "ledger.json", clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc))
    )
    ledger.record("gemini:m", outcome="error")
    ledger.mark_exhausted("gemini:m", quota_id="GenerateRequestsPerDay-FreeTier")
    usage = ledger.usage_today("gemini:m")
    assert usage.exhausted_quota_id == "GenerateRequestsPerDay-FreeTier"
    assert usage.exhausted_at is not None


def test_different_keys_are_independent(tmp_path):
    ledger = FileUsageLedger(
        tmp_path / "ledger.json", clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc))
    )
    ledger.record("gemini:m", outcome="success")
    usage_groq = ledger.usage_today("groq:m2")
    assert usage_groq.requests == 0


def test_day_rolls_over_in_utc(tmp_path):
    path = tmp_path / "ledger.json"
    day1 = FileUsageLedger(path, clock=_clock(datetime(2026, 9, 2, 23, 59, tzinfo=timezone.utc)))
    day1.record("gemini:m", outcome="success")
    day2 = FileUsageLedger(path, clock=_clock(datetime(2026, 9, 3, 0, 1, tzinfo=timezone.utc)))
    assert day2.usage_today("gemini:m").requests == 0  # new UTC day, fresh counter


def test_reset_tz_pacific_call_at_0800_utc_counts_as_previous_pacific_day(tmp_path):
    # Pacific is UTC-7 (PDT) or UTC-8 (PST); early September is PDT (UTC-7), so
    # 2026-09-03 08:00 UTC is 2026-09-03 01:00 PDT — still the same Pacific day.
    # Push earlier: 2026-09-03 06:00 UTC = 2026-09-02 23:00 PDT, the *previous* Pacific day.
    path = tmp_path / "ledger.json"
    ledger = FileUsageLedger(
        path, clock=_clock(datetime(2026, 9, 3, 6, 0, tzinfo=timezone.utc))
    )
    ledger.record("gemini:m", outcome="success", reset_tz="America/Los_Angeles")
    data = json.loads(path.read_text())
    assert "2026-09-02" in data  # bucketed under the Pacific calendar day, not the UTC one


def test_corrupt_file_starts_fresh_without_crashing(tmp_path):
    path = tmp_path / "ledger.json"
    path.write_text("{not valid json", encoding="utf-8")
    ledger = FileUsageLedger(path, clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc)))
    usage = ledger.usage_today("gemini:m")  # must not raise
    assert usage.requests == 0


def test_writes_are_atomic_no_tmp_file_left_behind(tmp_path):
    path = tmp_path / "ledger.json"
    ledger = FileUsageLedger(path, clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc)))
    ledger.record("gemini:m", outcome="success")
    assert path.exists()
    assert not path.with_suffix(".json.tmp").exists()


def test_last_call_at_returns_most_recent_record_time(tmp_path):
    path = tmp_path / "ledger.json"
    ledger = FileUsageLedger(path, clock=_clock(datetime(2026, 9, 2, 12, tzinfo=timezone.utc)))
    assert ledger.last_call_at("gemini:m") is None
    ledger.record("gemini:m", outcome="success")
    assert ledger.last_call_at("gemini:m") == datetime(2026, 9, 2, 12, tzinfo=timezone.utc)

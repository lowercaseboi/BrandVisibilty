from datetime import date

from app.collection.usage import normalize_usage, summarize, tally_answers, was_truncated


def test_normalize_usage_shapes():
    assert normalize_usage({"prompt_tokens": 87, "completion_tokens": 932, "total_tokens": 1019}) == {
        "prompt": 87, "completion": 932, "total": 1019,
    }
    gemini = {"promptTokenCount": 15, "candidatesTokenCount": 686, "thoughtsTokenCount": 10, "totalTokenCount": 711}
    assert normalize_usage(gemini) == {"prompt": 15, "completion": 696, "total": 711}
    assert normalize_usage({"input_tokens": 20, "output_tokens": 30}) == {"prompt": 20, "completion": 30, "total": 50}
    assert normalize_usage(None) is None
    assert normalize_usage({"queue_time": 0.8}) is None


def test_was_truncated():
    assert was_truncated({"finish_reason": "length"})
    assert not was_truncated({"finish_reason": "stop"})
    assert was_truncated({"stop_reason": "max_tokens"})
    assert was_truncated({"candidates": [{"finishReason": "MAX_TOKENS"}]})
    assert not was_truncated({"synthetic": True}) and not was_truncated(None)


def test_tally_and_summarize_counts_today_and_legacy_runs():
    raws = [{"usage": {"prompt": 10, "completion": 90, "total": 100}, "latency_ms": 2000, "truncated": True}] * 3
    tally = tally_answers(raws, {"total": 4, "succeeded": 3, "failed": 1, "skip_reason": None})
    assert tally["total_tokens"] == 300 and tally["failed"] == 1 and tally["latency_ms"] == 6000

    snaps = [
        {"collection_completed_at": "2026-10-26T09:00:00+00:00", "provider_usage": {"groq": tally}},
        # Saved before usage was recorded: answers from coverage, tokens unknown.
        {
            "collection_completed_at": "2026-10-20T09:00:00+00:00",
            "analysis_result": {"per_provider_coverage": [{"provider_id": "groq", "observation_count": 5}]},
        },
    ]
    out = summarize(snaps, today=date(2026, 10, 26))["groq"]
    assert out["runs"] == 2 and out["calls"] == 9 and out["failed"] == 1 and out["truncated"] == 3
    assert out["calls_today"] == 4 and out["tokens_today"] == 300
    assert out["total_tokens"] == 300 and out["tokens_known_runs"] == 1
    assert out["avg_latency_ms"] == 2000
    assert out["last_used_at"].startswith("2026-10-26")
    assert out["free_tier"]["requests_per_day"] == 1000

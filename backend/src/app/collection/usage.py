"""Provider usage and free-tier quota (PRD AC-11) — pure helpers, no I/O.

Each adapter returns its provider's own `usage` shape in `CollectionResult.token_usage`;
`normalize_usage` maps the three shapes we see onto one {prompt, completion, total} triple.
The pipeline stores that per answer and a per-provider tally per run (`provider_usage` on the
snapshot); `summarize` folds those tallies across runs for the Providers page.

`FREE_TIERS` are the providers' *published* free-tier limits as of 2026-10. Providers change
them without notice and none of them exposes "remaining today" over the API, so the page shows
calls made today against the published cap — an estimate, labelled as one — never a live balance.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime


def normalize_usage(usage: object) -> dict[str, int] | None:
    """{"prompt": n, "completion": n, "total": n} from an OpenAI-style, Gemini or Anthropic
    usage object; None when there is nothing usable (offline providers, odd shapes)."""
    if not isinstance(usage, dict):
        return None

    def num(*keys: str) -> int | None:
        for k in keys:
            v = usage.get(k)
            if isinstance(v, int) and not isinstance(v, bool):
                return v
        return None

    prompt = num("prompt_tokens", "promptTokenCount", "input_tokens")
    completion = num("completion_tokens", "candidatesTokenCount", "output_tokens")
    thoughts = num("thoughtsTokenCount") or 0  # Gemini bills reasoning separately from the answer
    total = num("total_tokens", "totalTokenCount")
    if prompt is None and completion is None and total is None:
        return None
    if total is None:
        total = (prompt or 0) + (completion or 0) + thoughts
    return {"prompt": prompt or 0, "completion": (completion or 0) + thoughts, "total": total}


def was_truncated(raw_meta: object) -> bool:
    """True when the provider stopped because the answer hit its length cap (max_tokens), so the
    tail of the answer — often the end of a list of places — is missing."""
    if not isinstance(raw_meta, dict):
        return False
    if raw_meta.get("finish_reason") == "length" or raw_meta.get("stop_reason") == "max_tokens":
        return True
    candidates = raw_meta.get("candidates")  # Gemini returns the whole response as raw_meta
    if isinstance(candidates, list) and candidates and isinstance(candidates[0], dict):
        return candidates[0].get("finishReason") == "MAX_TOKENS"
    return False


@dataclass(frozen=True)
class FreeTier:
    requests_per_day: int | None
    tokens_per_day: int | None
    note: str


# Published free-tier caps (checked 2026-10; verify in each console before relying on them).
FREE_TIERS: dict[str, FreeTier] = {
    "groq": FreeTier(1000, 200_000, "Per model: 30 requests/min, 1,000/day, 200K tokens/day"),
    "gemini": FreeTier(1000, None, "Flash-Lite free tier, per Google Cloud project; Pro models are paid-only"),
    "qwen": FreeTier(1000, None, "Groq free tier, separate from gpt-oss: 1,000/day, but only 1,000 output tokens/min (about one answer a minute)"),
    "mistral": FreeTier(None, None, "Free Experiment plan: about 1 request/second; monthly token cap shown in Mistral's console"),
    "github": FreeTier(150, None, "gpt-4.1-mini: about 15/min, 150/day; higher with a Copilot plan"),
    "cloudflare": FreeTier(None, None, "10,000 neurons/day (roughly a few hundred short answers on a 70B model)"),
    "openrouter": FreeTier(50, None, "':free' models: 20/min, 50/day (1,000/day after a one-off $10 top-up)"),
    "anthropic": FreeTier(None, None, "No free tier: a finite prepaid credit that does not renew"),
    "openai": FreeTier(None, None, "No free tier: pay as you go"),
    "ollama": FreeTier(None, None, "Runs on your own machine: no quota"),
}


def empty_tally() -> dict:
    return {"planned": 0, "succeeded": 0, "failed": 0, "truncated": 0, "prompt_tokens": 0, "completion_tokens": 0,
            "total_tokens": 0, "latency_ms": 0, "skip_reason": None}


def tally_answers(raws: Iterable[dict], status: dict) -> dict:
    """One provider's tally for one run, from its collected answers and its progress status."""
    t = empty_tally()
    t["planned"] = int(status.get("total") or 0)
    t["succeeded"] = int(status.get("succeeded") or 0)
    t["failed"] = int(status.get("failed") or 0)
    t["skip_reason"] = status.get("skip_reason")
    for raw in raws:
        u = raw.get("usage") or {}
        t["prompt_tokens"] += int(u.get("prompt") or 0)
        t["completion_tokens"] += int(u.get("completion") or 0)
        t["total_tokens"] += int(u.get("total") or 0)
        t["latency_ms"] += int(raw.get("latency_ms") or 0)
        t["truncated"] += 1 if raw.get("truncated") else 0
    return t


def _day(ts: str | None) -> date | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=UTC)).astimezone(UTC).date()


def summarize(snapshots: Iterable[dict], *, today: date) -> dict[str, dict]:
    """Per provider: runs, calls, failures, tokens and average latency over every stored run, plus
    today's (UTC) calls and tokens. Runs saved before usage was recorded count their answers
    (from per-provider coverage) with tokens unknown, so `tokens_known_runs` says how many runs
    the token totals cover."""
    out: dict[str, dict] = {}
    for snap in snapshots:
        day = _day(snap.get("collection_completed_at"))
        usage = snap.get("provider_usage")
        if isinstance(usage, dict):
            rows = {pid: (t, True) for pid, t in usage.items() if isinstance(t, dict)}
        else:
            per = (snap.get("analysis_result") or {}).get("per_provider_coverage") or []
            rows = {
                p["provider_id"]: ({**empty_tally(), "succeeded": int(p.get("observation_count") or 0)}, False)
                for p in per if isinstance(p, dict) and p.get("provider_id")
            }
        for pid, (t, known) in rows.items():
            agg = out.setdefault(pid, {
                "provider_id": pid, "runs": 0, "calls": 0, "failed": 0, "truncated": 0, "total_tokens": 0,
                "prompt_tokens": 0, "completion_tokens": 0, "tokens_known_runs": 0, "latency_ms_total": 0, "_timed_answers": 0,
                "calls_today": 0, "tokens_today": 0, "last_used_at": None,
            })
            calls = int(t.get("succeeded") or 0) + int(t.get("failed") or 0)
            agg["runs"] += 1
            agg["calls"] += calls
            agg["failed"] += int(t.get("failed") or 0)
            agg["truncated"] += int(t.get("truncated") or 0)
            agg["latency_ms_total"] += int(t.get("latency_ms") or 0)
            if known:
                agg["tokens_known_runs"] += 1
                agg["_timed_answers"] += int(t.get("succeeded") or 0)
                for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    agg[k] += int(t.get(k) or 0)
            if day == today:
                agg["calls_today"] += calls
                agg["tokens_today"] += int(t.get("total_tokens") or 0)
            ts = snap.get("collection_completed_at")
            if ts and (agg["last_used_at"] is None or ts > agg["last_used_at"]):
                agg["last_used_at"] = ts
    for agg in out.values():
        timed, latency = agg.pop("_timed_answers"), agg.pop("latency_ms_total")
        agg["avg_latency_ms"] = round(latency / timed) if timed and latency else None
        tier = FREE_TIERS.get(agg["provider_id"])
        agg["free_tier"] = (
            {"requests_per_day": tier.requests_per_day, "tokens_per_day": tier.tokens_per_day, "note": tier.note}
            if tier else None
        )
    return out

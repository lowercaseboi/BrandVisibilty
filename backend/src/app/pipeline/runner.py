"""End-to-end tracking pipeline (CONTRACT §4) — shared by the CLI and the HTTP API.

brand config -> frozen query set -> unprompted subset -> provider × query × sample
collection (with retry) -> MentionDetector -> Scorer -> GapDetector -> recommendation
engine -> snapshot record -> JSONL store.

This is the MVP stand-in for the AnalysisJob/JobService pipeline (DESIGN §6.8): no DB,
no Celery. The analysis steps it calls stay pure (CLAUDE.md); all I/O lives here.
"""

from __future__ import annotations

import math
import random
import threading
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import UTC, datetime

import httpx

from app.analysis.gap_detector import detect_gaps
from app.analysis.mention_detector import detect_mentions
from app.analysis.scorer import score
from app.analysis.summary import mention_summary
from app.analysis.types import Observation
from app.brands.registry import SELF_ENTITY_ID, BrandConfig, get_brand
from app.collection.types import SamplingParams
from app.querysets import custom as question_sets
from app.querysets.generator import Query
from app.tracking import store
from app.tracking.snapshot import OFFLINE_PROVIDERS, build_snapshot

ProgressFn = Callable[[str, int, int], None]  # (message, done, total)
ProviderFn = Callable[[dict], None]  # {provider_id, label, done, total, succeeded, failed, state, note, wait_seconds}
SkipFn = Callable[[str], bool]  # provider_id -> True when that provider (or everything) should be skipped

_BOOTSTRAP_SEED = 42


GIVE_UP_AFTER_CONSECUTIVE_FAILURES = 3
# A provider that has gone this long without a successful answer while it keeps failing or
# waiting on retries (rate limit) is skipped, so the run finishes with the other providers.
AUTO_SKIP_AFTER_SECONDS = 120

_now = time.monotonic  # module-level so tests can drive a fake clock


class _Progress:
    """Thread-safe call counter that forwards to the caller's on_progress / on_provider."""

    def __init__(self, total: int, on_progress: ProgressFn | None, on_provider: ProviderFn | None = None):
        self.total = total
        self.done = 0
        self._fn = on_progress
        self._provider_fn = on_provider
        self._lock = threading.Lock()

    def step(self, message: str, n: int = 1) -> None:
        with self._lock:
            self.done += n
            if self._fn is not None:
                self._fn(message, self.done, self.total)

    def note(self, message: str) -> None:
        with self._lock:
            if self._fn is not None:
                self._fn(message, self.done, self.total)

    def provider(self, payload: dict) -> None:
        with self._lock:
            if self._provider_fn is not None:
                self._provider_fn(dict(payload))


def _label(provider_id: str) -> str:
    # Imported at call time so a stand-in registry (tests) is picked up.
    from app.collection.registry import provider_label

    return provider_label(provider_id)


def _duration(seconds: float, *, short: bool = False) -> str:
    if seconds >= 60 and seconds % 60 == 0:
        minutes = int(seconds // 60)
        return f"{minutes} min" if short else _plural(minutes, "minute")
    return f"{seconds:.0f}s" if short else _plural(int(seconds), "second")


def _short_error(exc: BaseException) -> str:
    """A short, safe failure summary. Never str(exc) of an HTTP error: it can carry the URL."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 429:
            return "rate limited"
        if code >= 500:
            return f"provider error {code}"
        return f"request rejected, HTTP {code}"
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return "timed out"
    return type(exc).__name__


def _truncate(text: str, limit: int = 60) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _times(samples: int) -> str:
    return {1: "once each", 2: "twice each"}.get(samples, f"{samples} times each")


class _ProviderRun:
    """Per-provider bookkeeping: the on_provider payload plus the skip / auto-skip decision."""

    def __init__(self, provider_id: str, label: str, planned: int, progress: _Progress, should_skip: SkipFn | None):
        self.provider_id = provider_id
        self.label = label
        self.planned = planned
        self.progress = progress
        self._should_skip = should_skip
        self.status = {
            "provider_id": provider_id,
            "label": label,
            "done": 0,
            "total": planned,
            "succeeded": 0,
            "failed": 0,
            "state": "queued",
            "note": None,
            "wait_seconds": None,
            "skip_reason": None,
        }
        self.last_answer_at = _now()
        self.last_problem: str | None = None  # latest failure / wait reason, for the auto-skip message

    def report(self, **fields) -> None:
        self.status.update(fields)
        if self.status["state"] != "waiting":
            self.status["wait_seconds"] = None  # only meaningful while waiting on a retry
        self.progress.provider(self.status)

    def skip_requested(self) -> bool:
        return self._should_skip is not None and bool(self._should_skip(self.provider_id))

    def overdue(self) -> bool:
        return _now() - self.last_answer_at >= AUTO_SKIP_AFTER_SECONDS

    def should_stop(self) -> bool:
        return self.skip_requested() or self.overdue()

    def finish_skipped(self, message: str, note: str, reason: str) -> None:
        """Mark every remaining planned call done (so the overall bar keeps moving) and stop.
        `reason` is structured for the UI: "user", "auto", "failures" or "unavailable"."""
        remaining = self.planned - self.status["done"]
        self.report(state="skipped", note=note, done=self.planned, skip_reason=reason)
        self.progress.step(message, n=remaining)

    def stop(self) -> bool:
        """Skip (by request, or automatically). Returns True when it was a user/skip-all request."""
        if self.skip_requested():
            self.finish_skipped(f"{self.label} skipped — continuing with the answers collected so far", "skipped", "user")
            return True
        why = self.last_problem or "no response"
        self.finish_skipped(
            f"{self.label} auto-skipped: no answer for {_duration(AUTO_SKIP_AFTER_SECONDS)} ({why})",
            f"auto-skipped after {_duration(AUTO_SKIP_AFTER_SECONDS, short=True)} without an answer",
            "auto",
        )
        return False


class _TrackedProvider:
    """Wraps a provider so every attempt (including retries) flips its state back to running."""

    def __init__(self, provider, on_attempt: Callable[[], None]):
        self._provider = provider
        self._on_attempt = on_attempt

    def query(self, prompt, params):
        self._on_attempt()
        return self._provider.query(prompt, params)

    def __getattr__(self, name):
        return getattr(self._provider, name)


def _collect_provider(
    provider_id: str,
    *,
    brand: BrandConfig,
    queries: list[Query],
    unscored_queries: Sequence[Query] = (),
    samples: int,
    round: int,
    record: bool,
    sampling_params: SamplingParams,
    progress: _Progress,
    should_skip: SkipFn | None = None,
    skipped_on_request: set[str] | None = None,
) -> list[tuple[dict, Observation]]:
    """All samples for one provider, sequentially (keeps per-provider rate limits sane).
    Scored queries get ids q<i>, unscored (brand-named) ones p<i>.
    Returns (raw-observation dict, Observation) per successful call; failures are skipped (AC-9).
    Stops early — keeping what it has — when should_skip(provider_id) turns True, after
    GIVE_UP_AFTER_CONSECUTIVE_FAILURES failed calls in a row, or after AUTO_SKIP_AFTER_SECONDS
    without a successful answer. Providers skipped on request are added to `skipped_on_request`."""
    from app.collection.registry import build_provider
    from app.collection.retry import Skipped, query_with_retry

    label = _label(provider_id)
    record = record and provider_id not in OFFLINE_PROVIDERS
    if record:
        from app.collection.providers.replay import record_response

    planned = (len(queries) + len(unscored_queries)) * samples
    run = _ProviderRun(provider_id, label, planned, progress, should_skip)
    try:
        provider = build_provider(provider_id, brand=brand, round=round)
    except Exception as exc:  # noqa: BLE001 - one unusable provider must not kill the run
        # Registry errors are our own messages (they name the missing setting, never a key).
        reason = _truncate(str(exc), 120) if isinstance(exc, (ValueError, KeyError)) else _short_error(exc)
        run.finish_skipped(f"{label} unavailable, skipped for this run ({reason})", f"unavailable ({reason})", "unavailable")
        return []

    def stop(records: list) -> list:
        if run.stop() and skipped_on_request is not None:
            skipped_on_request.add(provider_id)
        return records

    tracked = _TrackedProvider(provider, lambda: run.report(state="running", note=None))
    run.last_answer_at = _now()
    run.report(state="running")

    alias_table = brand.alias_table()
    replay_path = store.DATA_DIR / "replay" / f"{brand.brand_key}.json"
    records: list[tuple[dict, Observation]] = []
    consecutive_failures = 0
    groups = [("q", "question", queries, True), ("p", "brand-named question", unscored_queries, False)]
    for prefix, noun, group, scored in groups:
        for query_index, query in enumerate(group):
            for sample_index in range(samples):
                query_id = f"{prefix}{query_index}"
                observation_id = f"{provider_id}:{query_id}-s{sample_index}"
                where = f"{noun} {query_index + 1}"
                if run.should_stop():
                    return stop(records)

                position = f"{where} of {len(group)}"

                def on_wait(seconds: float, reason: str, _where: str = position) -> None:
                    run.last_problem = reason
                    run.report(
                        state="waiting", note=f"waiting {seconds:.0f}s — {reason}",
                        wait_seconds=max(0, math.ceil(seconds)),
                    )
                    progress.note(f"{label} {reason} — waiting {seconds:.0f}s before retrying ({_where})")

                try:
                    result = query_with_retry(
                        tracked, query.text, sampling_params, should_stop=run.should_stop, on_wait=on_wait
                    )
                except Skipped:
                    return stop(records)
                except Exception as exc:  # noqa: BLE001 - one failed sample must not kill the run
                    consecutive_failures += 1
                    run.last_problem = _short_error(exc)
                    run.report(
                        state="running", note=None,
                        done=run.status["done"] + 1, failed=run.status["failed"] + 1,
                    )
                    progress.step(f"{label} · {where}, answer {sample_index + 1} failed ({run.last_problem})")
                    if consecutive_failures >= GIVE_UP_AFTER_CONSECUTIVE_FAILURES:
                        # Each failure has already used up its retries (minutes, on a rate limit), so a
                        # provider that keeps failing (quota gone) would otherwise stall the whole run.
                        run.finish_skipped(
                            f"{label} skipped for the rest of this run after {consecutive_failures} failures in a row",
                            f"skipped after {consecutive_failures} failures in a row",
                            "failures",
                        )
                        return records
                    continue
                consecutive_failures = 0
                run.last_answer_at = _now()
                run.last_problem = None

                if record:
                    try:
                        record_response(replay_path, query.text, result)
                    except Exception as exc:  # noqa: BLE001 - recording is best-effort
                        progress.note(f"{label} · could not save this answer for replay ({type(exc).__name__})")

                mentions = detect_mentions(result.payload, alias_table)
                raw = {
                    "observation_id": observation_id,
                    "query_id": query_id,
                    "query_text": query.text,
                    "intent_type": query.intent_type,
                    "provider_id": provider_id,
                    "model_version": result.model_version,
                    "response_text": result.payload,
                    "mentions": [asdict(m) for m in mentions],
                    "scored": scored,
                }
                observation = Observation(
                    observation_id=observation_id,
                    query_id=query_id,
                    provider_id=provider_id,
                    mentions=mentions,
                    intent_type=query.intent_type,
                )
                records.append((raw, observation))
                self_hit = any(m.entity_id == SELF_ENTITY_ID for m in mentions)
                run.report(
                    state="running", note=None,
                    done=run.status["done"] + 1, succeeded=run.status["succeeded"] + 1,
                )
                progress.step(
                    f"{label} · {where} of {len(group)}, answer {sample_index + 1} of {samples}"
                    f" · “{_truncate(query.text)}”{' · brand mentioned' if self_hit else ''}"
                )
    run.report(state="done", note=None)
    return records


def _auto_round(brand_key: str) -> int:
    """Next synthetic round: each synthetic run simulates a later week of demo data."""
    return sum(1 for r in store.load_snapshots(brand_key) if r.get("data_origin") == "synthetic") + 1


def run_pipeline(
    brand_key: str,
    *,
    providers: str = "auto",
    samples: int = 3,
    round: int | None = None,
    record: bool = False,
    on_progress: ProgressFn | None = None,
    should_skip: SkipFn | None = None,
    on_provider: ProviderFn | None = None,
) -> dict:
    """Run one tracking snapshot for `brand_key`, persist it and return the record.

    `round` only affects the offline synthetic provider; None picks the next round
    automatically (existing synthetic snapshots for the brand + 1).

    `should_skip(provider_id)` is polled before every call and during retry waits; when it
    returns True that provider stops and the run continues with what was collected.
    `on_provider(payload)` receives per-provider progress (CONTRACT §7, ProviderProgress).

    Raises KeyError for an unknown brand, ValueError for a bad provider spec/sample count,
    RuntimeError only if not a single scored observation was collected.
    """
    from app.collection.registry import resolve_provider_ids
    from app.recommendation.engine import recommend

    if samples < 1:
        raise ValueError("samples must be >= 1")
    brand = get_brand(brand_key)
    provider_ids = resolve_provider_ids(providers)
    if not provider_ids:
        raise ValueError(f"No providers resolved from {providers!r}")
    if round is None:
        round = _auto_round(brand.brand_key)

    # 1-2. Frozen query set (the brand's reviewed questions, or the template defaults).
    # Only questions that don't name the brand are scored (PRD §10.1); brand-named ones are
    # asked too, but kept as evidence only. No phrasing expansion: canonical text keeps the
    # instrument stable and the call volume down.
    query_set, queries, unscored_queries = question_sets.build_query_set(brand)
    if not queries:
        raise ValueError(f"{brand.name} has no enabled questions that can be scored")
    query_ids = [f"q{i}" for i in range(len(queries))]
    sampling_params = SamplingParams()

    total = len(provider_ids) * (len(queries) + len(unscored_queries)) * samples
    progress = _Progress(total, on_progress, on_provider)
    per_provider = len(queries) + len(unscored_queries)
    for pid in provider_ids:
        progress.provider({
            "provider_id": pid, "label": _label(pid), "done": 0, "total": per_provider * samples,
            "succeeded": 0, "failed": 0, "state": "queued", "note": None, "wait_seconds": None,
            "skip_reason": None,
        })
    extra = (
        f" + {_plural(len(unscored_queries), 'brand-named question')} (not scored)" if unscored_queries else ""
    )
    progress.note(
        f"Asking {_join_names([_label(p) for p in provider_ids])} {_plural(len(queries), 'question')}{extra}, "
        f"{_times(samples)} ({_plural(total, 'call')})"
    )

    # 3-4. Collect: providers in parallel, each provider's calls sequential.
    started_at = datetime.now(UTC)
    skipped_on_request: set[str] = set()
    with ThreadPoolExecutor(max_workers=len(provider_ids)) as pool:
        futures = [
            pool.submit(
                _collect_provider,
                pid,
                brand=brand,
                queries=queries,
                unscored_queries=unscored_queries,
                samples=samples,
                round=round,
                record=record,
                sampling_params=sampling_params,
                progress=progress,
                should_skip=should_skip,
                skipped_on_request=skipped_on_request,
            )
            for pid in provider_ids
        ]
        per_provider = [f.result() for f in futures]
    completed_at = datetime.now(UTC)

    collected = [pair for records in per_provider for pair in records]
    scored_pairs = [(raw, obs) for raw, obs in collected if raw["scored"]]
    unscored_raws = [raw for raw, _ in collected if not raw["scored"]]
    raw_observations = [raw for raw, _ in scored_pairs]
    observations = [obs for _, obs in scored_pairs]
    if not raw_observations:
        if skipped_on_request:
            raise RuntimeError("No answers were collected before the run was skipped")
        raise RuntimeError(
            f"No observations collected for {brand_key!r} from {', '.join(provider_ids)} — every scored call failed"
        )

    # 5. Pure analysis — scored (unprompted) observations only.
    competitor_ids = brand.competitor_ids()
    progress.note("Scoring answers…")
    analysis_result = score(observations, SELF_ENTITY_ID, competitor_ids, rng=random.Random(_BOOTSTRAP_SEED))
    gaps = detect_gaps(observations, SELF_ENTITY_ID, competitor_ids)
    try:
        recommendations = recommend(
            gaps, observations, SELF_ENTITY_ID, competitor_ids, entity_names=brand.entity_names()
        )
    except Exception as exc:  # noqa: BLE001 - never throw away a collected run over drafting
        progress.note(f"Recommendations could not be drafted ({type(exc).__name__}); saving the run without them")
        recommendations = []

    # 6. Snapshot -> store. Admission/completeness is judged on the scored questions only;
    # brand-named answers are appended afterwards so they show up as evidence.
    snapshot = build_snapshot(
        brand_key=brand.brand_key,
        brand_name=brand.name,
        entities=brand.entity_names(),
        providers=provider_ids,
        query_ids=query_ids,
        samples_per_query=samples,
        query_set_content_hash=query_set.content_hash,
        query_set_template_version=query_set.template_set_version,
        sampling_config=query_set.sampling_config,
        raw_observations=raw_observations,
        analysis_result=analysis_result,
        gaps=[asdict(g) for g in gaps],
        recommendations=[asdict(r) for r in recommendations],
        started_at=started_at,
        completed_at=completed_at,
    )
    snapshot["raw_observations"] = [*snapshot["raw_observations"], *unscored_raws]
    snapshot["unscored_observation_count"] = len(unscored_raws)
    # Who the AI named, per tracked entity — scored (unprompted) answers only (PRD §10.1).
    snapshot["mention_summary"] = mention_summary(observations, brand.entity_names())
    store.append_snapshot(snapshot)
    progress.note(f"Saved run {snapshot['run_id']} ({snapshot['status']})")
    return snapshot

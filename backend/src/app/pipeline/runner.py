"""End-to-end tracking pipeline (CONTRACT §4) — shared by the CLI and the HTTP API.

brand config -> frozen query set -> unprompted subset -> provider × query × sample
collection (with retry) -> MentionDetector -> Scorer -> GapDetector -> recommendation
engine -> snapshot record -> JSONL store.

This is the MVP stand-in for the AnalysisJob/JobService pipeline (DESIGN §6.8): no DB,
no Celery. The analysis steps it calls stay pure (CLAUDE.md); all I/O lives here.
"""

from __future__ import annotations

import random
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import UTC, datetime

from app.analysis.gap_detector import detect_gaps
from app.analysis.mention_detector import detect_mentions
from app.analysis.scorer import score
from app.analysis.types import Observation
from app.brands.registry import SELF_ENTITY_ID, BrandConfig, get_brand
from app.collection.types import SamplingParams
from app.querysets.generator import Query, freeze, generate_draft
from app.tracking import store
from app.tracking.snapshot import OFFLINE_PROVIDERS, build_snapshot

ProgressFn = Callable[[str, int, int], None]  # (message, done, total)

_BOOTSTRAP_SEED = 42


class _Progress:
    """Thread-safe call counter that forwards to the caller's on_progress."""

    def __init__(self, total: int, on_progress: ProgressFn | None):
        self.total = total
        self.done = 0
        self._fn = on_progress
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


def _collect_provider(
    provider_id: str,
    *,
    brand: BrandConfig,
    queries: list[Query],
    samples: int,
    round: int,
    record: bool,
    sampling_params: SamplingParams,
    progress: _Progress,
) -> list[tuple[dict, Observation]]:
    """All samples for one provider, sequentially (keeps per-provider rate limits sane).
    Returns (raw-observation dict, Observation) per successful call; failures are skipped (AC-9)."""
    from app.collection.registry import build_provider
    from app.collection.retry import query_with_retry

    record = record and provider_id not in OFFLINE_PROVIDERS
    if record:
        from app.collection.providers.replay import record_response

    planned = len(queries) * samples
    try:
        provider = build_provider(provider_id, brand=brand, round=round)
    except Exception as exc:  # noqa: BLE001 - one unusable provider must not kill the run
        progress.step(f"[{provider_id}] unavailable: {exc}", n=planned)
        return []

    alias_table = brand.alias_table()
    replay_path = store.DATA_DIR / "replay" / f"{brand.brand_key}.json"
    records: list[tuple[dict, Observation]] = []
    for query_index, query in enumerate(queries):
        for sample_index in range(samples):
            observation_id = f"{provider_id}:q{query_index}-s{sample_index}"
            try:
                result = query_with_retry(provider, query.text, sampling_params)
            except Exception as exc:  # noqa: BLE001 - one failed sample must not kill the run
                progress.step(f"{observation_id} FAILED: {type(exc).__name__}: {exc}")
                continue

            if record:
                try:
                    record_response(replay_path, query.text, result)
                except Exception as exc:  # noqa: BLE001 - recording is best-effort
                    progress.note(f"{observation_id} could not be recorded for replay: {exc}")

            mentions = detect_mentions(result.payload, alias_table)
            raw = {
                "observation_id": observation_id,
                "query_id": f"q{query_index}",
                "query_text": query.text,
                "intent_type": query.intent_type,
                "provider_id": provider_id,
                "model_version": result.model_version,
                "response_text": result.payload,
                "mentions": [asdict(m) for m in mentions],
            }
            observation = Observation(
                observation_id=observation_id,
                query_id=raw["query_id"],
                provider_id=provider_id,
                mentions=mentions,
                intent_type=query.intent_type,
            )
            records.append((raw, observation))
            self_hit = any(m.entity_id == SELF_ENTITY_ID for m in mentions)
            progress.step(f"{observation_id} ok{' (brand mentioned)' if self_hit else ''}")
    return records


def run_pipeline(
    brand_key: str,
    *,
    providers: str = "auto",
    samples: int = 3,
    round: int = 1,
    record: bool = False,
    on_progress: ProgressFn | None = None,
) -> dict:
    """Run one tracking snapshot for `brand_key`, persist it and return the record.

    Raises KeyError for an unknown brand, ValueError for a bad provider spec/sample count,
    RuntimeError only if not a single observation was collected.
    """
    from app.collection.registry import resolve_provider_ids
    from app.recommendation.engine import recommend

    if samples < 1:
        raise ValueError("samples must be >= 1")
    brand = get_brand(brand_key)
    provider_ids = resolve_provider_ids(providers)
    if not provider_ids:
        raise ValueError(f"No providers resolved from {providers!r}")

    # 1-2. Frozen query set, unprompted subset only (PRD §10.1). No phrasing expansion:
    # canonical template text keeps the instrument stable and the call volume down.
    query_set = freeze(generate_draft(brand.params))
    queries = [q for q in query_set.queries if not q.is_brand_named]
    query_ids = [f"q{i}" for i in range(len(queries))]
    sampling_params = SamplingParams()

    total = len(provider_ids) * len(queries) * samples
    progress = _Progress(total, on_progress)
    progress.note(
        f"{brand.name}: {len(queries)} queries × {samples} samples × {len(provider_ids)} provider(s) "
        f"[{', '.join(provider_ids)}]"
    )

    # 3-4. Collect: providers in parallel, each provider's calls sequential.
    started_at = datetime.now(UTC)
    with ThreadPoolExecutor(max_workers=len(provider_ids)) as pool:
        futures = [
            pool.submit(
                _collect_provider,
                pid,
                brand=brand,
                queries=queries,
                samples=samples,
                round=round,
                record=record,
                sampling_params=sampling_params,
                progress=progress,
            )
            for pid in provider_ids
        ]
        per_provider = [f.result() for f in futures]
    completed_at = datetime.now(UTC)

    collected = [pair for records in per_provider for pair in records]
    raw_observations = [raw for raw, _ in collected]
    observations = [obs for _, obs in collected]
    if not raw_observations:
        raise RuntimeError(
            f"No observations collected for {brand_key!r} from {', '.join(provider_ids)} — every call failed"
        )

    # 5. Pure analysis.
    competitor_ids = brand.competitor_ids()
    progress.note("scoring")
    analysis_result = score(observations, SELF_ENTITY_ID, competitor_ids, rng=random.Random(_BOOTSTRAP_SEED))
    gaps = detect_gaps(observations, SELF_ENTITY_ID, competitor_ids)
    try:
        recommendations = recommend(
            gaps, observations, SELF_ENTITY_ID, competitor_ids, entity_names=brand.entity_names()
        )
    except Exception as exc:  # noqa: BLE001 - never throw away a collected run over drafting
        progress.note(f"recommendation engine failed ({type(exc).__name__}: {exc}); saving without recommendations")
        recommendations = []

    # 6. Snapshot -> store.
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
    store.append_snapshot(snapshot)
    progress.note(f"saved run {snapshot['run_id']} ({snapshot['status']})")
    return snapshot

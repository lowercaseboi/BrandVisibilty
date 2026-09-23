"""L1 collection runner (DESIGN_v1 §1.4 job execution model, minimal file-mode version).

Fans a `CollectionPlan` out into one `(provider, query, sample)` tuple per iteration,
against a `ResponseStore` so nothing already collected is re-requested and nothing newly
collected can be lost to a crash. Providers are expected to already be
`ResilientProvider`-wrapped (§1.5) — this module contains no retry/pacing logic of its
own, only the fan-out and bookkeeping.

**Iteration order is sample-major, provider-interleaved** — `for sample: for query: for
provider (rotated by query index):` — not the naive `for query: for sample:` nesting.
Two independent reasons:

1. A run stopped partway through (quota exhaustion, Ctrl-C, a crash) is still a *usable*
   snapshot: sample-major collection guarantees every query has been attempted at least
   once before any query gets a second sample. DESIGN §6.2/§6.3 are explicit that the
   bootstrap CI's power comes from the number of distinct query *clusters*, not from
   samples within a cluster — so balanced-but-shallow coverage salvages a truncated run in
   a way that deep-but-narrow coverage cannot.
2. Rotating providers by query index interleaves their calls, so each provider's pacing
   wait overlaps the others' instead of stacking. Wall-clock for a run is then closer to
   `max` over providers than `sum` — with no `asyncio` required.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Callable, Literal

from app.collection.errors import CircuitOpenError, ProviderError
from app.collection.limits import ProviderLimits
from app.collection.store import (
    ResponseStore,
    SampleKey,
    StoredResponse,
    content_addressed_query_id,
)
from app.collection.types import LLMProvider, SamplingParams
from app.querysets.generator import QuerySet

OutcomeStatus = Literal["collected", "cached", "failed", "skipped_circuit_open", "replay_miss"]

_SCHEMA_VERSION = 1


def _sampling_hash(sampling_params: SamplingParams) -> str:
    payload = json.dumps(asdict(sampling_params), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class ProviderHandle:
    """One provider slot in a plan: its static limits (for bookkeeping/reporting) plus
    the already-resilient `LLMProvider` to call. `limits.ledger_key` (`provider:model`) is
    the key used throughout the report."""

    limits: ProviderLimits
    provider: LLMProvider


@dataclass(frozen=True)
class CollectionPlan:
    brand_key: str
    run_id: str
    query_set: QuerySet
    sampling_params: SamplingParams
    providers: tuple[ProviderHandle, ...]
    samples_per_query: int
    include_prompted: bool = True

    @property
    def queries(self):
        if self.include_prompted:
            return self.query_set.queries
        return tuple(q for q in self.query_set.queries if not q.is_brand_named)


@dataclass(frozen=True)
class SampleOutcome:
    key: SampleKey
    status: OutcomeStatus
    record: StoredResponse | None = None
    error: str | None = None


@dataclass
class ProviderRunStats:
    planned: int = 0
    ok: int = 0
    cached: int = 0
    failed: int = 0
    skipped: int = 0
    stop_reason: str | None = None


@dataclass(frozen=True)
class CollectionReport:
    planned: int
    from_cache: int
    newly_collected: int
    failed: int
    skipped: int
    per_provider: dict[str, ProviderRunStats]
    planned_query_ids: frozenset[str]
    collected_query_ids: frozenset[str]
    resolved_model_versions: dict[str, frozenset[str]]
    started_at: datetime
    completed_at: datetime
    stopped_early: bool
    stop_reason: str | None


def collect(
    plan: CollectionPlan,
    store: ResponseStore,
    *,
    replay_only: bool = False,
    on_progress: Callable[[SampleOutcome], None] | None = None,
) -> CollectionReport:
    """Run (or replay) one collection plan. Never raises on a per-sample failure — every
    error is caught, recorded, and reflected in the report; a caller sees a completed
    `CollectionReport` even when every provider's circuit ends up open (PRD §15.4:
    "one provider/source failure does not invalidate the job")."""
    started_at = datetime.now(UTC)
    on_progress = on_progress or (lambda outcome: None)

    queries = plan.queries
    query_ids = [content_addressed_query_id(q.text) for q in queries]
    sampling_hash = _sampling_hash(plan.sampling_params)
    num_providers = len(plan.providers)

    per_provider: dict[str, ProviderRunStats] = {
        handle.limits.ledger_key: ProviderRunStats() for handle in plan.providers
    }
    resolved_versions: dict[str, set[str]] = defaultdict(set)
    collected_query_ids: set[str] = set()
    from_cache = newly_collected = failed = skipped = 0

    for sample_index in range(plan.samples_per_query):
        for query_index, (query, query_id) in enumerate(zip(queries, query_ids)):
            for provider_offset in range(num_providers):
                handle = plan.providers[(query_index + provider_offset) % num_providers]
                stats = per_provider[handle.limits.ledger_key]
                key = SampleKey(
                    run_id=plan.run_id,
                    query_set_hash=plan.query_set.content_hash,
                    sampling_hash=sampling_hash,
                    provider_id=handle.limits.provider_id,
                    model_id=handle.limits.model_id,
                    query_id=query_id,
                    sample_index=sample_index,
                )
                stats.planned += 1

                cached = store.get(key)
                if cached is not None:
                    from_cache += 1
                    stats.cached += 1
                    collected_query_ids.add(query_id)
                    if cached.model_version:
                        resolved_versions[handle.limits.ledger_key].add(cached.model_version)
                    on_progress(SampleOutcome(key=key, status="cached", record=cached))
                    continue

                if replay_only:
                    skipped += 1
                    stats.skipped += 1
                    on_progress(SampleOutcome(key=key, status="replay_miss"))
                    continue

                try:
                    result = handle.provider.query(query.text, plan.sampling_params)
                except CircuitOpenError as exc:
                    skipped += 1
                    stats.skipped += 1
                    if stats.stop_reason is None:
                        stats.stop_reason = exc.info.message
                    on_progress(SampleOutcome(key=key, status="skipped_circuit_open"))
                    continue
                except ProviderError as exc:
                    failed += 1
                    stats.failed += 1
                    failure_record = StoredResponse(
                        schema_version=_SCHEMA_VERSION,
                        captured_at=datetime.now(UTC).isoformat(),
                        run_id=plan.run_id,
                        brand_key=plan.brand_key,
                        query_set_hash=plan.query_set.content_hash,
                        sampling_hash=sampling_hash,
                        provider_id=handle.limits.provider_id,
                        model_id=handle.limits.model_id,
                        model_version=None,
                        query_id=query_id,
                        query_text=query.text,
                        intent_type=query.intent_type,
                        is_brand_named=query.is_brand_named,
                        sample_index=sample_index,
                        status="failed",
                        error={
                            "kind": type(exc).__name__,
                            "status_code": exc.info.status_code,
                            "quota_id": exc.info.quota_id,
                            "quota_scope": exc.info.quota_scope,
                            "retry_after_s": exc.info.retry_after_s,
                            "message": exc.info.message,
                        },
                    )
                    store.put_failure(key, failure_record)
                    on_progress(SampleOutcome(key=key, status="failed", error=exc.info.describe()))
                    continue

                ok_record = StoredResponse(
                    schema_version=_SCHEMA_VERSION,
                    captured_at=datetime.now(UTC).isoformat(),
                    run_id=plan.run_id,
                    brand_key=plan.brand_key,
                    query_set_hash=plan.query_set.content_hash,
                    sampling_hash=sampling_hash,
                    provider_id=handle.limits.provider_id,
                    model_id=handle.limits.model_id,
                    model_version=result.model_version,
                    query_id=query_id,
                    query_text=query.text,
                    intent_type=query.intent_type,
                    is_brand_named=query.is_brand_named,
                    sample_index=sample_index,
                    status="ok",
                    latency_ms=result.latency_ms,
                    token_usage=result.token_usage,
                    response_text=result.payload,
                    raw_meta=result.raw_meta,
                )
                store.put(key, ok_record)
                newly_collected += 1
                stats.ok += 1
                collected_query_ids.add(query_id)
                if result.model_version:
                    resolved_versions[handle.limits.ledger_key].add(result.model_version)
                on_progress(SampleOutcome(key=key, status="collected", record=ok_record))

    stopped_early = bool(per_provider) and all(s.stop_reason is not None for s in per_provider.values())
    stop_reason = (
        "; ".join(f"{key}: {s.stop_reason}" for key, s in per_provider.items() if s.stop_reason)
        if stopped_early
        else None
    )

    return CollectionReport(
        planned=sum(s.planned for s in per_provider.values()),
        from_cache=from_cache,
        newly_collected=newly_collected,
        failed=failed,
        skipped=skipped,
        per_provider=per_provider,
        planned_query_ids=frozenset(query_ids),
        collected_query_ids=frozenset(collected_query_ids),
        resolved_model_versions={k: frozenset(v) for k, v in resolved_versions.items()},
        started_at=started_at,
        completed_at=datetime.now(UTC),
        stopped_early=stopped_early,
        stop_reason=stop_reason,
    )

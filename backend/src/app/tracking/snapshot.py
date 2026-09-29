"""Snapshot record builder (CONTRACT §5) — pure: no I/O, no LLM calls.

Assembles one tracking snapshot from everything a pipeline run produced, including the
admission decision (PRD §10.7 / DESIGN §6: is this snapshot good enough to trend?).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict
from datetime import datetime

from app.analysis.summary import mention_summary
from app.analysis.types import AnalysisResult, EntityAlias

ADMISSION_POLICY_VERSION = "v0"
MIN_QUERY_COVERAGE = 0.8
MIN_SAMPLE_COMPLETENESS = 0.7

OFFLINE_PROVIDERS = {"synthetic", "replay"}

# Raw observations live beside the snapshot history, one file per run:
# DATA_DIR/tracking/<brand_key>/<run_id>.observations.jsonl (see app.tracking.store).
OBSERVATIONS_SUFFIX = ".observations.jsonl"


def _alias_table_signature(entity_alias_table: Sequence[EntityAlias]) -> str:
    """Order-independent fingerprint of the tracked entity/alias table (self + competitors)
    the mention detector used for this run. Sorting entities and, within each entity, its
    aliases means only a genuine membership change (a competitor or alias added/removed)
    moves the signature — not the order the brand config happens to list them in."""
    rows = sorted((ea.entity_id, ea.entity_kind, tuple(sorted(ea.aliases))) for ea in entity_alias_table)
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def comparability_key(
    query_set_content_hash: str,
    sampling_config: dict,
    model_versions: list[str],
    entity_alias_table: Sequence[EntityAlias] = (),
) -> str:
    """Two snapshots are directly comparable only if they share this key: same frozen query
    set, same sampling config, the same resolved model versions, AND the same tracked
    entity/alias table (competitors + their aliases) the mention detector matched against.

    That last part matters because editing competitors or aliases changes what counts as a
    "mention" without necessarily changing the query text: a wider self-alias list can lift
    Coverage on its own, and an added/removed competitor changes Share of Voice and the
    COMPETITIVE gap, even though the questions asked are identical. Folding the alias table
    into the key means such an edit starts a new comparability segment on the next run
    instead of silently mixing pre- and post-edit runs on the same trend line.

    `entity_alias_table` defaults to `()` for callers that don't pass one (kept
    source-compatible); every real run (`pipeline.runner.run_pipeline`) passes
    `brand.alias_table()`. Snapshots already written keep whatever key they were computed
    with — this function is never used to recompute history, only for new runs going
    forward, so past keys stay exactly as they are.
    """
    material = "|".join(
        [
            query_set_content_hash,
            json.dumps(sampling_config, sort_keys=True),
            ",".join(sorted(set(model_versions))),
            _alias_table_signature(entity_alias_table),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def data_origin(providers: list[str]) -> str:
    """Any synthetic provider taints the whole run: fake answers must never be labelled
    "live" or "replay". Otherwise all-offline (replay) -> "replay", else "live"."""
    if any(p == "synthetic" for p in providers):
        return "synthetic"
    if providers and all(p in OFFLINE_PROVIDERS for p in providers):
        return "replay"
    return "live"


def build_snapshot(
    *,
    brand_key: str,
    brand_name: str,
    entities: dict[str, str],
    providers: list[str],
    query_ids: list[str],
    samples_per_query: int,
    query_set_content_hash: str,
    query_set_template_version: str,
    sampling_config: dict,
    raw_observations: list[dict],
    analysis_result: AnalysisResult,
    gaps: list[dict],
    recommendations: list[dict],
    started_at: datetime,
    completed_at: datetime,
    run_id: str | None = None,
    entity_alias_table: Sequence[EntityAlias] = (),
) -> dict:
    """Build the CONTRACT §5 record.

    `providers` are the provider ids the run *attempted*; `query_ids` the unprompted query
    ids it planned (`q<idx>`); `raw_observations` one dict per *successful* call. Planned
    calls = providers × queries × samples; anything short of that makes the run "partial".

    `entity_alias_table` is the brand's tracked entity/alias table (`brand.alias_table()`)
    as of this run — folded into `comparability_key` so editing competitors or aliases
    starts a new trend segment (see `comparability_key`'s docstring).
    """
    planned_calls = len(providers) * len(query_ids) * samples_per_query
    successful_calls = len(raw_observations)
    calls_by_provider = Counter(o["provider_id"] for o in raw_observations)
    answered_queries = {o["query_id"] for o in raw_observations}

    missing_query_ids = [q for q in query_ids if q not in answered_queries]
    missing_providers = [p for p in providers if calls_by_provider.get(p, 0) == 0]
    query_coverage = (len(query_ids) - len(missing_query_ids)) / len(query_ids) if query_ids else 0.0
    sample_completeness = successful_calls / planned_calls if planned_calls else 0.0
    span_days = max(0, (completed_at - started_at).days)

    reasons: list[str] = []
    if query_coverage < MIN_QUERY_COVERAGE:
        reasons.append(
            f"query coverage {query_coverage:.0%} is below the {MIN_QUERY_COVERAGE:.0%} minimum "
            f"({len(missing_query_ids)} of {len(query_ids)} queries got no successful sample)"
        )
    if sample_completeness < MIN_SAMPLE_COMPLETENESS:
        reasons.append(
            f"sample completeness {sample_completeness:.0%} is below the {MIN_SAMPLE_COMPLETENESS:.0%} minimum "
            f"({successful_calls} of {planned_calls} planned calls succeeded)"
        )
    admissible = not reasons
    if missing_providers:
        reasons.append(f"no successful calls from: {', '.join(missing_providers)}")

    status = "completed" if successful_calls == planned_calls and not missing_providers else "partial"
    model_versions = sorted({o.get("model_version") or o["provider_id"] for o in raw_observations})

    full_sampling_config = {**sampling_config, "samples_per_query": samples_per_query}
    result = analysis_result
    return {
        "brand_key": brand_key,
        "brand": brand_name,
        "run_id": run_id or str(uuid.uuid4()),
        "status": status,
        "data_origin": data_origin(providers),
        "providers": list(providers),
        "comparability_key": comparability_key(
            query_set_content_hash, full_sampling_config, model_versions, entity_alias_table
        ),
        "collection_started_at": started_at.isoformat(),
        "collection_completed_at": completed_at.isoformat(),
        "collection_span_days": span_days,
        "query_set_content_hash": query_set_content_hash,
        "query_set_template_version": query_set_template_version,
        "sampling_config": full_sampling_config,
        "observation_count": result.observation_count,
        "mentioned_count": result.mentioned_count,
        "cluster_count": len(query_ids),
        "analysis_result": {
            "coverage": result.coverage,
            "prominence": result.prominence,
            "share_of_voice": result.share_of_voice,
            "composite_score": result.composite_score,
            "ci_low": result.ci_low,
            "ci_high": result.ci_high,
            "per_provider_coverage": [asdict(b) for b in result.per_provider_coverage],
        },
        "gaps": gaps,
        "recommendations": recommendations,
        "admission": {
            "admissible": admissible,
            "status": "admissible" if admissible else "inadmissible",
            "reasons": reasons,
            "query_coverage": query_coverage,
            "sample_completeness": sample_completeness,
            "missing_query_ids": missing_query_ids,
            "missing_providers": missing_providers,
            "collection_span_days": span_days,
            "policy_version": ADMISSION_POLICY_VERSION,
        },
        "entities": dict(entities),
        "raw_observations": raw_observations,
    }


def legacy_run_id(record: dict) -> str:
    """The run id a pre-contract record (no `run_id`, written by the old tracking script) is
    known by: sha1 of its collection time, or of the whole record when it has none. Hashes
    the record *as stored*, raw observations included, so compute it before splitting."""
    collected_at = record.get("collected_at") or record.get("collection_started_at") or ""
    basis = collected_at or json.dumps(record, sort_keys=True, default=str)
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()


def split_observations(record: dict) -> tuple[dict, list[dict] | None]:
    """Split a stored snapshot record into (light record, raw observations).

    Returns `(copy, None)` when the record carries no inline `raw_observations` (already in
    the split layout). Otherwise the light record gets every summary field that used to be
    derived from the raw answers at read time (observation/unscored/cluster counts and the
    per-entity `mention_summary`, scored answers only — PRD §10.1), computed exactly as
    `interface.snapshots.normalize_snapshot` would, so normalising the light record gives
    the same API payload as normalising the original. A pre-contract record also gets its
    derived `run_id` pinned (plus `legacy_record: True` so it still normalises as legacy),
    because that id may hash the raw answers that are about to leave the line.
    Pure: no I/O. Fields a record already has are never overwritten.
    """
    light = {k: v for k, v in record.items() if k != "raw_observations"}
    if "raw_observations" not in record:
        return light, None
    raw = list(record.get("raw_observations") or [])
    if "run_id" not in light:
        light["run_id"] = legacy_run_id(record)
        light["legacy_record"] = True
    light.setdefault("observation_count", len(raw))
    light.setdefault("unscored_observation_count", sum(1 for o in raw if o.get("scored") is False))
    light.setdefault("cluster_count", len({o.get("query_id") or o.get("query_text") for o in raw}) if raw else 0)
    if not isinstance(light.get("mention_summary"), dict):
        entities = dict(light.get("entities") or {})
        entities.setdefault("self", light["brand"] if "brand" in light else light.get("brand_key", ""))
        scored = [o for o in raw if isinstance(o, dict) and o.get("scored") is not False]
        light["mention_summary"] = mention_summary(scored, entities)
    return light, raw

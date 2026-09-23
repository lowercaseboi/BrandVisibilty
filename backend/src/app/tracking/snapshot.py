"""Snapshot record builder (CONTRACT §5) — pure: no I/O, no LLM calls.

Assembles one tracking snapshot from everything a pipeline run produced, including the
admission decision (PRD §10.7 / DESIGN §6: is this snapshot good enough to trend?).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import Counter
from dataclasses import asdict
from datetime import datetime

from app.analysis.types import AnalysisResult

ADMISSION_POLICY_VERSION = "v0"
MIN_QUERY_COVERAGE = 0.8
MIN_SAMPLE_COMPLETENESS = 0.7

OFFLINE_PROVIDERS = {"synthetic", "replay"}


def comparability_key(query_set_content_hash: str, sampling_config: dict, model_versions: list[str]) -> str:
    """Two snapshots are directly comparable only if they share this key: same frozen query
    set, same sampling config and the same resolved model versions."""
    material = "|".join(
        [
            query_set_content_hash,
            json.dumps(sampling_config, sort_keys=True),
            ",".join(sorted(set(model_versions))),
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def data_origin(providers: list[str]) -> str:
    if providers and all(p == "synthetic" for p in providers):
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
) -> dict:
    """Build the CONTRACT §5 record.

    `providers` are the provider ids the run *attempted*; `query_ids` the unprompted query
    ids it planned (`q<idx>`); `raw_observations` one dict per *successful* call. Planned
    calls = providers × queries × samples; anything short of that makes the run "partial".
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
        "comparability_key": comparability_key(query_set_content_hash, full_sampling_config, model_versions),
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

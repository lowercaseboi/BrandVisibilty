"""Snapshot admissibility gate (DESIGN_v1 §6.x comparability, §4.5, §1.4 stage machine).

The last real run collected 1 usable sample out of 34 attempted and still wrote a
snapshot into the trend series reading coverage/prominence/SoV all at 1.0 -> composite
100.0 — every one of those numbers an artifact of the run being 1/34 complete, not a
real measurement. Nothing in the pipeline up to this point refuses a degenerate snapshot;
this module is that refusal.

**Addition to the design doc.** §1.4 defines `PARTIAL` as a job terminal state but never
states that a `PARTIAL` job is barred from the trend series — that inference is the single
rule that would have prevented the bad snapshot, and it belongs in DESIGN §6 explicitly.
This module encodes it: `evaluate_admission` returns `COMPLETE` only when every hard rule
passes; anything else is `PARTIAL` and must never be written to the trend-series file
(only to the audit-trail `.runs.jsonl`, per the runner/script that calls this).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime

from app.orchestration.collection_runner import CollectionReport


def model_fingerprint(resolved_model_versions: dict[str, frozenset[str] | list[str]]) -> str:
    """Hash of every resolved (provider:model -> version) pairing observed in a run.
    Part of the §4.5 comparability key: a resolved-version change (a provider silently
    upgrading its model) must produce a different fingerprint so the trend view refuses to
    join two snapshots collected against different underlying models (C-3).
    """
    normalized = {key: sorted(versions) for key, versions in resolved_model_versions.items()}
    payload = json.dumps(normalized, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def comparability_key(query_set_hash: str, sampling_config: dict, fingerprint: str) -> str:
    """DESIGN §4.5: `hash(query_set_version, sampling_config, model_fingerprint)`. Two
    snapshots are comparable — belong on the same trend line — only when this key matches.
    A dropped/added provider changes `fingerprint`, which changes this key, which is
    exactly why no separate "missing provider" admissibility rule is needed: the existing
    join mechanism already refuses to connect the two snapshots (§2.2, §4.5).
    """
    payload = json.dumps(
        {"query_set_hash": query_set_hash, "sampling_config": sampling_config, "model_fingerprint": fingerprint},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class AdmissibilityPolicy:
    """Versioned methodology configuration — the same pattern as GapDetector's
    `DetectionConfig` (§5.2): a threshold change is a new `policy_version`, recorded on
    every snapshot, not a silent constant edit."""

    policy_version: str = "v1"
    min_query_coverage: float = 1.0  # hard: §6.2's bootstrap resamples queries, not calls
    min_sample_completeness: float = 0.8  # soft: §6.3 says samples buy little power
    require_single_model_version: bool = True  # the multi-day-resume guard; see module docstring
    max_collection_span_days: float = 3.0
    min_clusters: int = 10  # below this the percentile bootstrap CI is unstable-to-degenerate


@dataclass(frozen=True)
class SnapshotAdmission:
    admissible: bool
    status: str  # "COMPLETE" | "PARTIAL" (DESIGN §1.4 stage machine terminal states)
    reasons: tuple[str, ...]
    query_coverage: float
    sample_completeness: float
    missing_query_ids: tuple[str, ...]
    missing_providers: tuple[str, ...]
    collection_span_days: float
    policy_version: str


def evaluate_admission(report: CollectionReport, policy: AdmissibilityPolicy = AdmissibilityPolicy()) -> SnapshotAdmission:
    """Decide whether `report`'s collected data is fit to enter the trend series.

    Every rule below is independent and all must pass for `admissible=True`; failing any
    one produces a `PARTIAL` status with a human-readable reason, never a silent partial
    pass. A snapshot that fails admission is not deleted or lost — the caller is expected
    to persist it (with this verdict attached) to the run-level audit trail rather than the
    trend-series file (PRD §15.1, §15.8).
    """
    reasons: list[str] = []

    planned = len(report.planned_query_ids)
    collected = len(report.collected_query_ids)
    query_coverage = (collected / planned) if planned else 0.0
    missing_query_ids = tuple(sorted(report.planned_query_ids - report.collected_query_ids))
    if query_coverage < policy.min_query_coverage:
        reasons.append(
            f"query_coverage {query_coverage:.2f} < {policy.min_query_coverage:.2f} "
            f"({collected}/{planned} queries)"
        )

    sample_completeness = (report.newly_collected + report.from_cache) / report.planned if report.planned else 0.0
    if sample_completeness < policy.min_sample_completeness:
        reasons.append(
            f"sample_completeness {sample_completeness:.2f} < {policy.min_sample_completeness:.2f}"
        )

    missing_providers = tuple(
        sorted(key for key, stats in report.per_provider.items() if stats.ok == 0 and stats.cached == 0)
    )

    if policy.require_single_model_version:
        for key, versions in report.resolved_model_versions.items():
            if len(versions) > 1:
                reasons.append(
                    f"provider {key} resolved to {len(versions)} distinct model versions "
                    f"within one run ({sorted(versions)}) — internally incoherent, likely a "
                    f"multi-day resume that crossed a model upgrade"
                )

    collection_span_days = (report.completed_at - report.started_at).total_seconds() / 86400.0
    if collection_span_days > policy.max_collection_span_days:
        reasons.append(
            f"collection_span_days {collection_span_days:.2f} > {policy.max_collection_span_days:.2f} "
            f"— not a point observation on a weekly trend"
        )

    cluster_count = len(report.collected_query_ids)
    if cluster_count < policy.min_clusters:
        reasons.append(
            f"cluster_count {cluster_count} < {policy.min_clusters} — bootstrap CI would be unstable"
        )

    admissible = not reasons
    return SnapshotAdmission(
        admissible=admissible,
        status="COMPLETE" if admissible else "PARTIAL",
        reasons=tuple(reasons),
        query_coverage=query_coverage,
        sample_completeness=sample_completeness,
        missing_query_ids=missing_query_ids,
        missing_providers=missing_providers,
        collection_span_days=collection_span_days,
        policy_version=policy.policy_version,
    )

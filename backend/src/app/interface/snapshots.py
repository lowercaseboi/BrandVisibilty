"""Snapshot normalization for API responses (CONTRACT §5).

Older JSONL lines written by `scripts/run_tracking_loop.py` predate the contract and
lack run_id/status/admission/etc. `normalize_snapshot` fills safe, clearly-labelled
defaults so the UI never crashes on them. It never touches stored data.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

_LEGACY_OBS_ID = re.compile(r"^(?:(?P<provider>[^:]+):)?(?P<query>q\d+)-s\d+$")


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _gap_id(gap: dict[str, Any]) -> str:
    basis = json.dumps(
        {"gap_type": gap.get("gap_type"), "evidence_refs": gap.get("evidence_refs"), "detail": gap.get("detail")},
        sort_keys=True,
        default=str,
    )
    return f"gap-{_sha1(basis)[:10]}"


def normalize_snapshot(record: dict[str, Any], *, include_raw: bool = False) -> dict[str, Any]:
    snap = dict(record)
    collected_at = snap.get("collected_at") or snap.get("collection_started_at") or ""
    is_legacy = "run_id" not in snap

    snap.setdefault("brand_key", "")
    snap.setdefault("brand", snap["brand_key"])
    snap.setdefault("run_id", _sha1(collected_at or json.dumps(record, sort_keys=True, default=str)))
    snap.setdefault("status", "completed")
    snap.setdefault("data_origin", "live")
    snap.setdefault("collection_started_at", collected_at)
    snap.setdefault("collection_completed_at", snap["collection_started_at"] or collected_at)
    snap.setdefault("collection_span_days", 0)
    snap.setdefault("query_set_content_hash", "")
    snap.setdefault("query_set_template_version", "")

    sampling = dict(snap.get("sampling_config") or {})
    sampling.setdefault("temperature", None)
    sampling.setdefault("system_prompt", None)
    sampling.setdefault("samples_per_query", 0)
    snap["sampling_config"] = sampling

    analysis = dict(snap.get("analysis_result") or {})
    for key in ("coverage", "composite_score", "ci_low", "ci_high"):
        analysis.setdefault(key, 0.0)
    analysis.setdefault("prominence", None)
    analysis.setdefault("share_of_voice", None)
    analysis["per_provider_coverage"] = list(analysis.get("per_provider_coverage") or [])
    snap["analysis_result"] = analysis

    if not snap.get("providers"):
        from_breakdown = [p.get("provider_id") for p in analysis["per_provider_coverage"] if p.get("provider_id")]
        # The legacy script only ever used Gemini.
        snap["providers"] = from_breakdown or (["gemini"] if is_legacy else [])

    snap.setdefault("comparability_key", _sha1(
        f"{snap['query_set_content_hash']}|{json.dumps(sampling, sort_keys=True)}|{','.join(sorted(snap['providers']))}"
    )[:16])

    raw = list(snap.get("raw_observations") or [])
    snap.setdefault("observation_count", len(raw))
    snap.setdefault("mentioned_count", 0)
    snap.setdefault("cluster_count", len({o.get("query_id") or o.get("query_text") for o in raw}) if raw else 0)

    snap["gaps"] = [
        {
            "gap_type": "",
            "evidence_refs": [],
            "detail": {},
            "is_inferred": False,
            **g,
            "gap_id": g.get("gap_id") or _gap_id(g),
        }
        for g in (snap.get("gaps") or [])
    ]
    snap["recommendations"] = list(snap.get("recommendations") or [])

    admission = dict(snap.get("admission") or {})
    admission.setdefault("admissible", True)
    admission.setdefault("status", "admitted")
    admission.setdefault("reasons", ["Legacy snapshot recorded before admission policy existed"] if is_legacy else [])
    admission.setdefault("query_coverage", 1.0)
    admission.setdefault("sample_completeness", 1.0)
    admission.setdefault("missing_query_ids", [])
    admission.setdefault("missing_providers", [])
    admission.setdefault("collection_span_days", snap["collection_span_days"])
    admission.setdefault("policy_version", "legacy" if is_legacy else "v0")
    snap["admission"] = admission

    entities = dict(snap.get("entities") or {})
    entities.setdefault("self", snap["brand"])
    snap["entities"] = entities

    if include_raw:
        default_provider = snap["providers"][0] if snap["providers"] else "unknown"
        snap["raw_observations"] = [_normalize_observation(o, default_provider) for o in raw]
    else:
        snap.pop("raw_observations", None)
    return snap


def _normalize_observation(obs: dict[str, Any], default_provider: str) -> dict[str, Any]:
    out = dict(obs)
    match = _LEGACY_OBS_ID.match(str(out.get("observation_id", "")))
    out.setdefault("provider_id", (match and match.group("provider")) or default_provider)
    out.setdefault("query_id", match.group("query") if match else "")
    out.setdefault("query_text", "")
    out.setdefault("intent_type", "")
    out.setdefault("model_version", "")
    out.setdefault("response_text", "")
    out["mentions"] = list(out.get("mentions") or [])
    return out

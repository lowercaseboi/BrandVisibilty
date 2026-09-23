"""Deterministic id derivation — there's no database yet to assign `gap_id`/`Recommendation.id`,
so both are content hashes: the same `Gap` (or the same drafted recommendation inputs) produce
the same id every time, reproducibly, across runs and processes. Never a random UUID.
"""

from __future__ import annotations

import hashlib
import json

from app.analysis.types import Gap


def gap_id(gap: Gap) -> str:
    payload = json.dumps(
        {"gap_type": gap.gap_type, "evidence_refs": list(gap.evidence_refs), "detail": gap.detail},
        sort_keys=True,
        default=str,
    )
    return "gap_" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def recommendation_id(gap_id_: str, action: str, evidence_refs: tuple[str, ...]) -> str:
    payload = json.dumps(
        {"gap_id": gap_id_, "action": action, "evidence_refs": list(evidence_refs)},
        sort_keys=True,
    )
    return "rec_" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

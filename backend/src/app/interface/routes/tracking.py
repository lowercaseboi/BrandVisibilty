from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from app.interface import tracking_reader
from app.interface.brand_registry import PILOT_BRANDS
from app.interface.schemas import Snapshot

router = APIRouter()


def resolve_brand(brand_key: str) -> str:
    if brand_key not in PILOT_BRANDS:
        raise HTTPException(status_code=404, detail=f"Unknown brand_key {brand_key!r}")
    return PILOT_BRANDS[brand_key]


def _tracking_root(request: Request) -> Path:
    return request.app.state.tracking_root


@router.get("/brands/{brand_key}/snapshots", response_model=list[Snapshot])
def get_snapshots(brand_key: str, request: Request) -> list[dict]:
    resolve_brand(brand_key)
    path = _tracking_root(request) / f"{brand_key}.jsonl"
    return tracking_reader.read_snapshots(path)


@router.get("/brands/{brand_key}/snapshots/latest", response_model=Snapshot)
def get_latest_snapshot(brand_key: str, request: Request) -> dict:
    resolve_brand(brand_key)
    path = _tracking_root(request) / f"{brand_key}.jsonl"
    snapshot = tracking_reader.read_latest_snapshot(path)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"No snapshot data for {brand_key!r}")
    return snapshot


@router.get("/brands/{brand_key}/runs", response_model=list[Snapshot])
def get_runs(brand_key: str, request: Request) -> list[Snapshot]:
    resolve_brand(brand_key)
    path = _tracking_root(request) / f"{brand_key}.runs.jsonl"
    # The audit trail can contain rows written under a schema that pre-dates the current
    # Snapshot shape (e.g. pre-admissibility-gate migrated records) — skip whatever doesn't
    # validate rather than 500 the whole endpoint over one legacy/audit-only row.
    valid = []
    for row in tracking_reader.read_snapshots(path):
        try:
            valid.append(Snapshot.model_validate(row))
        except ValidationError:
            continue
    return valid

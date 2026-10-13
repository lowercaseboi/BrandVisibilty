"""Metrics v2 for every stored run — computed at run time, or recomputed from stored answers.

New runs store `metrics_v2` in their snapshot line. Runs recorded before metrics v2 (or
whose metric config / tracked competitor list has changed since) are rescored from their
stored raw answers with the current config and alias table. The result is cached under
`DATA_DIR/metrics/<brand_key>/<run_id>.json`; the snapshot history itself is never
rewritten (append-only, CONTRACT §3).

A rescored run is marked `rescored: true`: its numbers use *today's* competitor list,
which is what makes the whole history comparable, but may differ from what that run's
own detector saw at the time.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.analysis.types import EntityAlias
from app.analysis.visibility import MetricConfig, compute_visibility
from app.brands.registry import SELF_ENTITY_ID, BrandConfig, get_brand
from app.tracking import store
from app.tracking.snapshot import alias_table_signature

log = logging.getLogger(__name__)

PUBLIC_DROP = ("cells",)


def _fresh(metrics: Any, cfg_hash: str, signature: str) -> bool:
    return (
        isinstance(metrics, dict)
        and metrics.get("metric_config_hash") == cfg_hash
        and metrics.get("alias_signature") == signature
        and isinstance(metrics.get("cells"), list)
    )


def compute_for_answers(
    raw_observations: list[dict],
    alias_table: tuple[EntityAlias, ...],
    competitor_ids: frozenset[str],
    *,
    run_id: str,
    cfg: MetricConfig | None = None,
) -> dict:
    """metrics_v2 for one run's stored answers (scored ones only — PRD §10.1)."""
    cfg = cfg or MetricConfig()
    scored = [o for o in raw_observations if isinstance(o, dict) and o.get("scored") is not False]
    metrics = compute_visibility(scored, alias_table, SELF_ENTITY_ID, competitor_ids, cfg=cfg, seed_basis=run_id)
    metrics["alias_signature"] = alias_table_signature(alias_table)
    return metrics


def metrics_for(brand_key: str, light: dict, *, brand: BrandConfig | None = None) -> dict | None:
    """The run's metrics_v2 under the current config and alias table (None when the run has
    no stored answers or the brand is unknown)."""
    if brand is None:
        try:
            brand = get_brand(brand_key)
        except KeyError:
            return None
    cfg = MetricConfig()
    alias_table = brand.alias_table()
    signature = alias_table_signature(alias_table)
    cfg_hash = cfg.config_hash()

    stored = light.get("metrics_v2")
    if _fresh(stored, cfg_hash, signature):
        return stored

    run_id = str(light.get("run_id") or "")
    if not run_id:
        return None
    path = store.metrics_cache_path(brand_key, run_id)
    if path.exists():
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cached = None
        if _fresh(cached, cfg_hash, signature):
            return cached

    raw = store.load_observations(brand_key, run_id)
    if not raw or not any(o.get("scored") is not False and o.get("response_text") for o in raw):
        return None
    metrics = compute_for_answers(raw, alias_table, brand.competitor_ids(), run_id=run_id, cfg=cfg)
    metrics["rescored"] = True
    try:
        store.write_atomic(path, json.dumps(metrics, ensure_ascii=False, sort_keys=True))
    except OSError as exc:  # a read-only volume must not break reads
        log.warning("Could not cache metrics for %s run %s: %s", brand_key, run_id, exc)
    return metrics


def attach_metrics(brand_key: str, records: list[dict]) -> list[dict]:
    """Return copies of `records` with `metrics_v2` set to the current metrics (cells kept)."""
    try:
        brand = get_brand(brand_key)
    except KeyError:
        return [dict(r) for r in records]
    out = []
    for record in records:
        copy = dict(record)
        copy["metrics_v2"] = metrics_for(brand_key, record, brand=brand)
        out.append(copy)
    return out


def public(metrics: dict | None) -> dict | None:
    """metrics_v2 as served to the UI: without the per-cell sums (those feed comparisons only)."""
    if not isinstance(metrics, dict):
        return None
    return {k: v for k, v in metrics.items() if k not in PUBLIC_DROP}

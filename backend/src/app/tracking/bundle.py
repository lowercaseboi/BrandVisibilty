"""Run bundles: one run's inputs and results as a zip anyone can re-check (metrics v2).

`build_bundle` packs a stored run: the questions, every raw AI answer, the alias table, every
config the numbers depend on, and the results (v1 composite, v2 Visibility Index, gaps,
recommendations), plus a manifest with a SHA-256 per file.

`verify_bundle` recomputes everything from the answers with this package's pure functions —
no API keys, no network, no data directory — and diffs it field by field:

    integrity        every file matches its manifest hash (a tampered answer is named)
    detection        mentions re-detected from the answer text = stored mentions
    v1_score         Coverage / Prominence / SoV / composite and its CI
    v2_metrics       the whole metrics_v2 block (VI, intervals, cells, …)
    gaps             gap ids, types and details
    recommendations  ids, actions, priorities, gains, confidence

A check is "skipped" (never silently passed) when the run predates what it needs, e.g. runs
recorded before the alias table was stored can't have their detection re-checked.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
import platform
import random
import zipfile
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.analysis.gap_detector import detect_gaps
from app.analysis.mention_detector import detect_mentions
from app.analysis.scorer import DEFAULT_BOOTSTRAP_SEED, score
from app.analysis.types import (
    DetectionConfig,
    EntityAlias,
    EntityMention,
    Gap,
    Observation,
)
from app.analysis.visibility import METRIC_VERSION, MetricConfig, compute_visibility
from app.tracking.snapshot import alias_table_signature

FORMAT = "brandlens-run-bundle/1"
SELF = "self"
FILES = ("snapshot.json", "observations.jsonl", "questions.json", "alias_table.json", "config.json", "metrics.json")
_TOLERANCE = 1e-9


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def code_sha() -> str | None:
    """The git commit the backend runs from: $BRANDLENS_CODE_SHA (set it in images built without
    .git), else read from .git without running git."""
    if os.environ.get("BRANDLENS_CODE_SHA"):
        return os.environ["BRANDLENS_CODE_SHA"]
    root = Path(__file__).resolve().parents[4]
    head = root / ".git" / "HEAD"
    try:
        ref = head.read_text(encoding="utf-8").strip()
        if ref.startswith("ref: "):
            ref_path = root / ".git" / ref[5:]
            if ref_path.exists():
                return ref_path.read_text(encoding="utf-8").strip()
            packed = (root / ".git" / "packed-refs").read_text(encoding="utf-8")
            return next((line.split()[0] for line in packed.splitlines() if line.endswith(ref[5:])), None)
        return ref or None
    except OSError:
        return None


def _alias_rows(table: tuple[EntityAlias, ...]) -> list[dict]:
    return [{"entity_id": a.entity_id, "entity_kind": a.entity_kind, "aliases": list(a.aliases)} for a in table]


def _alias_table(rows: list[dict]) -> tuple[EntityAlias, ...]:
    return tuple(EntityAlias(r["entity_id"], r["entity_kind"], tuple(r["aliases"])) for r in rows)


def build_bundle(snapshot: dict, observations: list[dict], *, current_alias_table: tuple[EntityAlias, ...] = ()) -> bytes:
    """Zip one run. `snapshot` is the stored (light) record; `observations` its raw answers.
    `current_alias_table` is used (and labelled) only when the run didn't store its own."""
    run_alias = snapshot.get("alias_table")
    alias_source = "run" if run_alias else "current"
    alias_rows = run_alias or _alias_rows(current_alias_table)
    competitor_ids = sorted(r["entity_id"] for r in alias_rows if r["entity_id"] != SELF)

    metrics_v2 = snapshot.get("metrics_v2")
    if not metrics_v2 and alias_rows:
        # Older run: the bundle carries the v2 numbers recomputed with the labelled alias table.
        scored = [o for o in observations if o.get("scored") is not False]
        metrics_v2 = compute_visibility(
            scored, _alias_table(alias_rows), SELF, frozenset(competitor_ids), seed_basis=str(snapshot.get("run_id"))
        )
        metrics_v2["alias_signature"] = alias_table_signature(_alias_table(alias_rows))
        metrics_v2["rescored"] = True

    questions: dict[str, dict] = {}
    for o in observations:
        questions.setdefault(str(o.get("query_id")), {
            "query_id": o.get("query_id"), "query_text": o.get("query_text"),
            "intent_type": o.get("intent_type"), "scored": o.get("scored") is not False,
        })
    config = {
        "self_id": SELF,
        "competitor_ids": competitor_ids,
        "entities": snapshot.get("entities") or {},
        "metric_config": (metrics_v2 or {}).get("metric_config") or MetricConfig().as_dict(),
        "detection_config": snapshot.get("detection_config"),
        "bootstrap": snapshot.get("bootstrap"),
        "mde_reference": snapshot.get("mde_reference"),
        "uptake_priors": snapshot.get("uptake_priors"),
        "alias_source": alias_source,
        "run_code_sha": snapshot.get("code_sha"),
    }
    results = {
        "v1": snapshot.get("analysis_result"),
        "v2": metrics_v2,
        "gaps": snapshot.get("gaps") or [],
        "recommendations": snapshot.get("recommendations") or [],
    }
    files = {
        "snapshot.json": json.dumps(snapshot, ensure_ascii=False, sort_keys=True, indent=1),
        "observations.jsonl": "".join(json.dumps(o, ensure_ascii=False, sort_keys=True) + "\n" for o in observations),
        "questions.json": json.dumps(sorted(questions.values(), key=lambda q: str(q["query_id"])), ensure_ascii=False, indent=1),
        "alias_table.json": json.dumps(alias_rows, ensure_ascii=False, indent=1),
        "config.json": json.dumps(config, ensure_ascii=False, sort_keys=True, indent=1),
        "metrics.json": json.dumps(results, ensure_ascii=False, sort_keys=True, indent=1),
    }
    encoded = {name: text.encode("utf-8") for name, text in files.items()}
    manifest = {
        "format": FORMAT,
        "brand_key": snapshot.get("brand_key"),
        "run_id": snapshot.get("run_id"),
        "data_origin": snapshot.get("data_origin"),
        "created_at": datetime.now(UTC).isoformat(),
        "code_sha": code_sha(),
        "python_version": platform.python_version(),
        "metric_version": METRIC_VERSION,
        "files": {name: _sha256(data) for name, data in encoded.items()},
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=1, sort_keys=True))
        for name, data in encoded.items():
            z.writestr(name, data)
        z.writestr("README.txt", README)
    return buf.getvalue()


README = """BrandLens run bundle
====================
One tracking run: every AI answer, the configuration and the results.

Re-check every number from the answers (no API keys, no network needed):

    cd backend && uv run python scripts/verify_bundle.py path/to/this.zip

Files: manifest.json (SHA-256 of every file), snapshot.json (the run record), observations.jsonl
(raw answers + detected mentions), questions.json, alias_table.json (names matched), config.json
(metric / gap / bootstrap settings), metrics.json (v1 composite, v2 Visibility Index, gaps,
recommendations). Method: docs/METRICS_v2.md.
"""


# --------------------------------------------------------------------------- verify


def _equal(a: Any, b: Any, path: str = "") -> str | None:
    """First difference between two JSON values as 'path: a != b', or None (floats ± 1e-9)."""
    if isinstance(a, bool) or isinstance(b, bool):
        return None if a == b else f"{path}: {a!r} != {b!r}"
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return None if math.isclose(a, b, rel_tol=0, abs_tol=_TOLERANCE) else f"{path}: {a!r} != {b!r}"
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                return f"{path}.{key}: missing on one side"
            diff = _equal(a[key], b[key], f"{path}.{key}")
            if diff:
                return diff
        return None
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return f"{path}: {len(a)} items != {len(b)} items"
        for i, (x, y) in enumerate(zip(a, b, strict=True)):
            diff = _equal(x, y, f"{path}[{i}]")
            if diff:
                return diff
        return None
    return None if a == b else f"{path}: {a!r} != {b!r}"


def _check(name: str, status: str, detail: str = "") -> dict:
    return {"check": name, "status": status, "detail": detail}


def _observation(o: dict) -> Observation:
    mentions = tuple(EntityMention(**{k: m[k] for k in m if k in EntityMention.__dataclass_fields__})
                     for m in o.get("mentions") or [])
    return Observation(str(o["observation_id"]), str(o.get("query_id") or ""), str(o.get("provider_id") or ""),
                       mentions, str(o.get("intent_type") or ""))


def verify_bundle(data: bytes) -> dict:
    """Recompute and compare everything in a bundle. Returns {"ok", "checks", "manifest", "warnings"}."""
    from app.recommendation.engine import recommend_detailed

    checks: list[dict] = []
    warnings: list[str] = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        manifest = json.loads(z.read("manifest.json"))
        raw = {name: z.read(name) for name in FILES if name in z.namelist()}

    bad = [n for n, h in manifest.get("files", {}).items() if n not in raw or _sha256(raw[n]) != h]
    checks.append(_check("integrity", "fail" if bad else "pass",
                         f"changed or missing: {', '.join(sorted(bad))}" if bad else f"{len(raw)} files match the manifest"))
    if manifest.get("python_version") != platform.python_version():
        warnings.append(f"bundle made with Python {manifest.get('python_version')}, verifying with "
                        f"{platform.python_version()}: numbers should still match")
    if manifest.get("metric_version") != METRIC_VERSION:
        warnings.append(f"bundle metric version {manifest.get('metric_version')}, this code {METRIC_VERSION}")

    snapshot = json.loads(raw["snapshot.json"])
    observations = [json.loads(line) for line in raw["observations.jsonl"].decode("utf-8").splitlines() if line]
    config = json.loads(raw["config.json"])
    run_sha, here_sha = config.get("run_code_sha"), code_sha()
    if run_sha is None:
        warnings.append("this run did not record its code version (recorded before metrics v2, or outside a git "
                        "checkout): a FAIL can mean the code changed since the run")
    elif here_sha and here_sha != run_sha:
        warnings.append(f"run produced by code {run_sha[:10]}, verifying with {here_sha[:10]}: "
                        f"check out {run_sha[:10]} for an exact comparison")
    results = json.loads(raw["metrics.json"])
    alias_table = _alias_table(json.loads(raw["alias_table.json"]))
    competitors = frozenset(config["competitor_ids"])
    scored = [o for o in observations if o.get("scored") is not False]

    # detection
    if config.get("alias_source") != "run":
        checks.append(_check("detection", "skipped", "this run predates storing its alias table"))
    else:
        mismatch = next((
            o["observation_id"] for o in observations
            if [asdict(m) for m in detect_mentions(o.get("response_text") or "", alias_table)] != (o.get("mentions") or [])
        ), None)
        checks.append(_check("detection", "fail" if mismatch else "pass",
                             f"first mismatch: {mismatch}" if mismatch else f"{len(observations)} answers re-detected"))

    # v1 composite
    obs = [_observation(o) for o in scored]
    boot = config.get("bootstrap") or {"seed": DEFAULT_BOOTSTRAP_SEED, "iterations": 1000}
    v1 = score(obs, SELF, competitors, n_bootstrap=int(boot["iterations"]), rng=random.Random(int(boot["seed"])))
    stored_v1 = results.get("v1") or {}
    recomputed_v1 = {
        "coverage": v1.coverage, "prominence": v1.prominence, "share_of_voice": v1.share_of_voice,
        "composite_score": v1.composite_score, "ci_low": v1.ci_low, "ci_high": v1.ci_high,
        "per_provider_coverage": [asdict(b) for b in v1.per_provider_coverage],
    }
    diff = _equal({k: stored_v1.get(k) for k in recomputed_v1}, recomputed_v1, "v1")
    checks.append(_check("v1_score", "fail" if diff else "pass", diff or f"composite {v1.composite_score:.2f}"))

    # v2 metrics
    cfg = MetricConfig(**{**config["metric_config"], "slot_weights": tuple(config["metric_config"]["slot_weights"])})
    v2 = compute_visibility(scored, alias_table, SELF, competitors, cfg=cfg, seed_basis=str(snapshot.get("run_id")))
    v2["alias_signature"] = alias_table_signature(alias_table)
    stored_v2 = {k: v for k, v in (results.get("v2") or {}).items() if k != "rescored"}
    diff = _equal(stored_v2, v2, "v2")
    own = v2["entities"][SELF]
    checks.append(_check("v2_metrics", "fail" if diff else "pass", diff or f"VI {own['vi']:.2f} {own['ci']}"))

    # gaps
    detection = DetectionConfig(**config["detection_config"]) if config.get("detection_config") else DetectionConfig()
    gaps = detect_gaps(obs, SELF, competitors, detection)
    recomputed_gaps = [asdict(g) for g in gaps]
    stored_gaps = [{k: g.get(k) for k in ("gap_type", "evidence_refs", "detail", "is_inferred", "gap_id")}
                   for g in results.get("gaps") or []]
    diff = _equal(json.loads(json.dumps(stored_gaps)), json.loads(json.dumps(recomputed_gaps)), "gaps")
    checks.append(_check("gaps", "fail" if diff else "pass", diff or f"{len(gaps)} gaps"))

    # recommendations
    stored_recs = results.get("recommendations") or []
    if snapshot.get("recommendation_status") == "failed":
        checks.append(_check("recommendations", "skipped", "drafting failed for this run"))
    else:
        uses_v2 = any(r.get("expected_gain_vi") is not None for r in stored_recs)
        if uses_v2 and config.get("uptake_priors") is None:
            checks.append(_check("recommendations", "skipped", "this run predates storing its uptake priors"))
        else:
            result = recommend_detailed(
                [Gap(**{k: (tuple(v) if k == "evidence_refs" else v) for k, v in g.items()}) for g in recomputed_gaps],
                obs, SELF, competitors, entity_names=config.get("entities") or {},
                metrics_v2=results.get("v2") if uses_v2 else None,
                mde=(config.get("mde_reference") or {}).get("value") if uses_v2 else None,
                priors=config.get("uptake_priors") if uses_v2 else None, detection_config=detection,
            )
            fields = ("recommendation_id", "gap_id", "action", "priority", "delta_composite", "confidence",
                      "expected_gain_vi", "reasoning")
            mine = [{f: asdict(r).get(f) for f in fields} for r in result.passed]
            theirs = [{f: r.get(f) for f in fields} for r in stored_recs]
            diff = _equal(json.loads(json.dumps(theirs)), json.loads(json.dumps(mine)), "recommendations")
            checks.append(_check("recommendations", "fail" if diff else "pass", diff or f"{len(mine)} recommendations"))

    return {
        "ok": all(c["status"] != "fail" for c in checks),
        "checks": checks,
        "manifest": manifest,
        "warnings": warnings,
    }

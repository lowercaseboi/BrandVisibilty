"""Run bundles: export then verify recomputes everything; tampering is caught and named."""

from __future__ import annotations

import io
import json
import zipfile

import pytest

from app import paths
from app.brands.registry import get_brand
from app.tracking import store
from app.tracking.bundle import build_bundle, verify_bundle

BRAND = "gajanan_vada_pav"


@pytest.fixture
def run(tmp_path, monkeypatch):
    from app.pipeline.runner import run_pipeline

    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    run_pipeline(BRAND, providers="synthetic", samples=2, round=1)
    snap = run_pipeline(BRAND, providers="synthetic", samples=2, round=2)
    light = store.load_snapshots(BRAND)[-1]
    return light, store.load_observations(BRAND, snap["run_id"])


def _bundle(light, observations):
    return build_bundle(light, observations, current_alias_table=get_brand(BRAND).alias_table())


def _statuses(report):
    return {c["check"]: c["status"] for c in report["checks"]}


def _rewrite(data: bytes, name: str, change, *, fix_manifest: bool) -> bytes:
    import hashlib

    with zipfile.ZipFile(io.BytesIO(data)) as z:
        files = {n: z.read(n) for n in z.namelist()}
    files[name] = change(files[name])
    if fix_manifest:
        manifest = json.loads(files["manifest.json"])
        manifest["files"][name] = hashlib.sha256(files[name]).hexdigest()
        files["manifest.json"] = json.dumps(manifest).encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n, d in files.items():
            z.writestr(n, d)
    return buf.getvalue()


def test_a_fresh_run_verifies_completely(run):
    report = verify_bundle(_bundle(*run))
    assert report["ok"], report["checks"]
    assert set(_statuses(report).values()) == {"pass"}
    assert report["manifest"]["files"].keys() >= {"observations.jsonl", "metrics.json", "config.json"}


def test_a_tampered_answer_fails_integrity_and_names_the_file(run):
    data = _rewrite(_bundle(*run), "observations.jsonl", lambda b: b.replace(b"Vada", b"Vadaa", 1), fix_manifest=False)
    report = verify_bundle(data)
    assert not report["ok"]
    integrity = next(c for c in report["checks"] if c["check"] == "integrity")
    assert integrity["status"] == "fail" and "observations.jsonl" in integrity["detail"]


def test_a_changed_result_fails_recomputation_even_with_a_fixed_manifest(run):
    def bump(b: bytes) -> bytes:
        results = json.loads(b)
        results["v2"]["entities"]["self"]["vi"] += 1.0
        return json.dumps(results).encode()

    report = verify_bundle(_rewrite(_bundle(*run), "metrics.json", bump, fix_manifest=True))
    assert _statuses(report)["integrity"] == "pass"
    assert _statuses(report)["v2_metrics"] == "fail"


def test_an_old_run_without_stored_aliases_skips_detection_but_checks_the_rest(run):
    light, observations = run
    old = {k: v for k, v in light.items() if k not in ("alias_table", "alias_signature", "metrics_v2", "uptake_priors")}
    old["recommendations"], old["recommendation_status"] = [], "failed"
    report = verify_bundle(_bundle(old, observations))
    statuses = _statuses(report)
    assert statuses["detection"] == statuses["recommendations"] == "skipped"
    assert statuses["v1_score"] == statuses["v2_metrics"] == statuses["gaps"] == "pass"
    assert report["ok"]

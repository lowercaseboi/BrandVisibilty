"""Metrics v2 storage and rescoring: stored at run time, recomputed bit-for-bit from answers."""

from __future__ import annotations

import hashlib
import json

import pytest

from app import paths
from app.analysis.types import EntityAlias
from app.brands.registry import get_brand
from app.tracking import rescore, store

BRAND = "gajanan_vada_pav"


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


def _run() -> dict:
    from app.pipeline.runner import run_pipeline

    return run_pipeline(BRAND, providers="synthetic", samples=2)


def _strip_v2_from_history(data_dir) -> None:
    """Make the stored line look like a run recorded before metrics v2."""
    path = data_dir / "tracking" / f"{BRAND}.jsonl"
    lines = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    for line in lines:
        line.pop("metrics_v2", None)
    path.write_text("".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines), encoding="utf-8")


def _sha(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_a_new_run_stores_v2_metrics_and_everything_needed_to_recompute(data_dir):
    snap = _run()
    m = snap["metrics_v2"]
    assert m["metric_version"] == "v2.0" and m["cells"] and m["alias_signature"] == snap["alias_signature"]
    assert snap["detection_config"]["presence_threshold"] == 0.10
    assert snap["bootstrap"] == {"seed": 42, "iterations": 1000}
    assert {row["entity_id"] for row in snap["alias_table"]} == set(snap["entities"])
    light = store.load_snapshots(BRAND)[-1]
    assert light["metrics_v2"] == m


def test_fresh_stored_metrics_are_used_as_is(data_dir, monkeypatch):
    _run()
    light = store.load_snapshots(BRAND)[-1]
    monkeypatch.setattr(rescore, "compute_for_answers", lambda *a, **k: pytest.fail("recomputed"))
    assert rescore.metrics_for(BRAND, light) == light["metrics_v2"]


def test_recomputing_from_stored_answers_reproduces_the_run_time_numbers(data_dir):
    snap = _run()
    at_run_time = snap["metrics_v2"]
    _strip_v2_from_history(data_dir)
    recomputed = rescore.metrics_for(BRAND, store.load_snapshots(BRAND)[-1])
    assert recomputed.pop("rescored") is True
    assert recomputed == at_run_time


def test_old_runs_are_rescored_once_and_history_is_never_rewritten(data_dir, monkeypatch):
    _run()
    _strip_v2_from_history(data_dir)
    history = data_dir / "tracking" / f"{BRAND}.jsonl"
    before = _sha(history)
    light = store.load_snapshots(BRAND)[-1]
    first = rescore.metrics_for(BRAND, light)
    assert store.metrics_cache_path(BRAND, light["run_id"]).exists()
    assert _sha(history) == before
    monkeypatch.setattr(rescore, "compute_for_answers", lambda *a, **k: pytest.fail("cache not used"))
    assert rescore.metrics_for(BRAND, light) == first


def test_a_changed_competitor_list_invalidates_stored_and_cached_metrics(data_dir):
    _run()
    light = store.load_snapshots(BRAND)[-1]
    real = get_brand(BRAND)

    class EditedBrand:
        def alias_table(self):
            return (*real.alias_table(), EntityAlias("new_rival", "competitor", ("New Rival",)))

        def competitor_ids(self):
            return real.competitor_ids() | {"new_rival"}

    edited = rescore.metrics_for(BRAND, light, brand=EditedBrand())
    assert edited["rescored"] is True
    assert "new_rival" in edited["entities"]
    assert edited["alias_signature"] != light["metrics_v2"]["alias_signature"]


def test_runs_without_answers_have_no_metrics(data_dir):
    assert rescore.metrics_for(BRAND, {"run_id": "missing"}) is None
    assert rescore.metrics_for("unknown_brand", {"run_id": "x"}) is None


def test_public_view_drops_cells():
    assert rescore.public({"vi": 1, "cells": [1]}) == {"vi": 1}
    assert rescore.public(None) is None


def test_deleting_a_brand_removes_its_metric_cache(data_dir):
    _run()
    _strip_v2_from_history(data_dir)
    light = store.load_snapshots(BRAND)[-1]
    rescore.metrics_for(BRAND, light)
    store.delete_brand_data(BRAND)
    assert not (data_dir / "metrics" / BRAND).exists()

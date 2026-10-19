"""Impact ledger: board moves open/close entries; runs append evaluations; end to end."""

from __future__ import annotations

import pytest

from app import paths
from app.tracking import board, impact_ledger, store

BRAND = "gajanan_vada_pav"


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


def _run(round_: int) -> dict:
    from app.pipeline.runner import run_pipeline

    return run_pipeline(BRAND, providers="synthetic", samples=2, round=round_)


def _card(column: str) -> dict:
    return {"column": column, "order": 0, "updated_at": "2026-10-13T10:00:00+00:00"}


def _a_key(snapshot: dict) -> str:
    gaps = {g["gap_id"]: g for g in snapshot["gaps"]}
    rec = snapshot["recommendations"][0]
    return f"{rec['action']}|{gaps[rec['gap_id']]['detail'].get('competitor_id') or ''}"


def test_moving_a_card_to_done_opens_an_entry_with_a_frozen_prediction(data_dir):
    snap = _run(1)
    key = _a_key(snap)
    board.save_board(BRAND, {key: _card("done")})
    [entry] = impact_ledger.entries(BRAND)
    assert entry["source"] == "board" and entry["pre_run_id"] == snap["run_id"]
    assert entry["gap_ids"] and entry["scopes"]
    lead = snap["recommendations"][0]
    assert entry["prediction"]["expected_gain_vi"] is not None
    assert entry["prediction"]["mde"] == snap["mde_reference"]["value"]
    assert lead["recommendation_id"] in entry["recommendation_ids"] or entry["recommendation_ids"]


def test_saving_again_does_not_duplicate_and_reopening_closes(data_dir):
    snap = _run(1)
    key = _a_key(snap)
    board.save_board(BRAND, {key: _card("done")})
    board.save_board(BRAND, {key: _card("done")})
    assert len(impact_ledger.entries(BRAND)) == 1
    board.save_board(BRAND, {key: _card("in_progress")})
    [entry] = impact_ledger.entries(BRAND)
    assert entry["closed_at"] is not None
    board.save_board(BRAND, {key: _card("done")})
    assert [e["closed_at"] is None for e in impact_ledger.entries(BRAND)] == [False, True]


def test_cards_with_no_matching_recommendation_are_ignored(data_dir):
    _run(1)
    board.save_board(BRAND, {"video|nobody": _card("done")})
    assert impact_ledger.entries(BRAND) == []


def test_a_failing_ledger_never_breaks_the_board(data_dir, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("ledger down")

    monkeypatch.setattr(impact_ledger, "on_board_change", boom)
    saved = board.save_board(BRAND, {"x|": _card("done")})
    assert board.load_board(BRAND) == saved


def test_end_to_end_runs_after_the_action_are_evaluated_and_logged(data_dir):
    first = _run(1)
    board.save_board(BRAND, {_a_key(first): _card("done")})
    assert impact_ledger.evaluate_all(BRAND)[0]["evaluation"]["status"] == "waiting"
    for r in (2, 3, 4):
        last = _run(r)
    [item] = impact_ledger.evaluate_all(BRAND)
    ev = item["evaluation"]
    assert ev["pre_run_id"] == first["run_id"] and ev["post_run_id"] == last["run_id"]
    assert ev["status"] in {
        "rose_after", "leaning_up", "no_detectable_change", "leaning_down", "fell_after", "confounded",
    }
    # synthetic demo data rises by design between rounds 1 and 4
    assert ev["primary"]["delta"] > 0
    logged = [e for e in impact_ledger.load_events(BRAND) if e["type"] == "evaluation"]
    assert [e["as_of_run_id"] for e in logged] == [s["run_id"] for s in store.load_snapshots(BRAND)[1:]]


def test_deleting_the_brand_removes_the_ledger(data_dir):
    snap = _run(1)
    board.save_board(BRAND, {_a_key(snap): _card("done")})
    store.delete_brand_data(BRAND)
    assert impact_ledger.entries(BRAND) == []

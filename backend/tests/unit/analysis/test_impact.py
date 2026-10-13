"""Impact evaluation (metrics v2): verdicts, robustness checks, confounding, prediction check."""

from __future__ import annotations

from app.analysis.impact import evaluate, scopes_overlap

T = "2026-10-{:02d}T12:00:00+00:00"


def _cells(named_by_provider: dict[str, int], *, questions: int = 8, n: int = 3) -> list[dict]:
    cells = []
    for provider, named in named_by_provider.items():
        for i in range(questions):
            cells.append({
                "q": f"q{i}", "provider": provider, "model": f"{provider}-m", "intent": "local", "n": n,
                "answered": n, "excluded": [],
                "e": {"self": [0.5 * named, 0.25 * named, named, 0], "rival": [1.0 * n, 1.0 * n, n, n]},
                "h2h": {},
            })
    return cells


def _run(day: int, named: dict[str, int], **kw) -> dict:
    return {"run_id": f"r{day}", "completed_at": T.format(day), "admissible": True, "cells": _cells(named, **kw)}


def _entry(day: int, scopes=None, **kw) -> dict:
    return {
        "ledger_id": f"imp-{day}", "done_at": T.format(day).replace("12:00", "13:00"), "scopes": scopes or [{}],
        "prediction": {"expected_gain_vi": 2.0, "opportunity_vi": 8.0}, **kw,
    }


def test_waiting_until_a_run_after_the_action():
    out = evaluate(_entry(2), [_run(1, {"gemini": 0}), _run(2, {"gemini": 0})], ["rival"])
    assert out["status"] == "waiting" and out["pre_run_id"] == "r2"


def test_no_baseline_without_a_run_before():
    assert evaluate(_entry(1), [_run(2, {"gemini": 0})], ["rival"])["status"] == "no_baseline"


def test_a_rise_on_the_targeted_provider_with_flat_untargeted_cells():
    runs = [_run(1, {"gemini": 0, "groq": 0}), _run(2, {"gemini": 0, "groq": 0}), _run(4, {"gemini": 2, "groq": 0})]
    out = evaluate(_entry(2, scopes=[{"provider_id": "gemini"}]), runs, ["rival"])
    assert out["status"] == "rose_after" and out["basis"] == "targeted"
    assert out["pre_run_id"] == "r2" and out["post_run_id"] == "r4"
    assert out["untargeted"]["delta"] == 0.0
    assert out["untargeted"]["difference_in_differences"] == out["primary"]["delta"]
    assert out["scope_share"] == 0.5
    assert out["measured_overall"] == round(out["primary"]["delta"] * 0.5, 6)
    assert out["prediction_check"]["error"] == round(out["measured_overall"] - 2.0, 6)
    assert out["market_drift"] == 0.0
    assert out["placebo"] == {"pairs": 1, "fired": 0, "rate": 0.0}


def test_another_overlapping_action_in_the_window_confounds():
    runs = [_run(1, {"gemini": 0}), _run(4, {"gemini": 2})]
    entry = _entry(2)
    other = _entry(3)
    out = evaluate(entry, runs, ["rival"], other_entries=[entry, other])
    assert out["status"] == "confounded" and out["confounded_by"] == ["imp-3"]
    assert out["primary"]["verdict"] == "rose_after"  # the numbers are still reported


def test_disjoint_scopes_do_not_confound():
    assert not scopes_overlap([{"provider_id": "gemini"}], [{"provider_id": "groq"}])
    assert scopes_overlap([{"provider_id": "gemini"}], [{"intent_type": "local"}])
    assert scopes_overlap([{}], [{"provider_id": "groq"}])


def test_runs_after_reopening_are_ignored():
    runs = [_run(1, {"gemini": 0}), _run(5, {"gemini": 2})]
    entry = _entry(2, closed_at=T.format(3))
    assert evaluate(entry, runs, ["rival"])["status"] == "waiting"


def test_inadmissible_runs_are_skipped():
    bad = {**_run(4, {"gemini": 3}), "admissible": False}
    out = evaluate(_entry(2), [_run(1, {"gemini": 0}), bad], ["rival"])
    assert out["status"] == "waiting"


def test_too_few_questions_is_insufficient_not_a_verdict():
    runs = [_run(1, {"gemini": 0}, questions=3), _run(4, {"gemini": 3}, questions=3)]
    assert evaluate(_entry(2), runs, ["rival"])["status"] == "insufficient_data"


def test_a_scope_too_small_for_a_verdict_falls_back_to_the_overall_index():
    runs = [_run(1, {"gemini": 0, "groq": 0}), _run(4, {"gemini": 2, "groq": 2})]
    # one question only in scope
    entry = _entry(2, scopes=[{"intent_type": "local", "questions": ["q0"]}])
    out = evaluate(entry, runs, ["rival"])
    assert out["basis"] == "overall" and out["targeted"]["verdict"] == "insufficient_data"
    assert out["status"] == "rose_after" and out["primary"]["questions"] == 8
    assert out["scope_share"] == 1.0 and out["untargeted"] is None


def test_evaluation_is_deterministic():
    runs = [_run(1, {"gemini": 0, "groq": 1}), _run(4, {"gemini": 1, "groq": 2})]
    assert evaluate(_entry(2), runs, ["rival"]) == evaluate(_entry(2), runs, ["rival"])

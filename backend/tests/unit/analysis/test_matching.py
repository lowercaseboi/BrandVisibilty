"""Matched run comparison (metrics v2), including its error rates on simulated runs."""

from __future__ import annotations

import random

from app.analysis.matching import market_drift, match, overlap

QUESTIONS = 17
PROVIDERS = ("gemini", "groq")
SAMPLES = 3
WEIGHT = 0.5  # every mention at slot 3, so VI = 50 x naming rate


def _cell(q: str, provider: str, named: int, n: int = SAMPLES, *, model: str | None = None, comp: int = 0) -> dict:
    return {
        "q": q,
        "provider": provider,
        "model": model or f"{provider}-m",
        "intent": "local" if q < "q08" else "discovery",
        "n": n,
        "answered": n,
        "excluded": [],
        "e": {
            "self": [WEIGHT * named, WEIGHT * WEIGHT * named, named, 0],
            "rival": [WEIGHT * comp, WEIGHT * WEIGHT * comp, comp, 0],
        },
        "h2h": {},
    }


def _simulate(rates: list[float], rng: random.Random, lift: float = 0.0) -> list[dict]:
    cells = []
    for i, p in enumerate(rates):
        for provider in PROVIDERS:
            named = sum(rng.random() < min(1.0, p + lift) for _ in range(SAMPLES))
            cells.append(_cell(f"q{i:02d}", provider, named))
    return cells


def test_identical_runs_show_no_change():
    cells = [_cell(f"q{i:02d}", p, i % 3) for i in range(8) for p in PROVIDERS]
    m = match(cells, cells, "self")
    assert m["delta"] == 0.0 and m["verdict"] == "no_detectable_change"
    assert m["overlap"] == 1.0 and m["vi_after"] - m["vi_before"] == m["delta"]


def test_a_clear_rise_is_detected():
    before = [_cell(f"q{i:02d}", p, 0) for i in range(8) for p in PROVIDERS]
    after = [_cell(f"q{i:02d}", p, 2 + (i % 2)) for i in range(8) for p in PROVIDERS]
    m = match(before, after, "self")
    assert m["verdict"] == "rose_after" and m["delta"] > 0


def test_only_shared_cells_are_compared():
    before = [_cell(f"q{i:02d}", "gemini", 1) for i in range(6)]
    after = [_cell(f"q{i:02d}", "gemini", 1) for i in range(1, 6)] + [_cell("q99", "gemini", 3)]
    m = match(before, after, "self")
    assert m["matched_cells"] == 5 and m["questions"] == 5
    assert m["overlap"] == round(5 / 7, 6)


def test_a_model_change_leaves_nothing_to_compare():
    before = [_cell(f"q{i:02d}", "gemini", 1) for i in range(6)]
    after = [_cell(f"q{i:02d}", "gemini", 1, model="gemini-new") for i in range(6)]
    m = match(before, after, "self")
    assert m["matched_cells"] == 0 and m["verdict"] == "insufficient_data"
    assert overlap(before, after) == 0.0


def test_scope_restricts_to_a_provider_or_intent():
    before = [_cell(f"q{i:02d}", p, 0) for i in range(10) for p in PROVIDERS]
    after = [_cell(f"q{i:02d}", p, 3 if p == "groq" else 0) for i in range(10) for p in PROVIDERS]
    assert match(before, after, "self", scope={"provider_id": "gemini"})["delta"] == 0.0
    assert match(before, after, "self", scope={"provider_id": "groq"})["verdict"] == "rose_after"
    local = match(before, after, "self", scope={"intent_type": "local"})
    assert local["questions"] == 8


def test_market_drift_averages_competitor_changes():
    before = [_cell(f"q{i:02d}", "gemini", 0, comp=1) for i in range(6)]
    after = [_cell(f"q{i:02d}", "gemini", 0, comp=2) for i in range(6)]
    assert market_drift(before, after, ["rival"]) == round(100 * WEIGHT / SAMPLES, 6)


def test_comparison_is_deterministic():
    rng = random.Random(3)
    rates = [rng.uniform(0, 0.4) for _ in range(QUESTIONS)]
    a, b = _simulate(rates, random.Random(1)), _simulate(rates, random.Random(2))
    assert match(a, b, "self", seed_basis="x") == match(a, b, "self", seed_basis="x")


def test_false_alarm_rate_on_repeat_runs_with_no_change():
    """A/A: two runs of an unchanged brand. 'rose_after'/'fell_after' must be rare (<= 8%)."""
    rng = random.Random(20261013)
    trials, alarms = 300, 0
    for t in range(trials):
        rates = [rng.uniform(0.0, 0.5) for _ in range(QUESTIONS)]
        m = match(_simulate(rates, rng), _simulate(rates, rng), "self", seed_basis=str(t), n_bootstrap=300)
        alarms += m["verdict"] in ("rose_after", "fell_after")
    assert alarms / trials <= 0.08


def test_power_a_lift_of_one_and_a_half_mde_is_usually_detected():
    rng = random.Random(7)
    rates = [rng.uniform(0.0, 0.4) for _ in range(QUESTIONS)]
    mdes = [
        match(_simulate(rates, rng), _simulate(rates, rng), "self", n_bootstrap=200)["mde"] for _ in range(40)
    ]
    typical_mde = sorted(mdes)[len(mdes) // 2]
    lift = 1.5 * typical_mde / (100 * WEIGHT)  # naming-rate lift giving 1.5 x MDE in VI points
    trials, detected = 150, 0
    for t in range(trials):
        m = match(_simulate(rates, rng), _simulate(rates, rng, lift), "self", seed_basis=str(t), n_bootstrap=300)
        detected += m["verdict"] == "rose_after"
    assert detected / trials >= 0.70

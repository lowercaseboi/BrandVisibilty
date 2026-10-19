"""Statistics toolkit for metrics v2."""

from __future__ import annotations

import random

import pytest

from app.analysis.stats import (
    MDE_FACTOR,
    derived_seed,
    mde,
    paired_summary,
    percentile,
    t_quantile,
    verdict,
)


def test_percentile_interpolates_like_scorer_v1():
    assert percentile([0.0, 10.0], 50) == 5.0
    assert percentile([], 50) == 0.0
    assert percentile([3.0], 97.5) == 3.0


def test_t_quantiles_shrink_towards_normal():
    assert t_quantile(1, 95) == pytest.approx(12.706)
    assert t_quantile(16, 95) == pytest.approx(2.120)
    assert t_quantile(500, 95) == pytest.approx(1.980)  # next lower tabulated df: conservative
    assert t_quantile(16, 80) < t_quantile(16, 95)


def test_derived_seeds_are_stable_and_distinct_per_statistic():
    assert derived_seed(1, "run", "vi") == derived_seed(1, "run", "vi")
    assert derived_seed(1, "run", "vi") != derived_seed(1, "run", "h2h")


def test_mde_formula():
    assert mde(5.0, 16) == pytest.approx(MDE_FACTOR * 5.0 / 4)
    assert mde(5.0, 1) is None


def test_paired_summary_takes_the_wider_of_t_and_bootstrap():
    diffs = [1.0, 2.0, 0.0, 3.0, 1.5, -0.5, 2.5, 1.0]
    s = paired_summary(diffs, random.Random(0), 500)
    assert s["n"] == 8
    assert s["ci95"][0] <= s["ci80"][0] <= s["mean"] <= s["ci80"][1] <= s["ci95"][1]
    t_half = t_quantile(7, 95) * s["sd"] / (8 ** 0.5)
    assert s["ci95"][0] <= s["mean"] - t_half + 1e-6
    assert s["ci95"][1] >= s["mean"] + t_half - 1e-6


def test_paired_summary_edge_cases():
    assert paired_summary([], random.Random(0), 10)["mean"] is None
    one = paired_summary([4.0], random.Random(0), 10)
    assert one["mean"] == 4.0 and one["ci95"] is None


@pytest.mark.parametrize(
    ("ci95", "ci80", "expected"),
    [
        ([0.5, 3.0], [1.0, 2.5], "rose_after"),
        ([-3.0, -0.5], [-2.5, -1.0], "fell_after"),
        ([-0.5, 3.0], [0.2, 2.5], "leaning_up"),
        ([-3.0, 0.5], [-2.5, -0.2], "leaning_down"),
        ([-2.0, 2.0], [-1.0, 1.0], "no_detectable_change"),
    ],
)
def test_verdicts(ci95, ci80, expected):
    assert verdict({"n": 10, "ci95": ci95, "ci80": ci80}, overlap=1.0) == expected


def test_too_little_data_is_never_a_verdict():
    rising = {"n": 3, "ci95": [1.0, 2.0], "ci80": [1.2, 1.8]}
    assert verdict(rising, overlap=1.0) == "insufficient_data"
    assert verdict({**rising, "n": 10}, overlap=0.4) == "insufficient_data"

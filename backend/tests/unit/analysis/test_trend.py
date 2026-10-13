from datetime import UTC, datetime, timedelta

import pytest

from app.analysis.trend import (
    RunMetrics,
    TrendPoint,
    compute_trend,
    compute_trend_v2,
    latest_comparable_segment,
    theil_sen_slope,
)

T0 = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)


def pt(i, score, half_width=5.0, *, key="k1", days=7.0, admissible=True, at=None):
    return TrendPoint(
        run_id=f"r{i}-{key}",
        completed_at=at if at is not None else T0 + timedelta(days=days * i),
        composite_score=score,
        ci_low=score - half_width,
        ci_high=score + half_width,
        comparability_key=key,
        admissible=admissible,
    )


def series(scores, **kw):
    return [pt(i, s, **kw) for i, s in enumerate(scores)]


# ---------------------------------------------------------------- < 2 runs


def test_no_or_one_run_is_insufficient():
    assert compute_trend([]).status == "insufficient_data"
    verdict = compute_trend([pt(0, 40)])
    assert verdict.status == "insufficient_data"
    assert verdict.method == "none"
    assert verdict.n_points == 1


# ---------------------------------------------------------------- 2–3 runs: CI overlap


def test_two_runs_with_overlapping_cis_report_no_change():
    verdict = compute_trend([pt(0, 40, 10), pt(1, 52, 10)])  # [30,50] vs [42,62]
    assert verdict.status == "no_change_detected"
    assert verdict.method == "ci_overlap"
    assert verdict.direction is None
    assert verdict.delta == pytest.approx(12)


def test_touching_cis_count_as_overlap():
    assert compute_trend([pt(0, 40, 5), pt(1, 50, 5)]).status == "no_change_detected"


def test_two_runs_non_overlapping_up():
    verdict = compute_trend([pt(0, 30, 5), pt(1, 50, 5)])
    assert verdict.status == "change_detected"
    assert verdict.direction == "up"
    assert verdict.delta == pytest.approx(20)
    assert (verdict.previous_score, verdict.latest_score) == (30, 50)


def test_two_runs_non_overlapping_down():
    verdict = compute_trend([pt(0, 60, 4), pt(1, 35, 4)])
    assert verdict.status == "change_detected"
    assert verdict.direction == "down"
    assert verdict.delta == pytest.approx(-25)


def test_three_runs_compare_only_the_last_two():
    # First run is far below, but the last two overlap: still no change.
    verdict = compute_trend([pt(0, 10, 3), pt(1, 50, 5), pt(2, 53, 5)])
    assert verdict.method == "ci_overlap"
    assert verdict.status == "no_change_detected"
    assert verdict.n_points == 3


# ---------------------------------------------------------------- 4+ runs: Theil–Sen


def test_theil_sen_slope_is_median_of_pairwise_slopes_and_robust_to_one_outlier():
    xs = [0, 1, 2, 3, 4]
    assert theil_sen_slope(xs, [10, 12, 14, 16, 18]) == pytest.approx(2)
    # One anomalous run (e.g. provider outage) barely moves it.
    assert theil_sen_slope(xs, [10, 12, 90, 16, 18]) == pytest.approx(2)
    assert theil_sen_slope([1, 1], [0, 5]) is None


def test_flat_noisy_series_has_no_clear_trend():
    verdict = compute_trend(series([42, 47, 39, 45, 41, 44, 40], half_width=12))
    assert verdict.method == "theil_sen"
    assert verdict.status == "no_clear_trend"
    assert verdict.direction is None
    assert verdict.slope_ci_low < 0 < verdict.slope_ci_high


def test_clearly_rising_series_is_improving_with_ci_above_zero():
    verdict = compute_trend(series([20, 28, 35, 44, 52], half_width=4))
    assert verdict.status == "improving"
    assert verdict.direction == "up"
    assert verdict.x_unit == "day"
    assert verdict.slope > 0 and verdict.slope_ci_low > 0
    # Weekly runs: slope/week ≈ 8 points, per day = /7.
    assert verdict.slope_per_week == pytest.approx(verdict.slope * 7)
    assert verdict.slope_per_week == pytest.approx(8.0, abs=0.5)
    assert verdict.n_points == 5
    assert verdict.valid_resamples > 900


def test_declining_series():
    verdict = compute_trend(series([70, 64, 55, 49, 40, 33], half_width=4))
    assert verdict.status == "declining"
    assert verdict.direction == "down"
    assert verdict.slope_ci_high < 0


def test_tiny_drift_inside_wide_cis_is_not_a_trend():
    # Monotonic, but each step is far smaller than the runs' own uncertainty.
    verdict = compute_trend(series([40, 40.5, 41, 41.5, 42], half_width=20))
    assert verdict.status == "no_clear_trend"


def test_runs_less_than_a_day_apart_use_run_index():
    verdict = compute_trend(series([20, 30, 40, 50], half_width=3, days=0.01))
    assert verdict.x_unit == "run"
    assert verdict.slope == pytest.approx(10)
    assert verdict.slope_per_week is None
    assert verdict.status == "improving"


# ---------------------------------------------------------------- comparability + admission


def test_comparability_break_only_uses_the_last_segment():
    old = series([10, 20, 30, 40, 50], half_width=3, key="old")
    new = [pt(i + 5, s, 10, key="new") for i, s in enumerate([60, 62])]
    verdict = compute_trend(old + new)
    assert verdict.comparability_key == "new"
    assert verdict.n_points == 2
    assert verdict.method == "ci_overlap"
    assert verdict.status == "no_change_detected"
    assert [p.comparability_key for p in latest_comparable_segment(old + new)] == ["new", "new"]


def test_break_right_before_the_latest_run_is_insufficient():
    points = series([10, 20, 30, 40], key="old") + [pt(4, 90, key="new")]
    verdict = compute_trend(points)
    assert verdict.status == "insufficient_data"
    assert verdict.n_points == 1


def test_inadmissible_runs_are_left_out():
    points = [pt(0, 30, 5), pt(1, 80, 5, admissible=False), pt(2, 31, 5)]
    verdict = compute_trend(points)
    assert verdict.n_points == 2
    assert verdict.n_excluded == 1
    assert verdict.status == "no_change_detected"


# ---------------------------------------------------------------- determinism


def test_same_input_gives_the_same_verdict():
    points = series([42, 47, 39, 45, 51, 44, 48], half_width=9)
    assert compute_trend(points) == compute_trend(points)
    assert compute_trend(points, seed=7) == compute_trend(points, seed=7)


# --------------------------------------------------------------------------- metrics v2


def _v2_cells(named: int, *, model: str = "m", questions: int = 6) -> tuple:
    return tuple(
        {
            "q": f"q{i}", "provider": "p", "model": model, "intent": "x", "n": 3, "answered": 3, "excluded": [],
            "e": {"self": [0.5 * named, 0.25 * named, named, 0]}, "h2h": {},
        }
        for i in range(questions)
    )


def _v2_run(i: int, named: int, **kw) -> RunMetrics:
    vi = 100 * 0.5 * named / 3
    return RunMetrics(
        run_id=f"r{i}", completed_at=datetime(2026, 10, 1 + i, tzinfo=UTC), vi=vi,
        ci_low=max(0.0, vi - 3), ci_high=vi + 3, cells=_v2_cells(named, **kw),
    )


def test_v2_one_run_is_insufficient():
    assert compute_trend_v2([_v2_run(0, 1)])["status"] == "insufficient_data"


def test_v2_two_runs_use_the_matched_comparison():
    out = compute_trend_v2([_v2_run(0, 0), _v2_run(1, 3)])
    assert out["method"] == "matched"
    assert out["status"] == "rose_after" and out["direction"] == "up"
    assert out["comparison"]["questions"] == 6


def test_v2_four_overlapping_runs_use_theil_sen():
    out = compute_trend_v2([_v2_run(i, i) for i in range(4)], n_bootstrap=200)
    assert out["method"] == "theil_sen" and out["n_points"] == 4
    assert out["slope"]["value"] > 0


def test_v2_segment_stops_at_a_model_change():
    runs = [_v2_run(0, 1, model="old"), _v2_run(1, 1, model="old"), _v2_run(2, 1), _v2_run(3, 2)]
    out = compute_trend_v2(runs)
    assert out["segment_run_ids"] == ["r2", "r3"] and out["method"] == "matched"

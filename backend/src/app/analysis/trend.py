"""Trend verdict — a pure function over a brand's tracked composite scores.

No I/O, no LLM calls, deterministic (seeded RNG), like `scorer.py`. Implements
PRD_v3 §11.6 / AC-8 and DESIGN_v1 §6.4:

- Trend direction is computed only within a constant comparability key (PRD §10.5):
  only the most recent comparable segment (the points after the last key change) is used.
- 2–3 comparable runs: a two-run **comparison** of the latest run against the previous
  one, by overlap of their cluster-bootstrap CIs (PRD §10.7) — "change detected" only
  when the CIs do not overlap. DESIGN §6.4 specifies 2 and 4+; with 3 runs a slope is
  not yet trustworthy, so the two-run comparison of the last two is used.
- 4+ comparable runs: a **Theil–Sen slope** (median of all pairwise slopes, robust to a
  single anomalous run) with a bootstrap CI; a direction is reported only when that CI
  excludes zero. Otherwise "no clear trend" — the honest default, never a bare
  point-estimate comparison (AC-8).

x-axis: days since the first run of the segment — unless the runs are packed closer than
one day apart (median gap < 1 day, e.g. back-to-back demo runs), where a per-day slope
would be meaningless; then x is the run index and the slope is reported per run.

Slope bootstrap: each iteration resamples the runs with replacement *and* redraws each
resampled score from its own stored CI (normal approximation, sd = CI width / 3.92), so
the per-run cluster-bootstrap uncertainty (PRD §10.7) carries into the slope's CI. A
monotonic but tiny drift inside wide per-run CIs therefore stays "no clear trend".
Resamples with fewer than two distinct x values have no defined slope and are skipped.
"""

from __future__ import annotations

import random
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import pairwise
from typing import Literal

TrendStatus = Literal[
    "insufficient_data",
    "no_change_detected",
    "change_detected",
    "no_clear_trend",
    "improving",
    "declining",
]
TrendMethod = Literal["none", "ci_overlap", "theil_sen"]
XUnit = Literal["day", "run"]

MIN_THEIL_SEN_POINTS = 4
DEFAULT_BOOTSTRAP_ITERATIONS = 1000
DEFAULT_SEED = 20260611
MIN_DAY_SPACING = 1.0  # median gap (days) below which x falls back to the run index

_CI_LOW_PERCENTILE = 2.5
_CI_HIGH_PERCENTILE = 97.5
_Z95 = 1.959964
_SECONDS_PER_DAY = 86_400.0
_EPS = 1e-9


@dataclass(frozen=True)
class TrendPoint:
    """One tracked run: its composite score (0–100) with its cluster-bootstrap CI."""

    run_id: str
    completed_at: datetime | None
    composite_score: float
    ci_low: float
    ci_high: float
    comparability_key: str
    admissible: bool = True


@dataclass(frozen=True)
class TrendVerdict:
    """What may honestly be said about the score's movement (PRD §11.6).

    Scores and slopes are on the 0–100 composite scale. Comparison fields are set for
    method "ci_overlap"; slope fields for method "theil_sen".
    """

    status: TrendStatus
    method: TrendMethod
    direction: Literal["up", "down"] | None
    n_points: int  # admissible runs in the latest comparable segment (what was analysed)
    n_excluded: int  # inadmissible runs in that segment, left out
    comparability_key: str | None
    first_run_id: str | None = None
    last_run_id: str | None = None
    # Two-run comparison (latest vs previous)
    previous_score: float | None = None
    previous_ci_low: float | None = None
    previous_ci_high: float | None = None
    latest_score: float | None = None
    latest_ci_low: float | None = None
    latest_ci_high: float | None = None
    delta: float | None = None
    # Theil–Sen slope
    x_unit: XUnit | None = None
    slope: float | None = None  # points per x_unit
    slope_ci_low: float | None = None
    slope_ci_high: float | None = None
    slope_per_week: float | None = None  # x_unit == "day" only
    slope_per_week_ci_low: float | None = None
    slope_per_week_ci_high: float | None = None
    span_days: float | None = None
    bootstrap_iterations: int | None = None
    valid_resamples: int | None = None


def latest_comparable_segment(points: Sequence[TrendPoint]) -> list[TrendPoint]:
    """The trailing run of points sharing the newest comparability key (oldest first).
    Mirrors TrendChart, which breaks the line wherever consecutive keys differ."""
    if not points:
        return []
    key = points[-1].comparability_key
    start = len(points)
    while start > 0 and points[start - 1].comparability_key == key:
        start -= 1
    return list(points[start:])


def theil_sen_slope(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Median of all pairwise slopes (pairs with equal x skipped); None if undefined."""
    slopes = [
        (ys[j] - ys[i]) / (xs[j] - xs[i])
        for i in range(len(xs))
        for j in range(i + 1, len(xs))
        if abs(xs[j] - xs[i]) > _EPS
    ]
    return statistics.median(slopes) if slopes else None


def compute_trend(
    points: Sequence[TrendPoint],
    *,
    n_bootstrap: int = DEFAULT_BOOTSTRAP_ITERATIONS,
    seed: int = DEFAULT_SEED,
) -> TrendVerdict:
    """Trend verdict for a brand's runs, oldest first (PRD §11.6, DESIGN §6.4)."""
    segment = latest_comparable_segment(points)
    usable = [p for p in segment if p.admissible]
    base = {
        "n_points": len(usable),
        "n_excluded": len(segment) - len(usable),
        "comparability_key": segment[-1].comparability_key if segment else None,
        "first_run_id": usable[0].run_id if usable else None,
        "last_run_id": usable[-1].run_id if usable else None,
    }

    if len(usable) < 2:
        return TrendVerdict(status="insufficient_data", method="none", direction=None, **base)
    if len(usable) < MIN_THEIL_SEN_POINTS:
        return _compare_last_two(usable[-2], usable[-1], base)
    return _theil_sen_verdict(usable, base, n_bootstrap=n_bootstrap, seed=seed)


def _compare_last_two(prev: TrendPoint, last: TrendPoint, base: dict) -> TrendVerdict:
    """Two-run comparison by CI overlap (PRD §11.6). Touching CIs count as overlapping."""
    overlap = last.ci_low <= prev.ci_high and prev.ci_low <= last.ci_high
    delta = last.composite_score - prev.composite_score
    if overlap:
        status, direction = "no_change_detected", None
    else:
        status, direction = "change_detected", ("up" if last.ci_low > prev.ci_high else "down")
    return TrendVerdict(
        status=status,
        method="ci_overlap",
        direction=direction,
        previous_score=prev.composite_score,
        previous_ci_low=prev.ci_low,
        previous_ci_high=prev.ci_high,
        latest_score=last.composite_score,
        latest_ci_low=last.ci_low,
        latest_ci_high=last.ci_high,
        delta=delta,
        **base,
    )


def _x_values(points: Sequence[TrendPoint]) -> tuple[list[float], XUnit, float | None]:
    """Days since the first run, or the run index when runs are < 1 day apart (see module doc)."""
    times = [p.completed_at for p in points if p.completed_at is not None]
    if len(times) == len(points):
        days = [(t - times[0]).total_seconds() / _SECONDS_PER_DAY for t in times]
        gaps = [b - a for a, b in pairwise(days)]
        span = days[-1] - days[0]
        if statistics.median(gaps) >= MIN_DAY_SPACING:
            return days, "day", span
        return [float(i) for i in range(len(points))], "run", span
    return [float(i) for i in range(len(points))], "run", None


def _sd_from_ci(p: TrendPoint) -> float:
    return max(0.0, p.ci_high - p.ci_low) / (2 * _Z95)


def _theil_sen_verdict(points: list[TrendPoint], base: dict, *, n_bootstrap: int, seed: int) -> TrendVerdict:
    xs, unit, span = _x_values(points)
    ys = [p.composite_score for p in points]
    sds = [_sd_from_ci(p) for p in points]
    slope = theil_sen_slope(xs, ys)

    rng = random.Random(seed)
    n = len(points)
    boot: list[float] = []
    for _ in range(n_bootstrap):
        idx = [rng.randrange(n) for _ in range(n)]
        # Draw the noise for every resampled point before deciding to skip, so the RNG
        # stream (and hence the result) doesn't depend on which resamples were degenerate.
        ry = [rng.gauss(ys[i], sds[i]) if sds[i] > 0 else ys[i] for i in idx]
        rx = [xs[i] for i in idx]
        if max(rx) - min(rx) <= _EPS:
            continue  # all one x: no slope
        s = theil_sen_slope(rx, ry)
        if s is not None:
            boot.append(s)
    boot.sort()

    if slope is None or not boot:
        ci_low = ci_high = None
        status: TrendStatus = "no_clear_trend"
    else:
        ci_low = _percentile(boot, _CI_LOW_PERCENTILE)
        ci_high = _percentile(boot, _CI_HIGH_PERCENTILE)
        if ci_low > 0:
            status = "improving"
        elif ci_high < 0:
            status = "declining"
        else:
            status = "no_clear_trend"
    direction: Literal["up", "down"] | None = (
        "up" if status == "improving" else "down" if status == "declining" else None
    )

    def per_week(v: float | None) -> float | None:
        return v * 7 if v is not None and unit == "day" else None

    return TrendVerdict(
        status=status,
        method="theil_sen",
        direction=direction,
        x_unit=unit,
        slope=slope,
        slope_ci_low=ci_low,
        slope_ci_high=ci_high,
        slope_per_week=per_week(slope),
        slope_per_week_ci_low=per_week(ci_low),
        slope_per_week_ci_high=per_week(ci_high),
        span_days=span,
        bootstrap_iterations=n_bootstrap,
        valid_resamples=len(boot),
        **base,
    )


def _percentile(sorted_values: list[float], pct: float) -> float:
    """Linear-interpolated percentile of an already-sorted, non-empty list."""
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100) * (len(sorted_values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    frac = rank - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * frac

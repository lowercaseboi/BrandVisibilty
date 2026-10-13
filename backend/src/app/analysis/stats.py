"""Small statistics toolkit for metrics v2 — pure, stdlib only, deterministic.

- `percentile`: linear-interpolated percentile of a sorted list (same rule as Scorer v1).
- `derived_seed`: one reproducible RNG seed per (base seed, run/comparison, statistic), so
  recomputing any single number never depends on what else was computed first.
- `paired_summary`: the paired comparison used for "did it change?" — mean of per-question
  differences with the *wider* of a Student-t interval and a percentile bootstrap. With the
  few questions a brand has (often 4–17), the bootstrap alone undercovers; the t interval
  alone assumes normal differences. Taking the wider of the two is the conservative choice.
- `mde`: minimum detectable effect at 95% confidence / 80% power, 2.80 × sd / √n.
- `verdict`: maps an interval to the plain verdict vocabulary (never causal: "rose after").
"""

from __future__ import annotations

import hashlib
import math
import random
import statistics
from collections.abc import Sequence
from typing import Literal

Verdict = Literal[
    "rose_after",
    "leaning_up",
    "no_detectable_change",
    "leaning_down",
    "fell_after",
    "insufficient_data",
]

Z95 = 1.959964
Z80_POWER = 0.841621
MDE_FACTOR = Z95 + Z80_POWER  # 2.801585: two-sided 5% test, 80% power

MIN_MATCHED_QUESTIONS = 4
MIN_OVERLAP = 0.5

# Student-t quantiles (two-sided 95% -> 0.975, two-sided 80% -> 0.90) by degrees of freedom.
# Above 30 the next lower tabulated df is used, which is slightly conservative.
_T975 = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
    10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110,
    18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
    26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
}
_T90 = {
    1: 3.078, 2: 1.886, 3: 1.638, 4: 1.533, 5: 1.476, 6: 1.440, 7: 1.415, 8: 1.397, 9: 1.383,
    10: 1.372, 11: 1.363, 12: 1.356, 13: 1.350, 14: 1.345, 15: 1.341, 16: 1.337, 17: 1.333,
    18: 1.330, 19: 1.328, 20: 1.325, 21: 1.323, 22: 1.321, 23: 1.319, 24: 1.318, 25: 1.316,
    26: 1.315, 27: 1.314, 28: 1.313, 29: 1.311, 30: 1.310, 40: 1.303, 60: 1.296, 120: 1.289,
}


def t_quantile(df: int, level: Literal[95, 80]) -> float:
    table = _T975 if level == 95 else _T90
    if df < 1:
        return math.inf
    usable = [d for d in table if d <= df]
    return table[max(usable)]


def percentile(sorted_values: Sequence[float], pct: float) -> float:
    """Linear-interpolated percentile of an already-sorted list (0.0 when empty)."""
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100) * (len(sorted_values) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(sorted_values) - 1)
    frac = rank - lower
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * frac


def derived_seed(base_seed: int, basis: str, stat: str) -> int:
    digest = hashlib.sha256(f"{base_seed}|{basis}|{stat}".encode()).hexdigest()
    return int(digest[:16], 16)


def rng_for(base_seed: int, basis: str, stat: str) -> random.Random:
    return random.Random(derived_seed(base_seed, basis, stat))


def mde(sd: float, n: int) -> float | None:
    """Smallest true change a paired comparison of n questions detects 80% of the time."""
    if n < 2:
        return None
    return MDE_FACTOR * sd / math.sqrt(n)


def r6(value: float | None) -> float | None:
    """Round to 6 decimals: stored numbers are identical across platforms and recomputes."""
    return None if value is None else round(value, 6)


def paired_summary(diffs: Sequence[float], rng: random.Random, n_bootstrap: int) -> dict:
    """Mean of per-question differences with 95% and 80% intervals (wider of t and bootstrap)
    and the MDE implied by the observed spread."""
    n = len(diffs)
    if n == 0:
        return {"n": 0, "mean": None, "sd": None, "ci95": None, "ci80": None, "mde": None}
    mean = statistics.fmean(diffs)
    if n < 2:
        return {"n": 1, "mean": r6(mean), "sd": None, "ci95": None, "ci80": None, "mde": None}
    sd = statistics.stdev(diffs)
    se = sd / math.sqrt(n)
    boot = sorted(statistics.fmean(rng.choices(diffs, k=n)) for _ in range(n_bootstrap))

    def interval(level: Literal[95, 80]) -> list[float]:
        t = t_quantile(n - 1, level) * se
        tail = (100 - level) / 2
        lo = min(mean - t, percentile(boot, tail))
        hi = max(mean + t, percentile(boot, 100 - tail))
        return [r6(lo), r6(hi)]

    return {
        "n": n,
        "mean": r6(mean),
        "sd": r6(sd),
        "ci95": interval(95),
        "ci80": interval(80),
        "mde": r6(mde(sd, n)),
    }


def verdict(summary: dict, *, overlap: float) -> Verdict:
    """Plain verdict for a paired comparison. Wording is deliberately non-causal."""
    if summary.get("n", 0) < MIN_MATCHED_QUESTIONS or overlap < MIN_OVERLAP or not summary.get("ci95"):
        return "insufficient_data"
    lo95, hi95 = summary["ci95"]
    lo80, hi80 = summary["ci80"]
    if lo95 > 0:
        return "rose_after"
    if hi95 < 0:
        return "fell_after"
    if lo80 > 0:
        return "leaning_up"
    if hi80 < 0:
        return "leaning_down"
    return "no_detectable_change"

"""AC-12 detector validation: precision/recall/F1 against human-labelled ground truth, and
inter-annotator agreement (Cohen's kappa) between two human annotators (PRD §11.7, §17 AC-12).

Pure functions only — no I/O, no LLM calls, same purity requirement as Scorer and GapDetector
(DESIGN §1.6, §4). `backend/scripts/validate_detector.py` does the I/O (sampling stored
observations, reading/writing the labelling sheet) and calls the real, deterministic
MentionDetector read-only; this module only turns already-collected boolean labels into
metrics.

AC-12 exists because the mention detector is *deterministic*, not because it is *accurate*:
determinism means the same input always produces the same output, which makes the detector
testable and auditable, but says nothing about whether that output matches human judgment of
what counts as a "mention". That gap is measured here.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


def _check_equal_length(name_a: str, a: Sequence[object], name_b: str, b: Sequence[object]) -> None:
    if len(a) != len(b):
        raise ValueError(f"{name_a} and {name_b} must be the same length ({len(a)} != {len(b)})")


# ---------------------------------------------------------------------------
# Precision / recall / F1
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PrecisionRecallF1:
    """Confusion-matrix metrics for one boolean detector output vs. one boolean gold label."""

    true_positive: int
    false_positive: int
    false_negative: int
    true_negative: int
    precision: float  # tp / (tp + fp); 0.0 by convention when the detector predicted True zero times
    recall: float  # tp / (tp + fn); 0.0 by convention when there are zero gold-positive cases
    f1: float  # harmonic mean of precision and recall; 0.0 by convention when both are 0
    support: int  # total number of labelled pairs (tp + fp + fn + tn)


def precision_recall_f1(predicted: Sequence[bool], gold: Sequence[bool]) -> PrecisionRecallF1:
    """`predicted` is the detector's verdict, `gold` the human-adjudicated ground truth, both
    aligned by index (same row order). Raises `ValueError` if the sequences differ in length or
    are empty — there is nothing to score."""
    _check_equal_length("predicted", predicted, "gold", gold)
    if not predicted:
        raise ValueError("precision_recall_f1 needs at least one labelled pair")

    tp = sum(1 for p, g in zip(predicted, gold, strict=True) if p and g)
    fp = sum(1 for p, g in zip(predicted, gold, strict=True) if p and not g)
    fn = sum(1 for p, g in zip(predicted, gold, strict=True) if not p and g)
    tn = sum(1 for p, g in zip(predicted, gold, strict=True) if not p and not g)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return PrecisionRecallF1(
        true_positive=tp,
        false_positive=fp,
        false_negative=fn,
        true_negative=tn,
        precision=precision,
        recall=recall,
        f1=f1,
        support=len(predicted),
    )


# ---------------------------------------------------------------------------
# Cohen's kappa
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CohensKappa:
    """Inter-annotator agreement between two annotators' boolean labels on the same items."""

    kappa: float
    observed_agreement: float  # po: fraction of items where the two annotators agreed
    expected_agreement: float  # pe: agreement expected from each annotator's own marginal rate
    n: int
    # True when pe == 1 (both annotators used exactly one label for every item, so po == pe == 1
    # and (po - pe) / (1 - pe) is the indeterminate 0/0). See `cohens_kappa` docstring.
    degenerate: bool


def cohens_kappa(labels_a: Sequence[bool], labels_b: Sequence[bool]) -> CohensKappa:
    """Cohen's (1960) kappa: kappa = (po - pe) / (1 - pe), for two annotators' boolean labels
    over the same n items, aligned by index.

    Degenerate case: if both annotators assigned the *same single label to every item* (e.g. both
    always said "mentioned"), there is no disagreement, and also no possibility of any that could
    be attributed to chance either, so `1 - pe` is 0 and the ratio is undefined (0/0). By
    convention this function reports that as perfect agreement (`kappa = 1.0`, `degenerate=True`)
    rather than raising or returning NaN, since callers (the validation report) should treat "both
    annotators agreed on everything, trivially" as the best possible outcome, while still being
    able to detect and flag the degeneracy via the `degenerate` field.
    """
    _check_equal_length("labels_a", labels_a, "labels_b", labels_b)
    n = len(labels_a)
    if n == 0:
        raise ValueError("cohens_kappa needs at least one labelled pair")

    po = sum(1 for a, b in zip(labels_a, labels_b, strict=True) if a == b) / n
    p_a_yes = sum(labels_a) / n
    p_b_yes = sum(labels_b) / n
    pe = p_a_yes * p_b_yes + (1 - p_a_yes) * (1 - p_b_yes)

    if math.isclose(pe, 1.0, abs_tol=1e-12):
        return CohensKappa(kappa=1.0, observed_agreement=po, expected_agreement=pe, n=n, degenerate=True)

    kappa = (po - pe) / (1 - pe)
    return CohensKappa(kappa=kappa, observed_agreement=po, expected_agreement=pe, n=n, degenerate=False)


# Landis & Koch (1977) interpretation bands: (upper bound of the band, label).
_KAPPA_BANDS: tuple[tuple[float, str], ...] = (
    (0.20, "slight"),
    (0.40, "fair"),
    (0.60, "moderate"),
    (0.80, "substantial"),
    (1.00, "almost perfect"),
)


def kappa_band(kappa: float) -> str:
    """Landis & Koch (1977) qualitative band for a kappa value: <0 "poor", 0-.20 "slight",
    .21-.40 "fair", .41-.60 "moderate", .61-.80 "substantial", .81-1.00 "almost perfect"."""
    if kappa < 0:
        return "poor"
    for upper_bound, label in _KAPPA_BANDS:
        if kappa <= upper_bound or math.isclose(kappa, upper_bound, abs_tol=1e-12):
            return label
    return "almost perfect"  # kappa > 1.0 shouldn't happen, but don't crash on it


# ---------------------------------------------------------------------------
# Consensus labels
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ConsensusLabels:
    """Per-item consensus of two annotators' boolean labels. Where they agree, `labels[i]` is
    that shared value; where they disagree, `labels[i]` is `None` and the item's index is listed
    in `disagreement_indices` so it can be routed to a third, adjudicating read."""

    labels: tuple[bool | None, ...]
    agreement_count: int
    disagreement_indices: tuple[int, ...]

    @property
    def disagreement_count(self) -> int:
        return len(self.disagreement_indices)


def consensus_labels(labels_a: Sequence[bool], labels_b: Sequence[bool]) -> ConsensusLabels:
    """Build the consensus label sequence for two annotators' boolean labels, aligned by index."""
    _check_equal_length("labels_a", labels_a, "labels_b", labels_b)
    if not labels_a:
        raise ValueError("consensus_labels needs at least one labelled pair")

    labels: list[bool | None] = []
    disagreements: list[int] = []
    for i, (a, b) in enumerate(zip(labels_a, labels_b, strict=True)):
        if a == b:
            labels.append(a)
        else:
            labels.append(None)
            disagreements.append(i)

    return ConsensusLabels(
        labels=tuple(labels),
        agreement_count=len(labels_a) - len(disagreements),
        disagreement_indices=tuple(disagreements),
    )

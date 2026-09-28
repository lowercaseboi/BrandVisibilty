import math

import pytest

from app.analysis.validation import (
    CohensKappa,
    ConsensusLabels,
    PrecisionRecallF1,
    cohens_kappa,
    consensus_labels,
    kappa_band,
    precision_recall_f1,
)

# ---------------------------------------------------------------------------
# precision_recall_f1
# ---------------------------------------------------------------------------


def test_precision_recall_f1_hand_computed():
    # tp=2 (i0, i4), fp=1 (i2), fn=1 (i3), tn=1 (i1)
    predicted = [True, False, True, False, True]
    gold = [True, False, False, True, True]
    result = precision_recall_f1(predicted, gold)
    assert result == PrecisionRecallF1(
        true_positive=2,
        false_positive=1,
        false_negative=1,
        true_negative=1,
        precision=pytest.approx(2 / 3),
        recall=pytest.approx(2 / 3),
        f1=pytest.approx(2 / 3),
        support=5,
    )


def test_precision_recall_f1_perfect_detector():
    predicted = [True, False, True, True, False]
    gold = [True, False, True, True, False]
    result = precision_recall_f1(predicted, gold)
    assert result.precision == 1.0
    assert result.recall == 1.0
    assert result.f1 == 1.0
    assert result.support == 5


def test_precision_recall_f1_no_predicted_positives_is_zero_precision_by_convention():
    predicted = [False, False, False]
    gold = [True, False, True]
    result = precision_recall_f1(predicted, gold)
    assert result.true_positive == 0
    assert result.false_positive == 0
    assert result.precision == 0.0
    assert result.recall == 0.0
    assert result.f1 == 0.0


def test_precision_recall_f1_no_gold_positives_is_zero_recall_by_convention():
    predicted = [True, False, False]
    gold = [False, False, False]
    result = precision_recall_f1(predicted, gold)
    assert result.false_negative == 0
    assert result.recall == 0.0
    assert result.precision == 0.0  # the one True prediction was a false positive


def test_precision_recall_f1_rejects_mismatched_length():
    with pytest.raises(ValueError, match="same length"):
        precision_recall_f1([True, False], [True])


def test_precision_recall_f1_rejects_empty_input():
    with pytest.raises(ValueError):
        precision_recall_f1([], [])


# ---------------------------------------------------------------------------
# cohens_kappa
# ---------------------------------------------------------------------------


def _expand(both_yes: int, a_yes_b_no: int, a_no_b_yes: int, both_no: int) -> tuple[list[bool], list[bool]]:
    a = [True] * both_yes + [True] * a_yes_b_no + [False] * a_no_b_yes + [False] * both_no
    b = [True] * both_yes + [False] * a_yes_b_no + [True] * a_no_b_yes + [False] * both_no
    return a, b


def test_cohens_kappa_textbook_example():
    # Classic 2x2 example: both Yes=20, A-only=5, B-only=10, both No=15 (n=50).
    # po = (20+15)/50 = 0.70
    # p(A=yes) = 25/50 = 0.5, p(B=yes) = 30/50 = 0.6
    # pe = 0.5*0.6 + 0.5*0.4 = 0.30 + 0.20 = 0.50
    # kappa = (0.70 - 0.50) / (1 - 0.50) = 0.40
    labels_a, labels_b = _expand(both_yes=20, a_yes_b_no=5, a_no_b_yes=10, both_no=15)
    result = cohens_kappa(labels_a, labels_b)
    assert result.n == 50
    assert result.observed_agreement == pytest.approx(0.70)
    assert result.expected_agreement == pytest.approx(0.50)
    assert result.kappa == pytest.approx(0.40)
    assert result.degenerate is False
    assert kappa_band(result.kappa) == "fair"  # 0.21-0.40


def test_cohens_kappa_perfect_agreement_nontrivial():
    labels_a = [True, False, True, False, True, False]
    labels_b = [True, False, True, False, True, False]
    result = cohens_kappa(labels_a, labels_b)
    assert result.observed_agreement == 1.0
    assert result.kappa == pytest.approx(1.0)
    assert result.degenerate is False


def test_cohens_kappa_degenerate_when_pe_is_one():
    # Both annotators label every single item True: po == pe == 1, kappa defined as 1.0.
    labels_a = [True] * 8
    labels_b = [True] * 8
    result = cohens_kappa(labels_a, labels_b)
    assert result.observed_agreement == 1.0
    assert result.expected_agreement == pytest.approx(1.0)
    assert result.kappa == 1.0
    assert result.degenerate is True


def test_cohens_kappa_degenerate_when_both_always_false():
    labels_a = [False] * 6
    labels_b = [False] * 6
    result = cohens_kappa(labels_a, labels_b)
    assert result.degenerate is True
    assert result.kappa == 1.0


def test_cohens_kappa_chance_level_agreement_is_near_zero():
    # Independent-looking 50/50 split with agreement matching what chance alone would predict.
    labels_a, labels_b = _expand(both_yes=25, a_yes_b_no=25, a_no_b_yes=25, both_no=25)
    result = cohens_kappa(labels_a, labels_b)
    assert result.observed_agreement == pytest.approx(0.5)
    assert result.expected_agreement == pytest.approx(0.5)
    assert result.kappa == pytest.approx(0.0)


def test_cohens_kappa_rejects_mismatched_length():
    with pytest.raises(ValueError, match="same length"):
        cohens_kappa([True], [True, False])


def test_cohens_kappa_rejects_empty_input():
    with pytest.raises(ValueError):
        cohens_kappa([], [])


@pytest.mark.parametrize(
    ("kappa", "band"),
    [
        (-0.5, "poor"),
        (-0.0001, "poor"),
        (0.0, "slight"),
        (0.20, "slight"),
        (0.21, "fair"),
        (0.40, "fair"),
        (0.41, "moderate"),
        (0.60, "moderate"),
        (0.61, "substantial"),
        (0.80, "substantial"),
        (0.81, "almost perfect"),
        (1.0, "almost perfect"),
    ],
)
def test_kappa_band_boundaries(kappa, band):
    assert kappa_band(kappa) == band


# ---------------------------------------------------------------------------
# consensus_labels
# ---------------------------------------------------------------------------


def test_consensus_labels_agreements_and_disagreements():
    labels_a = [True, False, True, False]
    labels_b = [True, False, False, True]
    result = consensus_labels(labels_a, labels_b)
    assert result == ConsensusLabels(
        labels=(True, False, None, None),
        agreement_count=2,
        disagreement_indices=(2, 3),
    )
    assert result.disagreement_count == 2


def test_consensus_labels_full_agreement():
    labels_a = [True, True, False]
    labels_b = [True, True, False]
    result = consensus_labels(labels_a, labels_b)
    assert result.labels == (True, True, False)
    assert result.agreement_count == 3
    assert result.disagreement_indices == ()
    assert result.disagreement_count == 0


def test_consensus_labels_rejects_mismatched_length():
    with pytest.raises(ValueError, match="same length"):
        consensus_labels([True], [True, False])


def test_consensus_labels_rejects_empty_input():
    with pytest.raises(ValueError):
        consensus_labels([], [])


def test_dataclasses_are_frozen():
    with pytest.raises((AttributeError, TypeError)):
        precision_recall_f1([True], [True]).precision = 0.0  # type: ignore[misc]
    with pytest.raises((AttributeError, TypeError)):
        cohens_kappa([True, False], [True, False]).kappa = 0.0  # type: ignore[misc]
    with pytest.raises((AttributeError, TypeError)):
        consensus_labels([True], [True]).agreement_count = 0  # type: ignore[misc]


def test_kappa_matches_math_isnan_never_for_normal_cases():
    labels_a, labels_b = _expand(both_yes=10, a_yes_b_no=2, a_no_b_yes=3, both_no=5)
    result = cohens_kappa(labels_a, labels_b)
    assert not math.isnan(result.kappa)

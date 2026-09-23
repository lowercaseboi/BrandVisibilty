from __future__ import annotations

from app.analysis.types import Gap
from app.recommendation.identity import gap_id, recommendation_id

GAP_A = Gap(gap_type="presence", evidence_refs=("o1", "o2"), detail={"scope": "overall", "coverage": 0.0})
GAP_B = Gap(gap_type="presence", evidence_refs=("o1", "o2"), detail={"scope": "overall", "coverage": 0.1})


def test_gap_id_is_deterministic():
    assert gap_id(GAP_A) == gap_id(GAP_A)


def test_gap_id_differs_for_different_detail():
    assert gap_id(GAP_A) != gap_id(GAP_B)


def test_recommendation_id_is_deterministic():
    a = recommendation_id("gap_x", "Submit to directory", ("o1", "o2"))
    b = recommendation_id("gap_x", "Submit to directory", ("o1", "o2"))
    assert a == b


def test_recommendation_id_differs_for_different_action():
    a = recommendation_id("gap_x", "Submit to directory", ("o1", "o2"))
    b = recommendation_id("gap_x", "Publish FAQ", ("o1", "o2"))
    assert a != b

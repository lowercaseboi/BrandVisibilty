from app.analysis.gap_detector import detect_gaps
from app.analysis.types import EntityMention, Gap, Observation
from app.recommendation.engine import (
    ACTION_CLASS,
    ACTION_VOCABULARY,
    Recommendation,
    recommend,
    validation_gate,
)

SELF = "self"
COMP = "comp-a"
COMPS = frozenset({COMP})
NAMES = {SELF: "Gajanan Vada Pav", COMP: "Ashok Vada Pav"}


def _obs(i, provider, intent, mentions):
    return Observation(f"{provider}:q{i}-s1", f"q{i}", provider, tuple(mentions), intent)


def _observations():
    obs = []
    # gemini: brand absent everywhere; comp present -> presence gaps (overall-ish, provider, intent)
    for i in range(10):
        obs.append(_obs(i, "gemini", "local_contextual" if i < 5 else "problem_first",
                        [EntityMention(COMP, "competitor", 1)]))
    # groq: brand present but always behind the competitor at a poor rank -> prominence + competitive
    for i in range(10):
        obs.append(_obs(i, "groq", "category_discovery",
                        [EntityMention(COMP, "competitor", 1), EntityMention("x", "discovered", 2),
                         EntityMention("y", "discovered", 3), EntityMention(SELF, "self", 4)]))
    return obs


def _run(max_recommendations=10):
    observations = _observations()
    gaps = detect_gaps(observations, SELF, COMPS)
    recs = recommend(gaps, observations, SELF, COMPS, entity_names=NAMES,
                     max_recommendations=max_recommendations)
    return gaps, observations, recs


def test_every_recommendation_traces_to_an_existing_gap_and_real_evidence():
    gaps, observations, recs = _run()
    assert recs
    gap_ids = {g.gap_id for g in gaps}
    obs_ids = {o.observation_id for o in observations}
    for rec in recs:
        assert rec.gap_id and rec.gap_id in gap_ids
        assert rec.evidence_refs and set(rec.evidence_refs) <= obs_ids
        assert rec.recommendation_id.startswith("rec-")


def test_sorted_by_priority_with_non_negative_delta_and_capped():
    _, _, recs = _run(max_recommendations=3)
    assert len(recs) <= 3
    priorities = [r.priority for r in recs]
    assert priorities == sorted(priorities, reverse=True)
    assert all(r.delta_composite >= 0 for r in recs)
    assert any(r.delta_composite > 0 for r in recs)
    assert all(0.2 <= r.confidence <= 1 for r in recs)


def test_vocabulary_is_closed_and_gate_rejects_free_text_actions_and_orphans():
    gaps, observations, recs = _run()
    assert all(r.action in ACTION_VOCABULARY and r.action_class == ACTION_CLASS[r.action] for r in recs)
    good = recs[0]
    bogus = Recommendation("rec-x", good.gap_id, "run_a_tv_ad", "content", 9.9, 1.0, 1.0, 1, "", good.evidence_refs)
    orphan = Recommendation("rec-y", "gap-doesnotexist", "faq_page", "content", 9.9, 1.0, 1.0, 3, "", good.evidence_refs)
    fabricated = Recommendation("rec-z", good.gap_id, "faq_page", "content", 9.9, 1.0, 1.0, 3, "", ("made-up-id",))
    assert validation_gate([bogus, orphan, fabricated, good], gaps, observations, 10) == [good]


def test_gap_id_and_output_are_deterministic_and_reasoning_is_readable():
    g1 = Gap("presence", ("a",), {"scope": "intent", "intent_type": "local_contextual", "coverage": 0.0})
    g2 = Gap("presence", ("b", "c"), {"scope": "intent", "intent_type": "local_contextual", "coverage": 0.05})
    assert g1.gap_id == g2.gap_id and g1.gap_id.startswith("gap-")
    _, _, recs_a = _run()
    _, _, recs_b = _run()
    assert recs_a == recs_b
    competitive = [r for r in recs_a if r.action == "comparison_page"]
    assert any("Ashok Vada Pav" in r.reasoning for r in competitive)
    assert all("Gajanan Vada Pav" in r.reasoning for r in recs_a)

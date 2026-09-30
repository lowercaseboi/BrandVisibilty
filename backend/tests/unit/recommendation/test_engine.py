"""Recommendation engine: the gap × action matrix, counterfactual closures, the validation gate
(AC-7, closed vocabulary, evidence, cap disclosure), ranking, confidence and reasoning keys."""

import random
from dataclasses import replace

import pytest

from app.analysis.gap_detector import detect_gaps
from app.analysis.types import EntityMention, Gap, Observation
from app.recommendation import engine
from app.recommendation.engine import (
    ACTION_CLASS,
    ACTION_EFFORT,
    ACTION_VOCABULARY,
    GateResult,
    Recommendation,
    actions_for_gap,
    recommend,
    recommend_detailed,
    validation_gate,
)
from app.recommendation.reasoning import TEMPLATES, render_reasoning

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


OBS = _observations()
GEMINI = tuple(o.observation_id for o in OBS if o.provider_id == "gemini")
GROQ = tuple(o.observation_id for o in OBS if o.provider_id == "groq")


def _run(max_recommendations=10):
    observations = _observations()
    gaps = detect_gaps(observations, SELF, COMPS)
    recs = recommend(gaps, observations, SELF, COMPS, entity_names=NAMES,
                     max_recommendations=max_recommendations)
    return gaps, observations, recs


def _rec(rec_id="rec-x", gap_id="gap-x", action="faq_page", priority=1.0, delta=1.0, confidence=1.0, refs=("r",), **kw):
    return Recommendation(rec_id, gap_id, action, kw.pop("action_class", ACTION_CLASS.get(action, "content")),
                          priority, delta, confidence, kw.pop("effort", ACTION_EFFORT.get(action, 3)), "", tuple(refs), **kw)


# --------------------------------------------------------------------------- gap × action matrix

def _presence(scope, **detail):
    return Gap("presence", GEMINI, {"scope": scope, "coverage": 0.0, **detail})


MATRIX = [
    ("presence/overall", Gap("presence", GEMINI + GROQ, {"scope": "overall", "coverage": 0.05}),
     ("submit_to_directory", "pitch_listicle")),
    ("presence/provider", _presence("provider", provider_id="gemini"), ("seek_review_coverage", "submit_to_directory")),
    ("presence/category_discovery", _presence("intent", intent_type="category_discovery"),
     ("pitch_listicle", "use_case_page")),
    ("presence/problem_first", _presence("intent", intent_type="problem_first"), ("faq_page", "video")),
    ("presence/alternative_seeking", _presence("intent", intent_type="alternative_seeking"), ("comparison_page",)),
    ("presence/attribute_constrained", _presence("intent", intent_type="attribute_constrained"),
     ("add_attribute_claim", "use_case_page")),
    ("presence/local_contextual", _presence("intent", intent_type="local_contextual"),
     ("submit_to_directory", "seek_review_coverage")),
    ("presence/recommendation_seeking", _presence("intent", intent_type="recommendation_seeking"),
     ("community_answer", "seek_review_coverage")),
    ("presence/custom intent", _presence("intent", intent_type="custom"), ("use_case_page", "faq_page")),
    ("presence/no scope", Gap("presence", GEMINI, {"coverage": 0.0}), ("submit_to_directory",)),
    ("prominence", Gap("prominence", GROQ, {"coverage": 0.5, "mean_rank": 4.0}), ("add_attribute_claim", "comparison_page")),
    ("competitive", Gap("competitive", GROQ, {"competitor_id": COMP, "co_occurrence_rate": 0.5, "beat_rate": 1.0}),
     ("comparison_page",)),
    ("representation/outdated+conflicting",
     Gap("representation", ("p1", "p2"), {"disagreement_rate": 0.6, "disagree_with_each_other": True}),
     ("correct_outdated_description", "clarify_category_descriptor")),
    ("representation/outdated", Gap("representation", ("p1",), {"disagreement_rate": 0.6, "disagree_with_each_other": False}),
     ("correct_outdated_description",)),
    ("representation/conflicting only",
     Gap("representation", ("p1",), {"disagreement_rate": 0.0, "disagree_with_each_other": True}),
     ("clarify_category_descriptor",)),
    ("representation/neither", Gap("representation", ("p1",), {}), ("clarify_category_descriptor",)),
    ("source", Gap("source", ("src-1", "src-2", "src-3"), {"dominant_source_count": 5, "non_mentioning_count": 3}),
     ("pitch_listicle", "seek_review_coverage")),
]
SCORED = {"presence", "prominence", "competitive"}


@pytest.mark.parametrize("gap,expected", [(g, e) for _, g, e in MATRIX], ids=[n for n, _, _ in MATRIX])
def test_matrix_row_yields_exactly_its_actions_end_to_end(gap, expected):
    assert actions_for_gap(gap) == expected
    assert len(expected) <= 2 and set(expected) <= ACTION_VOCABULARY

    result = recommend_detailed([gap], OBS, SELF, COMPS, entity_names=NAMES)
    assert result.rejected == 0 and result.dropped == 0
    assert sorted(r.action for r in result.passed) == sorted(expected)
    deltas = {r.delta_composite for r in result.passed}
    assert len(deltas) == 1  # every action for a gap is ranked by the same counterfactual delta
    for rec in result.passed:
        assert rec.gap_id == gap.gap_id  # AC-7
        assert rec.action_class == ACTION_CLASS[rec.action] and rec.effort == ACTION_EFFORT[rec.action]
        assert rec.evidence_refs == gap.evidence_refs and rec.evidence_count == len(gap.evidence_refs)
        assert rec.priority == round(rec.delta_composite * rec.confidence / rec.effort, 3)
        assert rec.reasoning_key in TEMPLATES
        assert render_reasoning(rec.reasoning_key, rec.reasoning_params) == rec.reasoning
        if gap.gap_type in SCORED:
            assert rec.delta_composite > 0
            assert rec.reasoning_params["assumption_key"] == f"assumption.{gap.gap_type}"
        else:  # not in the score model: nothing simulated, flagged as unscored
            assert rec.delta_composite == 0 and rec.priority == 0
            assert rec.reasoning_params["assumption_key"] == "assumption.unscored"


def test_unknown_gap_type_gets_no_action_and_no_recommendation():
    gap = Gap("mystery", GEMINI, {})  # type: ignore[arg-type]
    assert actions_for_gap(gap) == ()
    assert recommend_detailed([gap], OBS, SELF, COMPS) == GateResult([], 0, 0)


def test_every_vocabulary_action_is_reachable_from_the_matrix():
    reachable = {a for _, g, _ in MATRIX for a in actions_for_gap(g)}
    assert reachable == ACTION_VOCABULARY


# --------------------------------------------------------------------------- video

def test_video_is_recommended_for_how_to_questions_from_real_detection():
    gaps, _, recs = _run(max_recommendations=50)
    problem = next(g for g in gaps if g.detail.get("intent_type") == "problem_first")
    by_action = {r.action: r for r in recs if r.gap_id == problem.gap_id}
    assert set(by_action) == {"faq_page", "video"}
    video, faq = by_action["video"], by_action["faq_page"]
    assert video.action_class == "content" and video.effort == ACTION_EFFORT["video"]
    assert video.delta_composite == faq.delta_composite > 0
    assert video.priority == round(video.delta_composite * video.confidence / video.effort, 3)
    assert video.reasoning_params["action_key"] == "action.video"
    assert "produce a short video" in video.reasoning


def test_video_only_for_how_to_intents():
    for _, gap, _ in MATRIX:
        if "video" in actions_for_gap(gap):
            assert gap.gap_type == "presence" and gap.detail.get("intent_type") == "problem_first"


# --------------------------------------------------------------------------- traceability, ranking, cap

def test_every_recommendation_traces_to_an_existing_gap_and_real_evidence():
    gaps, observations, recs = _run()
    assert recs
    gap_ids = {g.gap_id for g in gaps}
    obs_ids = {o.observation_id for o in observations}
    for rec in recs:
        assert rec.gap_id and rec.gap_id in gap_ids
        assert rec.evidence_refs and set(rec.evidence_refs) <= obs_ids
        assert rec.recommendation_id.startswith("rec-")
    assert len({r.recommendation_id for r in recs}) == len(recs)


def test_sorted_by_priority_with_non_negative_delta():
    _, _, recs = _run()
    priorities = [r.priority for r in recs]
    assert priorities == sorted(priorities, reverse=True)
    assert all(r.delta_composite >= 0 for r in recs)
    assert any(r.delta_composite > 0 for r in recs)
    assert all(0.2 <= r.confidence <= 1 for r in recs)


def test_cap_is_disclosed():
    observations = _observations()
    gaps = detect_gaps(observations, SELF, COMPS)
    full = recommend_detailed(gaps, observations, SELF, COMPS, entity_names=NAMES, max_recommendations=100)
    assert full.dropped == 0 and full.total == len(full.passed) > 3
    capped = recommend_detailed(gaps, observations, SELF, COMPS, entity_names=NAMES, max_recommendations=3)
    assert len(capped.passed) == 3
    assert capped.dropped == full.total - 3 and capped.total == full.total
    assert capped.passed == full.passed[:3]  # the cap keeps the top of the same ranking
    assert recommend(gaps, observations, SELF, COMPS, entity_names=NAMES, max_recommendations=3) == capped.passed
    none = recommend_detailed(gaps, observations, SELF, COMPS, max_recommendations=0)
    assert none.passed == [] and none.dropped == full.total
    assert recommend_detailed(gaps, observations, SELF, COMPS, max_recommendations=-5).passed == []


def test_default_cap_is_ten():
    gaps = [g for _, g, _ in MATRIX]
    result = recommend_detailed(gaps, OBS, SELF, COMPS, entity_names=NAMES)
    assert len(result.passed) == 10 and result.total > 10 and result.dropped == result.total - 10


def test_output_is_deterministic_and_independent_of_input_order():
    gaps = [g for _, g, _ in MATRIX]
    first = recommend_detailed(gaps, OBS, SELF, COMPS, entity_names=NAMES, max_recommendations=100)
    shuffled_gaps = gaps[:]
    random.Random(7).shuffle(shuffled_gaps)
    shuffled_obs = OBS[:]
    random.Random(8).shuffle(shuffled_obs)
    second = recommend_detailed(shuffled_gaps, shuffled_obs, SELF, COMPS, entity_names=NAMES, max_recommendations=100)
    assert first == second
    # the gate on its own: any candidate order gives the same ranking
    candidates = list(first.passed)
    random.Random(9).shuffle(candidates)
    assert validation_gate(candidates, gaps, OBS, 100).passed == first.passed


def test_ties_break_on_evidence_then_effort_then_id():
    gap = Gap("presence", ("r",), {"scope": "overall"})
    recs = [
        _rec("rec-b", gap.gap_id, "faq_page", priority=0, delta=0, confidence=0.5),
        _rec("rec-a", gap.gap_id, "faq_page", priority=0, delta=0, confidence=0.5),
        _rec("rec-c", gap.gap_id, "submit_to_directory", priority=0, delta=0, confidence=0.5),
        _rec("rec-d", gap.gap_id, "clarify_category_descriptor", priority=0, delta=0, confidence=0.9,
             action_class="messaging"),
        _rec("rec-e", gap.gap_id, "faq_page", priority=0.1, delta=1, confidence=0.2),
    ]
    obs = [Observation("r", "q0", "p")]
    order = [r.recommendation_id for r in validation_gate(recs, [gap], obs, 10).passed]
    assert order == ["rec-e", "rec-d", "rec-c", "rec-a", "rec-b"]


def test_zero_delta_recommendations_rank_after_scored_ones_and_by_evidence():
    strong_source = Gap("source", tuple(f"src-{i}" for i in range(12)), {"dominant_source_count": 12, "non_mentioning_count": 12})
    weak_rep = Gap("representation", ("p1",), {"disagreement_rate": 0.6})
    scored = next(g for n, g, _ in MATRIX if n == "competitive")
    result = recommend_detailed([weak_rep, strong_source, scored], OBS, SELF, COMPS, entity_names=NAMES)
    kinds = [r.gap_id for r in result.passed]
    assert kinds[0] == scored.gap_id  # the only scored gap
    zero = result.passed[1:]
    assert all(r.delta_composite == 0 and r.priority == 0 for r in zero)
    assert [r.gap_id for r in zero] == [strong_source.gap_id] * 2 + [weak_rep.gap_id]
    assert zero[0].confidence == 1.0 and zero[-1].confidence == 0.2


def test_scored_gap_whose_simulation_changes_nothing_has_zero_delta():
    # Every evidence observation already mentions the brand at rank 1: nothing to promote.
    obs = [_obs(i, "groq", "x", [EntityMention(SELF, "self", 1)]) for i in range(3)]
    gap = Gap("prominence", tuple(o.observation_id for o in obs), {"coverage": 1.0, "mean_rank": 1.0})
    (rec, _) = recommend([gap], obs, SELF, frozenset())
    assert rec.delta_composite == 0 and rec.priority == 0
    assert rec.reasoning_params["assumption_key"] == "assumption.prominence"
    assert rec.reasoning_params["changed_count"] == 0 and rec.reasoning_params["delta"] == "0.0"


# --------------------------------------------------------------------------- confidence / evidence_count

@pytest.mark.parametrize("n,expected", [(1, 0.2), (2, 0.2), (3, 0.3), (7, 0.7), (10, 1.0), (25, 1.0)])
def test_confidence_and_evidence_count(n, expected):
    obs = [_obs(i, "gemini", "local_contextual", []) for i in range(n)]
    gap = Gap("presence", tuple(o.observation_id for o in obs), {"scope": "intent", "intent_type": "local_contextual",
                                                                "coverage": 0.0})
    recs = recommend([gap], obs, SELF, frozenset(), entity_names=NAMES)
    assert recs and all(r.confidence == expected and r.evidence_count == n for r in recs)
    assert all(r.reasoning_params["evidence_count"] == n for r in recs)


# --------------------------------------------------------------------------- validation gate

def test_gate_rejects_free_text_actions_orphans_and_fabricated_evidence():
    gaps, observations, recs = _run()
    assert all(r.action in ACTION_VOCABULARY and r.action_class == ACTION_CLASS[r.action] for r in recs)
    good = recs[0]
    bogus = Recommendation("rec-x", good.gap_id, "run_a_tv_ad", "content", 9.9, 1.0, 1.0, 1, "", good.evidence_refs)
    wrong_class = Recommendation("rec-w", good.gap_id, "faq_page", "distribution", 9.9, 1.0, 1.0, 3, "", good.evidence_refs)
    orphan = Recommendation("rec-y", "gap-doesnotexist", "faq_page", "content", 9.9, 1.0, 1.0, 3, "", good.evidence_refs)
    no_gap = Recommendation("rec-v", "", "faq_page", "content", 9.9, 1.0, 1.0, 3, "", good.evidence_refs)  # AC-7
    fabricated = Recommendation("rec-z", good.gap_id, "faq_page", "content", 9.9, 1.0, 1.0, 3, "", ("made-up-id",))
    no_refs = Recommendation("rec-u", good.gap_id, "faq_page", "content", 9.9, 1.0, 1.0, 3, "", ())
    result = validation_gate([bogus, wrong_class, orphan, no_gap, fabricated, no_refs, good], gaps, observations, 10)
    assert result == GateResult([good], 0, 6)


def test_gate_trims_unresolved_refs_and_only_trusts_external_refs_for_external_gap_types():
    presence = Gap("presence", GEMINI, {"scope": "overall"})
    source = Gap("source", ("src-1",), {})
    partial = _rec("rec-p", presence.gap_id, refs=(GEMINI[0], "ghost"))
    borrowed = _rec("rec-b", presence.gap_id, refs=("src-1",))  # a web source is not presence evidence
    web = _rec("rec-s", source.gap_id, "pitch_listicle", refs=("src-1", "ghost"))
    result = validation_gate([partial, borrowed, web], [presence, source], OBS, 10)
    assert {r.recommendation_id: r.evidence_refs for r in result.passed} == {"rec-p": (GEMINI[0],), "rec-s": ("src-1",)}
    assert result.rejected == 1


def test_gate_keeps_one_recommendation_per_id():
    gap = next(g for n, g, _ in MATRIX if n == "competitive")
    # the same gap twice (e.g. a caller concatenating two gap lists) must not produce two cards
    result = recommend_detailed([gap, gap], OBS, SELF, COMPS, entity_names=NAMES)
    assert [r.action for r in result.passed] == ["comparison_page"]
    assert result.rejected == 1 and result.total == 1
    low, high = _rec("rec-1", gap.gap_id, refs=GROQ, priority=0.1), _rec("rec-1", gap.gap_id, refs=GROQ, priority=5.0)
    assert validation_gate([low, high], [gap], OBS, 10).passed == [high]


# --------------------------------------------------------------------------- brands with little or no data

def test_brand_without_competitors():
    obs = [_obs(i, "gemini", "alternative_seeking", []) for i in range(4)]
    gaps = detect_gaps(obs, SELF, frozenset())
    result = recommend_detailed(gaps, obs, SELF, frozenset(), entity_names={SELF: "Solo"})
    assert result.passed and all(r.gap_id for r in result.passed)
    assert not any(g.gap_type == "competitive" for g in gaps)
    comparison = next(r for r in result.passed if r.action == "comparison_page")
    assert comparison.reasoning_params["action_key"] == "action.comparison_page"
    assert "'Solo vs its main competitors'" in comparison.reasoning


def test_brand_with_no_data_gets_no_recommendations_and_no_crash():
    gaps = detect_gaps([], SELF, COMPS)
    result = recommend_detailed(gaps, [], SELF, COMPS)
    assert result.passed == [] and result.dropped == 0
    assert result.rejected == len([a for g in gaps for a in actions_for_gap(g)])  # empty evidence never passes
    assert recommend([], [], SELF, COMPS) == []


def test_unknown_brand_name_falls_back_to_entity_id():
    gap = next(g for n, g, _ in MATRIX if n == "competitive")
    (rec,) = recommend([gap], OBS, SELF, COMPS)  # no entity_names
    assert rec.reasoning_params["brand"] == SELF and rec.reasoning_params["competitor"] == COMP


# --------------------------------------------------------------------------- counterfactual closures

def test_insert_mention_shifts_later_ranks_and_clamps():
    o = Observation("o", "q", "p", (EntityMention("a", "competitor", 1), EntityMention("b", "competitor", 3)))
    new = engine._insert_mention(o, SELF, 3)
    assert {m.entity_id: m.rank for m in new.mentions} == {"a": 1, "b": 4, SELF: 3}
    single = Observation("o", "q", "p", (EntityMention("a", "competitor", 1),))
    assert engine._insert_mention(single, SELF, 3).mention_of(SELF).rank == 2  # clamped to the end


def test_promote_mention_moves_up_only():
    o = Observation("o", "q", "p", (EntityMention("a", "competitor", 1), EntityMention("b", "discovered", 2),
                                    EntityMention("c", "discovered", 3), EntityMention(SELF, "self", 4, True)))
    new = engine._promote_mention(o, SELF, 2)
    assert {m.entity_id: m.rank for m in new.mentions} == {"a": 1, SELF: 2, "b": 3, "c": 4}
    assert new.mention_of(SELF).is_passing_mention is False
    top = Observation("o", "q", "p", (EntityMention(SELF, "self", 1),))
    assert engine._promote_mention(top, SELF, 2).mention_of(SELF).rank == 1  # never moved down
    absent = Observation("o", "q", "p", (EntityMention("a", "competitor", 1),))
    assert engine._promote_mention(absent, SELF, 2) is absent


def test_swap_ahead_only_where_the_competitor_leads():
    behind = Observation("o", "q", "p", (EntityMention(COMP, "competitor", 1), EntityMention(SELF, "self", 3, True),
                                         EntityMention("x", "discovered", 2)))
    new = engine._swap_ahead(behind, SELF, COMP)
    assert {m.entity_id: m.rank for m in new.mentions} == {SELF: 1, COMP: 3, "x": 2}
    assert new.mention_of(SELF).is_passing_mention is False
    ahead = Observation("o", "q", "p", (EntityMention(SELF, "self", 1), EntityMention(COMP, "competitor", 2)))
    assert engine._swap_ahead(ahead, SELF, COMP) is ahead
    no_comp = Observation("o", "q", "p", (EntityMention(SELF, "self", 2),))
    assert engine._swap_ahead(no_comp, SELF, COMP) is no_comp


def test_presence_closure_changes_half_of_the_answers_that_omit_the_brand():
    obs = [_obs(i, "gemini", "x", []) for i in range(5)] + [_obs(9, "gemini", "x", [EntityMention(SELF, "self", 1)])]
    gap = Gap("presence", tuple(o.observation_id for o in obs), {"scope": "overall"})
    modified, n_changed = engine._apply_closure(gap, obs, SELF)
    assert n_changed == 3  # ceil(5 * 0.5); the one that already names the brand is untouched
    changed = [m for m, o in zip(modified, obs, strict=True) if m != o]
    assert len(changed) == 3 and all(m.mention_of(SELF).rank == 1 for m in changed)  # rank 3 clamped (no others)
    assert modified[-1] == obs[-1]


def test_representation_and_source_closures_simulate_nothing():
    for name in ("representation/outdated", "source"):
        gap = next(g for n, g, _ in MATRIX if n == name)
        modified, n_changed = engine._apply_closure(gap, OBS, SELF)
        assert n_changed == 0 and modified == OBS


def test_gap_id_is_scope_based_and_output_is_readable():
    g1 = Gap("presence", ("a",), {"scope": "intent", "intent_type": "local_contextual", "coverage": 0.0})
    g2 = Gap("presence", ("b", "c"), {"scope": "intent", "intent_type": "local_contextual", "coverage": 0.05})
    assert g1.gap_id == g2.gap_id and g1.gap_id.startswith("gap-")
    _, _, recs_a = _run()
    _, _, recs_b = _run()
    assert recs_a == recs_b
    competitive = [r for r in recs_a if r.action == "comparison_page"]
    assert any("Ashok Vada Pav" in r.reasoning for r in competitive)
    assert all("Gajanan Vada Pav" in r.reasoning for r in recs_a)


def test_recommendation_new_fields_have_safe_defaults():
    rec = Recommendation("rec-1", "gap-1", "faq_page", "content", 0.0, 0.0, 0.2, 3, "text", ("o",))
    assert rec.evidence_count == 0 and rec.reasoning_key == "" and rec.reasoning_params == {}
    assert replace(rec, evidence_count=4).evidence_count == 4


def test_optional_drafter_rewrite_keeps_ranking_keys_and_traceability():
    """Stage B (drafter.py) may only reword `reasoning`; the gate still passes the same list and the
    translatable key/params keep describing the template facts."""
    from app.recommendation.drafter import Drafter

    class Shouty:
        def draft(self, rec, gap):
            return rec.reasoning.upper()

    drafter: Drafter = Shouty()
    gaps, observations, recs = _run()
    by_id = {g.gap_id: g for g in gaps}
    drafted = [replace(r, reasoning=drafter.draft(r, by_id[r.gap_id]), drafted_by="test:shouty") for r in recs]
    again = validation_gate(drafted, gaps, observations, 10)
    assert [r.recommendation_id for r in again.passed] == [r.recommendation_id for r in recs]
    assert all(r.drafted_by == "test:shouty" and r.reasoning == r.reasoning.upper() for r in again.passed)
    assert [(r.reasoning_key, r.reasoning_params) for r in again.passed] == [(r.reasoning_key, r.reasoning_params) for r in recs]

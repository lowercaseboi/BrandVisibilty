"""mention_summary: per-entity answer counts over the observations it is given."""

from app.analysis.summary import mention_summary
from app.analysis.types import EntityMention, Observation


def _obs(i: int, *mentions: tuple[str, str, int]) -> Observation:
    return Observation(
        observation_id=f"p:q{i}-s0",
        query_id=f"q{i}",
        provider_id="p",
        mentions=tuple(EntityMention(eid, kind, rank) for eid, kind, rank in mentions),
    )


def test_counts_every_tracked_entity_and_ignores_others():
    observations = [
        _obs(0, ("rival", "competitor", 1), ("self", "self", 2)),
        _obs(1, ("self", "self", 1)),
        _obs(2, ("newcomer", "discovered", 1), ("rival", "competitor", 2)),
        _obs(3),
    ]
    summary = mention_summary(observations, ["self", "rival", "quiet"])
    assert summary == {
        "total_answers": 4,
        "entities": {
            "self": {"answers_mentioning": 2, "answers_ranked_first": 1},
            "rival": {"answers_mentioning": 2, "answers_ranked_first": 1},
            "quiet": {"answers_mentioning": 0, "answers_ranked_first": 0},
        },
    }


def test_accepts_raw_observation_dicts_and_entity_maps():
    raws = [
        {"mentions": [{"entity_id": "self", "entity_kind": "self", "rank": 1}]},
        {"mentions": []},
        {},
    ]
    summary = mention_summary(raws, {"self": "Brand", "rival": "Rival"})
    assert summary["total_answers"] == 3
    assert summary["entities"]["self"] == {"answers_mentioning": 1, "answers_ranked_first": 1}
    assert summary["entities"]["rival"] == {"answers_mentioning": 0, "answers_ranked_first": 0}


def test_empty_input():
    assert mention_summary([], []) == {"total_answers": 0, "entities": {}}

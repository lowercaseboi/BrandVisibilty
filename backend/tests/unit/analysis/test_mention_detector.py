import random

from app.analysis.gap_detector import detect_gaps
from app.analysis.mention_detector import detect_mentions
from app.analysis.scorer import score
from app.analysis.types import EntityAlias, Observation

BRAND = EntityAlias("brand-1", "self", ("Acme Perfume", "Acme"))
COMP_A = EntityAlias("comp-a", "competitor", ("Rival Scents",))
ALIAS_TABLE = (BRAND, COMP_A)


def test_no_match_returns_empty_tuple():
    assert detect_mentions("This text mentions nobody tracked.", ALIAS_TABLE) == ()


def test_matches_case_insensitively():
    mentions = detect_mentions("acme perfume is well known.", ALIAS_TABLE)
    assert len(mentions) == 1
    assert mentions[0].entity_id == "brand-1"


def test_matches_possessive_form():
    text = "Acme Perfume's fragrances are popular."
    mentions = detect_mentions(text, ALIAS_TABLE)
    assert len(mentions) == 1
    assert text[mentions[0].char_start : mentions[0].char_end] == "Acme Perfume's"


def test_matches_plural_form():
    solo_competitor = EntityAlias("comp-b", "competitor", ("Rival",))
    text = "Rivals are everywhere in this market."
    mentions = detect_mentions(text, (solo_competitor,))
    assert len(mentions) == 1
    assert text[mentions[0].char_start : mentions[0].char_end] == "Rivals"


def test_matches_alias_ending_in_punctuation():
    exclaim_brand = EntityAlias("brand-2", "self", ("Yahoo!",))
    text = "Yahoo! is a great company."
    mentions = detect_mentions(text, (exclaim_brand,))
    assert len(mentions) == 1
    assert text[mentions[0].char_start : mentions[0].char_end] == "Yahoo!"


def test_matches_with_adjacent_punctuation():
    mentions = detect_mentions("I love Acme, it's great.", ALIAS_TABLE)
    assert len(mentions) == 1
    assert mentions[0].char_start == 7
    assert mentions[0].char_end == 11  # "Acme" — comma is not part of the match


def test_multiple_aliases_for_one_entity_dedupe_to_a_single_mention():
    text = "Acme is great. Later, Acme Perfume is mentioned again."
    mentions = detect_mentions(text, ALIAS_TABLE)
    assert len(mentions) == 1
    assert mentions[0].char_start == 0  # earliest occurrence, "Acme" not "Acme Perfume"


def test_rank_ordering_follows_first_mention_position():
    text = "Rival Scents is well known. Acme Perfume is newer."
    mentions = detect_mentions(text, ALIAS_TABLE)
    assert len(mentions) == 2
    by_entity = {m.entity_id: m.rank for m in mentions}
    assert by_entity["comp-a"] == 1
    assert by_entity["brand-1"] == 2


def test_parenthetical_mention_marked_as_passing():
    text = "Several brands (including Acme) offer this service."
    mentions = detect_mentions(text, ALIAS_TABLE)
    assert len(mentions) == 1
    assert mentions[0].is_passing_mention is True


def test_non_parenthetical_mention_not_marked_passing():
    text = "Acme is the clear leader here."
    mentions = detect_mentions(text, ALIAS_TABLE)
    assert mentions[0].is_passing_mention is False


def test_mention_outside_unrelated_parentheses_not_marked_passing():
    text = "Acme is well known (est. 1990)."
    mentions = detect_mentions(text, ALIAS_TABLE)
    assert mentions[0].is_passing_mention is False


def test_detected_mentions_feed_directly_into_scorer_and_gap_detector():
    responses = [
        "Acme Perfume is a great choice for this.",
        "Rival Scents dominates this category; Acme Perfume is not mentioned here.",
        "This response mentions neither tracked brand.",
    ]
    observations = [
        Observation(
            observation_id=f"o{i}",
            query_id=f"q{i}",
            provider_id="gemini",
            mentions=detect_mentions(text, ALIAS_TABLE),
        )
        for i, text in enumerate(responses)
    ]

    result = score(observations, "brand-1", frozenset({"comp-a"}), n_bootstrap=10, rng=random.Random(0))
    assert result.coverage == 2 / 3

    gaps = detect_gaps(observations, "brand-1", frozenset({"comp-a"}))
    assert isinstance(gaps, list)

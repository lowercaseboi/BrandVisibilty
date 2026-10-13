"""List placement (metrics v2): real assistant answers plus small synthetic cases."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.analysis.list_parser import Placement, is_structured, parse_option_items, place
from app.analysis.mention_detector import detect_mentions, find_spans
from app.analysis.types import EntityAlias

ANSWERS = Path(__file__).resolve().parents[2] / "fixtures" / "answers"

ALIASES = (
    EntityAlias("self", "self", ("Gajanan Vada Pav", "Gajanan")),
    EntityAlias("ashok", "competitor", ("Ashok Vada Pav", "Kirti College Vada Pav")),
    EntityAlias("aaram", "competitor", ("Aaram Vada Pav", "Aaram")),
    EntityAlias("graduate", "competitor", ("Graduate Vada Pav",)),
    EntityAlias("jumbo", "competitor", ("Jumbo King", "Jumboking")),
    EntityAlias("goli", "competitor", ("Goli Vada Pav",)),
)


def _placements(text: str) -> dict[str, Placement]:
    return place(text, find_spans(text, ALIASES))


def _fixture(name: str) -> str:
    return (ANSWERS / name).read_text(encoding="utf-8")


# --- find_spans / detect_mentions compatibility --------------------------------------------


def test_find_spans_returns_every_occurrence_sorted():
    text = "Ashok Vada Pav is great. Try Gajanan, then Ashok Vada Pav again."
    spans = find_spans(text, ALIASES)
    assert [s for s, _ in spans["ashok"]] == [0, text.rindex("Ashok")]
    assert len(spans["self"]) == 1


def test_find_spans_keeps_the_longest_match_rule():
    aliases = (
        EntityAlias("self", "self", ("Nova",)),
        EntityAlias("cafe", "competitor", ("Nova Cafe",)),
    )
    spans = find_spans("Go to Nova Cafe.", aliases)
    assert "self" not in spans and spans["cafe"] == [(6, 15)]


@pytest.mark.parametrize("name", sorted(p.name for p in ANSWERS.glob("*.md")))
def test_detect_mentions_matches_the_earliest_find_spans_occurrence(name):
    text = _fixture(name)
    spans = find_spans(text, ALIASES)
    for mention in detect_mentions(text, ALIASES):
        assert mention.char_start == spans[mention.entity_id][0][0]


# --- real answers ---------------------------------------------------------------------------


def test_numbered_headings_give_the_heading_position():
    placements = _placements(_fixture("gemini_numbered_headings.md"))
    assert placements["ashok"] == Placement("listed", 1, False)


def test_category_headings_count_options_across_sections():
    """'### 1. Legendary rivals' > bullets: the options are the bullets, counted in reading
    order across the category headings, so Gajanan is the ninth option named."""
    placements = _placements(_fixture("gemini_category_bullets.md"))
    assert placements["ashok"].slot == 1
    assert placements["graduate"].slot == 2
    assert placements["jumbo"].slot == 4
    assert placements["goli"].slot == 5
    assert placements["self"] == Placement("listed", 9, False)


def test_names_inside_descriptions_do_not_take_a_slot():
    """In 'alternatives to Ashok', Ashok is only compared against, never listed."""
    placements = _placements(_fixture("gemini_alternatives_to_ashok.md"))
    assert placements["self"] == Placement("listed", 2, False)
    assert placements["graduate"].slot == 3
    assert placements["ashok"].mode == "unlisted"


def test_label_then_emphasised_name_counts_the_name_as_the_option():
    """'*   **Thane:** *Gajanan Vada Pav* (famous for…)'."""
    text = _fixture("gemini_label_then_name.md")
    assert "**Thane:** *Gajanan Vada Pav*" in text
    assert _placements(text)["self"].mode == "listed"


def test_tables_drop_the_header_and_count_rows_in_reading_order():
    text = _fixture("groq_city_tables.md")
    items = parse_option_items(text)
    rows = [i for i in items if i.kind == "row"]
    first = rows[0]
    s, e = first.leads[0]
    assert "Ashok Vada Pav" in text[s:e]  # the header row ("Outlet | …") is not a row
    assert _placements(text)["ashok"] == Placement("listed", 1, False)


def test_a_clarifying_question_has_no_structure():
    text = _fixture("groq_clarification.md")
    items = parse_option_items(text)
    assert not is_structured(items)
    assert _placements(text) == {}


# --- synthetic cases --------------------------------------------------------------------------


def test_untracked_options_push_tracked_ones_down():
    text = "Top picks:\n\n1. A1 Vada Pav\n2. Ashok Vada Pav\n3. Shiv Vada Pav\n4. Graduate Vada Pav\n"
    placements = _placements(text)
    assert placements["ashok"].slot == 2
    assert placements["graduate"].slot == 4  # v1 would have said rank 2


def test_lazy_or_restarted_numbering_uses_reading_order():
    text = "1. **Goli Vada Pav** – chain\n\nMore text.\n\n1. **Ashok Vada Pav** – classic\n"
    placements = _placements(text)
    assert placements["goli"].slot == 1
    assert placements["ashok"].slot == 2


def test_tips_after_a_rule_do_not_list_an_entity():
    text = (
        "### 1. Jumbo King\nFast.\n\n### 2. Goli Vada Pav\nCheap.\n\n---\n\n### Tips\n"
        "* **If you love chutney:** go to Ashok Vada Pav.\n"
    )
    placements = _placements(text)
    assert placements["jumbo"].slot == 1 and placements["goli"].slot == 2
    assert placements["ashok"].mode == "unlisted"


def test_a_listed_mention_beats_an_earlier_intro_mention():
    text = "Unlike Ashok Vada Pav, these are calmer:\n\n- **Goli Vada Pav**\n- **Ashok Vada Pav** (Dadar)\n"
    assert _placements(text)["ashok"] == Placement("listed", 2, False)


def test_a_parenthetical_aside_in_another_option_is_unlisted_and_passing():
    text = "- **Shiv Vada Pav** (near Ashok Vada Pav)\n- **Goli Vada Pav**\n"
    assert _placements(text)["ashok"] == Placement("unlisted", None, True)


def test_passing_mention_inside_a_lead_is_listed_but_passing():
    text = "1. Shiv Vada Pav (near Ashok Vada Pav)\n2. Goli Vada Pav\n"
    assert _placements(text)["ashok"] == Placement("listed", 1, True)


def test_prose_answers_fall_back_to_order_of_first_mention():
    text = "Most people go to Ashok Vada Pav, but Gajanan Vada Pav in Thane is worth the trip."
    placements = _placements(text)
    assert placements["ashok"] == Placement("prose", 1, False)
    assert placements["self"] == Placement("prose", 2, False)


def test_comparison_table_columns_are_options():
    text = "| Feature | Ashok Vada Pav | Goli Vada Pav |\n|---|---|---|\n| Price | ₹20 | ₹25 |\n| Speed | slow | fast |\n"
    placements = _placements(text)
    assert placements["ashok"].slot == 1 and placements["goli"].slot == 2


def test_code_fences_are_ignored():
    text = "```\n1. Ashok Vada Pav\n2. Goli Vada Pav\n```\nAsk me anything."
    assert not is_structured(parse_option_items(text))


def test_parsing_is_deterministic():
    text = _fixture("gemini_category_bullets.md")
    assert parse_option_items(text) == parse_option_items(text)

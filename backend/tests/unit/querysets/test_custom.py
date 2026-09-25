"""Per-brand question sets: defaults, validation, persistence and the unchanged default hash."""

import pytest

from app.brands.registry import get_brand
from app.querysets import custom
from app.querysets.generator import freeze, generate_draft
from app.tracking import store


@pytest.fixture
def brand(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    return get_brand("gajanan_vada_pav")


def _file(brand):
    return store.DATA_DIR / "questions" / f"{brand.brand_key}.json"


def test_defaults_when_no_file(brand):
    qs = custom.get_questions(brand)
    assert qs["brand_key"] == "gajanan_vada_pav" and qs["customized"] is False
    assert [q["id"] for q in qs["questions"]] == list(range(len(qs["questions"])))
    # A run asks the unprompted template questions (17 for this pilot: one city, so no
    # repeated "<category> in Mumbai"); prompted ones are listed, disabled.
    assert qs["scored_count"] == 17 and qs["unscored_count"] == 0
    prompted = [q for q in qs["questions"] if q["intent_type"] == "identity"]
    assert prompted and all(not q["enabled"] and q["names_brand"] and not q["scored"] for q in prompted)
    assert all(q["source"] == "template" for q in qs["questions"])


def test_no_file_uses_todays_query_set_hash(brand):
    query_set, scored, unscored = custom.build_query_set(brand)
    today = freeze(generate_draft(brand.params))
    assert query_set.content_hash == today.content_hash
    assert query_set.template_set_version == today.template_set_version
    assert scored == [q for q in today.queries if not q.is_brand_named]
    assert unscored == []


def test_save_and_load_round_trip(brand):
    items = [
        {"text": "  best vada pav   near Dadar station ", "intent_type": "local_contextual"},
        {"text": "is Gajanan Vada Pav good for breakfast"},
        {"text": "cheap snacks in Mumbai", "enabled": False},
    ]
    saved = custom.save_questions(brand, items)
    assert _file(brand).exists()
    assert saved == custom.get_questions(brand)
    assert saved["customized"] is True
    assert saved["scored_count"] == 1 and saved["unscored_count"] == 1
    first, named, disabled = saved["questions"]
    assert first["text"] == "best vada pav near Dadar station" and first["scored"] is True
    assert first["source"] == "custom" and first["intent_type"] == "local_contextual"
    assert named["names_brand"] is True and named["scored"] is False and named["intent_type"] == "custom"
    assert disabled["enabled"] is False and disabled["scored"] is False

    query_set, scored, unscored = custom.build_query_set(brand)
    assert query_set.template_set_version == "v1-custom"
    assert query_set.content_hash != freeze(generate_draft(brand.params)).content_hash
    assert [q.text for q in scored] == ["best vada pav near Dadar station"]
    assert [q.text for q in unscored] == ["is Gajanan Vada Pav good for breakfast"]
    assert unscored[0].is_brand_named

    reset = custom.reset_questions(brand)
    assert reset["customized"] is False and not _file(brand).exists()


def test_brand_named_detection_uses_aliases(brand):
    assert custom.names_brand("is gajanan any good?", brand)  # short alias, any case
    assert custom.names_brand("Gajanan Vada Pav's menu", brand)
    assert not custom.names_brand("best vada pav in Dadar", brand)
    assert not custom.names_brand("alternatives to Ashok Vada Pav", brand)  # competitor, not self


@pytest.mark.parametrize(
    ("items", "fragment"),
    [
        ([], "at least one question"),
        ([{"text": "ab"}], "too short"),
        ([{"text": "x" * 201}], "too long"),
        ([{"text": "best vada pav"}, {"text": "BEST  vada pav"}], "more than once"),
        ([{"text": "is Gajanan Vada Pav tasty"}], "must not mention Gajanan Vada Pav"),
        ([{"text": "best vada pav", "enabled": False}], "must not mention"),
        ([{"text": "best vada pav", "intent_type": "nonsense"}], "unknown question type"),
        ([{"text": f"question number {i}"} for i in range(61)], "at most 60"),
    ],
)
def test_validation_errors(brand, items, fragment):
    with pytest.raises(ValueError, match=fragment):
        custom.save_questions(brand, items)
    assert not _file(brand).exists()


def test_saving_the_defaults_deletes_the_file(brand):
    custom.save_questions(brand, [{"text": "best vada pav near Dadar station"}])
    assert _file(brand).exists()

    custom.reset_questions(brand)
    defaults = [
        {k: q[k] for k in ("text", "intent_type", "source", "enabled")}
        for q in custom.get_questions(brand)["questions"]
    ]
    custom.save_questions(brand, [{"text": "best vada pav near Dadar station"}])
    result = custom.save_questions(brand, defaults)
    assert result["customized"] is False and not _file(brand).exists()
    assert custom.build_query_set(brand)[0].content_hash == freeze(generate_draft(brand.params)).content_hash


PILOTS = ("gajanan_vada_pav", "va_mayekar_opticians", "perfume_pilot")


@pytest.mark.parametrize("brand_key", PILOTS)
def test_defaults_have_no_enabled_duplicates(tmp_path, monkeypatch, brand_key):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    questions = custom.get_questions(get_brand(brand_key))["questions"]
    enabled = [q["text"].casefold() for q in questions if q["enabled"]]
    assert enabled and len(enabled) == len(set(enabled))
    everything = [q["text"].casefold() for q in questions]
    assert len(everything) == len(set(everything))


@pytest.mark.parametrize("brand_key", PILOTS)
def test_defaults_plus_one_custom_question_saves(tmp_path, monkeypatch, brand_key):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    brand = get_brand(brand_key)
    defaults = custom.get_questions(brand)
    items = [{k: q[k] for k in ("text", "intent_type", "source", "enabled")} for q in defaults["questions"]]
    items.append({"text": "a question nobody would generate from a template", "source": "custom"})
    saved = custom.save_questions(brand, items)
    assert saved["customized"] is True and _file(brand).exists()
    assert saved["scored_count"] == defaults["scored_count"] + 1


def test_old_saved_file_with_disabled_repeats_still_loads(brand):
    # Pre-v2 defaults repeated "<category> in <city>"; customers switched the copies off.
    text = "vada pav outlet in Mumbai"
    items = [
        {"text": text, "intent_type": "local_contextual", "source": "template", "enabled": True},
        {"text": text, "intent_type": "local_contextual", "source": "template", "enabled": False},
        {"text": text, "intent_type": "local_contextual", "source": "template", "enabled": False},
    ]
    saved = custom.save_questions(brand, items)
    assert saved["scored_count"] == 1
    assert custom.get_questions(brand) == saved

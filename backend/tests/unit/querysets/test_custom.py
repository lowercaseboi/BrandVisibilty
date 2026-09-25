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
    # Today's run asks the 20 unprompted template questions; prompted ones are listed, disabled.
    assert qs["scored_count"] == 20 and qs["unscored_count"] == 0
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


def test_disabled_template_repeats_are_allowed(brand):
    # e.g. "vada pav outlet in Mumbai" x3 when the brand has one city: keep the first copy only.
    seen: set[str] = set()
    items = []
    for q in custom.default_questions(brand):
        item = dict(q)
        if item["enabled"]:
            item["enabled"] = item["text"] not in seen
            seen.add(item["text"])
        items.append(item)
    assert sum(i["enabled"] for i in items) < 20
    saved = custom.save_questions(brand, items)
    assert saved["customized"] is True
    assert saved["scored_count"] == len(seen)

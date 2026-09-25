"""Per-brand, customer-editable question sets (DESIGN §3.1 "mandatory human review").

The template-generated query set is the default. A customer can review it, disable
questions and add their own; the result is saved to `DATA_DIR/questions/<brand_key>.json`.

Scoring rules are unchanged (PRD §10.1): only enabled questions that do *not* name the
brand feed Coverage / Prominence / SoV, gaps and recommendations. Brand-named questions
are still asked and kept as evidence, but marked `scored=False`.

With no saved file, `build_query_set` returns exactly today's frozen set, so the content
hash (and therefore the snapshot comparability_key) is unchanged. Any real edit produces
a new hash, which starts a new comparability segment on the trend chart.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from app.analysis.mention_detector import detect_mentions
from app.brands.registry import SELF_ENTITY_ID, BrandConfig
from app.querysets.generator import (
    Query,
    QuerySet,
    QuerySetDraft,
    freeze,
    generate_draft,
)
from app.querysets.templates import ALL_TEMPLATES
from app.tracking import store

CUSTOM_TEMPLATE_SET_VERSION = "v1-custom"
MIN_QUESTIONS = 1
MAX_QUESTIONS = 60
MIN_TEXT_LEN = 3
MAX_TEXT_LEN = 200
SOURCES = ("template", "custom")
ALLOWED_INTENTS: frozenset[str] = frozenset(t.intent_type for t in ALL_TEMPLATES) | {"custom"}


# --------------------------------------------------------------------------- helpers


def _normalise(text: str) -> str:
    return " ".join(text.split())


def _path(brand_key: str):
    if not brand_key or "/" in brand_key or "\\" in brand_key or brand_key.startswith("."):
        raise ValueError(f"Invalid brand_key {brand_key!r}")
    return store.DATA_DIR / "questions" / f"{brand_key}.json"


def names_brand(text: str, brand: BrandConfig) -> bool:
    """True when `text` mentions the brand itself, using the same alias rules as scoring."""
    return any(m.entity_id == SELF_ENTITY_ID for m in detect_mentions(text, brand.alias_table()))


def _default_run_queries(brand: BrandConfig) -> tuple[QuerySet, list[Query]]:
    """Today's frozen set and its unprompted subset — the pre-customisation behaviour."""
    query_set = freeze(generate_draft(brand.params))
    return query_set, [q for q in query_set.queries if not q.is_brand_named]


def default_questions(brand: BrandConfig) -> list[dict[str, Any]]:
    """Template questions in generation order. Unprompted ones are enabled (they are what a
    run asks today); brand-named (prompted) ones are listed but disabled.

    Template generation never repeats a question (TEMPLATE_SET_VERSION v2), so the
    defaults always pass `_check_duplicates` and a customer can save them as-is."""
    return [
        {
            "text": q.text,
            "intent_type": q.intent_type,
            "source": "template",
            "enabled": not q.is_brand_named,
        }
        for q in generate_draft(brand.params).queries
    ]


def _load_saved(brand: BrandConfig) -> list[dict[str, Any]] | None:
    path = _path(brand.brand_key)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None  # a corrupt file falls back to defaults rather than breaking runs
    items = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return None
    out = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            continue
        out.append(
            {
                "text": _normalise(item["text"]),
                "intent_type": item.get("intent_type") if item.get("intent_type") in ALLOWED_INTENTS else "custom",
                "source": item.get("source") if item.get("source") in SOURCES else "custom",
                "enabled": bool(item.get("enabled", True)),
            }
        )
    return out or None


def _matches_default_run(items: list[dict[str, Any]], brand: BrandConfig, flags: list[bool]) -> bool:
    """Would asking `items` be exactly today's default run (same scored questions, same
    order, nothing brand-named enabled)?"""
    _, default_queries = _default_run_queries(brand)
    enabled = [(it, named) for it, named in zip(items, flags, strict=True) if it["enabled"]]
    if any(named for _, named in enabled):
        return False
    return [(_normalise(it["text"]), it["intent_type"]) for it, _ in enabled] == [
        (_normalise(q.text), q.intent_type) for q in default_queries
    ]


def _annotate(items: list[dict[str, Any]], brand: BrandConfig, *, customized: bool) -> dict[str, Any]:
    questions = []
    scored_count = unscored_count = 0
    for i, item in enumerate(items):
        named = names_brand(item["text"], brand)
        scored = item["enabled"] and not named
        if item["enabled"]:
            if named:
                unscored_count += 1
            else:
                scored_count += 1
        questions.append(
            {
                "id": i,
                "text": item["text"],
                "intent_type": item["intent_type"],
                "source": item["source"],
                "enabled": item["enabled"],
                "names_brand": named,
                "scored": scored,
            }
        )
    return {
        "brand_key": brand.brand_key,
        "customized": customized,
        "questions": questions,
        "scored_count": scored_count,
        "unscored_count": unscored_count,
    }


# --------------------------------------------------------------------------- public API


def get_questions(brand: BrandConfig) -> dict[str, Any]:
    """The saved question list (or the defaults), annotated for the editor, plus the
    content_hash of the query set the next run would use (`build_query_set`)."""
    saved = _load_saved(brand)
    if saved is None:
        result = _annotate(default_questions(brand), brand, customized=False)
    else:
        result = _annotate(saved, brand, customized=True)
    result["content_hash"] = build_query_set(brand)[0].content_hash
    return result


def _validate(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, (list, tuple)):
        raise ValueError("Questions must be a list")  # noqa: TRY004 - surfaced as a 422 message
    if len(items) < MIN_QUESTIONS:
        raise ValueError("Add at least one question")
    if len(items) > MAX_QUESTIONS:
        raise ValueError(f"You can have at most {MAX_QUESTIONS} questions (got {len(items)})")

    clean: list[dict[str, Any]] = []
    for n, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Question {n} is not valid")  # noqa: TRY004 - surfaced as a 422 message
        text = item.get("text")
        if not isinstance(text, str):
            raise ValueError(f"Question {n} needs some text")  # noqa: TRY004 - surfaced as a 422 message
        text = _normalise(text)
        if len(text) < MIN_TEXT_LEN:
            raise ValueError(f"Question {n} is too short (at least {MIN_TEXT_LEN} characters)")
        if len(text) > MAX_TEXT_LEN:
            raise ValueError(f"Question {n} is too long (at most {MAX_TEXT_LEN} characters, got {len(text)})")
        intent_type = item.get("intent_type") or "custom"
        if intent_type not in ALLOWED_INTENTS:
            raise ValueError(f"Question {n} has an unknown question type {intent_type!r}")
        source = item.get("source") or "custom"
        if source not in SOURCES:
            raise ValueError(f"Question {n} has an unknown source {source!r}")
        enabled = item.get("enabled", True)
        if not isinstance(enabled, bool):
            raise ValueError(f"Question {n}: 'enabled' must be true or false")  # noqa: TRY004 - surfaced as a 422 message
        clean.append({"text": text, "intent_type": intent_type, "source": source, "enabled": enabled})
    return clean


def _check_duplicates(items: list[dict[str, Any]]) -> None:
    """Duplicates are rejected among enabled questions (case-insensitive) and among custom
    questions. Disabled template repeats are allowed, so lists saved before v2 (when the
    defaults could repeat a question and the customer switched the copies off) still load
    and re-save."""
    seen_enabled: set[str] = set()
    seen_custom: set[str] = set()
    for item in items:
        key = item["text"].casefold()
        if item["enabled"]:
            if key in seen_enabled:
                raise ValueError(f"The question “{item['text']}” is in the list more than once")
            seen_enabled.add(key)
        if item["source"] == "custom":
            if key in seen_custom:
                raise ValueError(f"The question “{item['text']}” is in the list more than once")
            seen_custom.add(key)


def save_questions(brand: BrandConfig, items: Any) -> dict[str, Any]:
    """Validate and persist. Raises ValueError with a plain-English message.

    If the list would ask exactly today's default questions (and holds no custom
    questions), the saved file is removed instead, so the trend baseline stays unbroken."""
    clean = _validate(items)
    flags = [names_brand(it["text"], brand) for it in clean]
    if not any(it["enabled"] and not named for it, named in zip(clean, flags, strict=True)):
        raise ValueError(
            f"At least one enabled question must not mention {brand.name}. Questions that name the brand "
            "are asked but not scored, so a run needs at least one that doesn't."
        )

    if _matches_default_run(clean, brand, flags) and not any(it["source"] == "custom" for it in clean):
        return reset_questions(brand)

    _check_duplicates(clean)
    path = _path(brand.brand_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    payload = {"questions": clean, "updated_at": datetime.now(UTC).isoformat()}
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)
    return get_questions(brand)


def reset_questions(brand: BrandConfig) -> dict[str, Any]:
    """Delete the saved list; the brand goes back to the template questions."""
    _path(brand.brand_key).unlink(missing_ok=True)
    return get_questions(brand)


def build_query_set(brand: BrandConfig) -> tuple[QuerySet, list[Query], list[Query]]:
    """(frozen query set, scored queries, unscored brand-named queries) for a run.

    No saved file, or a saved list that asks exactly the default questions -> today's
    frozen template set (unchanged content hash) with no unscored questions."""
    saved = _load_saved(brand)
    default_set, default_queries = _default_run_queries(brand)
    if saved is None:
        return default_set, default_queries, []
    flags = [names_brand(it["text"], brand) for it in saved]
    if _matches_default_run(saved, brand, flags):
        return default_set, default_queries, []

    queries = tuple(
        Query(text=it["text"], intent_type=it["intent_type"], is_brand_named=named)
        for it, named in zip(saved, flags, strict=True)
        if it["enabled"]
    )
    draft = QuerySetDraft(
        template_set_version=CUSTOM_TEMPLATE_SET_VERSION,
        brand=brand.params.brand,
        queries=queries,
        sampling_config=dict(default_set.sampling_config),
    )
    query_set = freeze(draft)
    scored = [q for q in query_set.queries if not q.is_brand_named]
    unscored = [q for q in query_set.queries if q.is_brand_named]
    return query_set, scored, unscored

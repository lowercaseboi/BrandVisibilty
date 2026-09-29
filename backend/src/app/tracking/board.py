"""Recommendation board storage (PRD §11.4: approve / reject / save-for-later) — one JSON
file per brand at `DATA_DIR/boards/<brand_key>.json`.

This is pure I/O, mirroring `tracking/store.py`'s style (atomic write: tempfile in the same
directory + `os.replace`, so a crash mid-write never leaves a half-written board). Shape
validation (columns, `updated_at`) happens in the Pydantic `BoardState`/`BoardCardState`
schemas at the API layer; the limits below (card count, key length) aren't expressible as
simple field constraints on a dict, so they're checked here instead.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from app import paths

MAX_CARDS = 500
MAX_KEY_LEN = 300


def _boards_dir() -> Path:
    return paths.DATA_DIR / "boards"


def _path_for(brand_key: str) -> Path:
    if not brand_key or "/" in brand_key or "\\" in brand_key or brand_key.startswith("."):
        raise ValueError(f"Invalid brand_key {brand_key!r}")
    return _boards_dir() / f"{brand_key}.json"


def board_path(brand_key: str) -> Path:
    return _path_for(brand_key)


def _empty(brand_key: str) -> dict:
    return {"brand_key": brand_key, "cards": {}}


def load_board(brand_key: str) -> dict:
    """The stored board, or an empty one (`cards: {}`) if nothing was ever saved. A
    corrupt file falls back to empty rather than breaking the page."""
    path = _path_for(brand_key)
    if not path.exists():
        return _empty(brand_key)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty(brand_key)
    cards = data.get("cards") if isinstance(data, dict) else None
    if not isinstance(cards, dict):
        return _empty(brand_key)
    return {"brand_key": brand_key, "cards": cards}


def validate_cards(cards: dict) -> None:
    """Raises ValueError (surfaced as a 422) for limits a Pydantic field type can't express
    on a dict: too many cards, or a card key that's unreasonably long."""
    if len(cards) > MAX_CARDS:
        raise ValueError(f"A board can have at most {MAX_CARDS} cards (got {len(cards)})")
    for key in cards:
        if not isinstance(key, str) or not key:
            raise ValueError("Card keys must be non-empty strings")
        if len(key) > MAX_KEY_LEN:
            raise ValueError(f"Card key is too long (at most {MAX_KEY_LEN} characters): {key[:40]!r}…")


def save_board(brand_key: str, cards: dict) -> dict:
    """Validate and persist atomically (tempfile in the same directory + `os.replace`).
    Returns the stored state, same shape as `load_board`."""
    validate_cards(cards)
    path = _path_for(brand_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    payload = {"brand_key": brand_key, "cards": cards}
    try:
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)  # no-op once os.replace has moved it into place
    return payload


def delete_board(brand_key: str) -> None:
    """Remove the brand's saved board, if any. Idempotent, like `store.delete_brand_data`."""
    _path_for(brand_key).unlink(missing_ok=True)

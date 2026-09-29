import pytest

from app import paths
from app.tracking import board


@pytest.fixture(autouse=True)
def tmp_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


def test_load_board_empty_when_never_saved():
    assert board.load_board("demo") == {"brand_key": "demo", "cards": {}}


def test_save_and_load_round_trip(tmp_data_dir):
    cards = {
        "run_more_evidence|ashok_vada_pav": {"column": "in_progress", "order": 0, "updated_at": "2026-09-28T10:00:00Z"},
        "improve_prominence|self": {"column": "suggested", "order": 1, "updated_at": "2026-09-28T10:01:00Z"},
    }
    saved = board.save_board("demo", cards)
    assert saved == {"brand_key": "demo", "cards": cards}
    assert board.load_board("demo") == saved
    # Atomic write: the temp file is cleaned up and the real file holds the payload.
    path = board.board_path("demo")
    assert path.exists()
    assert list(path.parent.glob("*.tmp")) == []


def test_save_board_overwrites_previous_state(tmp_data_dir):
    board.save_board("demo", {"a": {"column": "suggested", "order": 0, "updated_at": "t"}})
    board.save_board("demo", {"b": {"column": "done", "order": 0, "updated_at": "t2"}})
    assert board.load_board("demo") == {"brand_key": "demo", "cards": {"b": {"column": "done", "order": 0, "updated_at": "t2"}}}


def test_load_board_falls_back_to_empty_on_corrupt_file(tmp_data_dir):
    path = board.board_path("demo")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json", encoding="utf-8")
    assert board.load_board("demo") == {"brand_key": "demo", "cards": {}}

    path.write_text('{"cards": "nope"}', encoding="utf-8")
    assert board.load_board("demo") == {"brand_key": "demo", "cards": {}}


def test_validate_cards_rejects_too_many_and_too_long_keys():
    too_many = {f"k{i}": {} for i in range(board.MAX_CARDS + 1)}
    with pytest.raises(ValueError, match=str(board.MAX_CARDS)):
        board.validate_cards(too_many)

    with pytest.raises(ValueError, match="too long"):
        board.validate_cards({"x" * (board.MAX_KEY_LEN + 1): {}})

    # Exactly at the limits is fine.
    board.validate_cards({f"k{i}": {} for i in range(board.MAX_CARDS)})
    board.validate_cards({"x" * board.MAX_KEY_LEN: {}})


def test_save_board_raises_before_writing_when_invalid(tmp_data_dir):
    too_many = {f"k{i}": {"column": "suggested", "order": i, "updated_at": "t"} for i in range(board.MAX_CARDS + 1)}
    with pytest.raises(ValueError):
        board.save_board("demo", too_many)
    assert not board.board_path("demo").exists()


def test_delete_board_is_idempotent(tmp_data_dir):
    board.save_board("demo", {"a": {"column": "suggested", "order": 0, "updated_at": "t"}})
    assert board.board_path("demo").exists()
    board.delete_board("demo")
    assert not board.board_path("demo").exists()
    board.delete_board("demo")  # missing file is not an error


def test_invalid_brand_key_rejected():
    for bad in ("", "../x", "a/b", ".hidden"):
        with pytest.raises(ValueError):
            board.board_path(bad)

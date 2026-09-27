"""CORS env-var parsing (deploy on Render/Vercel: CORS_ORIGINS / CORS_ORIGIN_REGEX).

Pure functions, no FastAPI app needed — see DESIGN_v1 note in main.py's CORSMiddleware
setup. `app.interface.main` imports the real brands/collection/tracking modules (not
faked, unlike test_api.py) since importing it has no side effects worth isolating here.
"""

from __future__ import annotations

from app.interface.main import parse_cors_origin_regex, parse_cors_origins


def test_parse_cors_origins_none_or_blank_is_empty() -> None:
    assert parse_cors_origins(None) == []
    assert parse_cors_origins("") == []
    assert parse_cors_origins("   ") == []


def test_parse_cors_origins_trims_and_drops_empties() -> None:
    assert parse_cors_origins("https://a.com, https://b.com ,, ") == [
        "https://a.com",
        "https://b.com",
    ]


def test_parse_cors_origins_single_value_no_comma() -> None:
    assert parse_cors_origins("https://brandlens.vercel.app") == ["https://brandlens.vercel.app"]


def test_parse_cors_origins_dedupes_while_preserving_order() -> None:
    assert parse_cors_origins("https://a.com,https://b.com,https://a.com") == [
        "https://a.com",
        "https://b.com",
    ]


def test_parse_cors_origin_regex_none_or_blank_is_none() -> None:
    assert parse_cors_origin_regex(None) is None
    assert parse_cors_origin_regex("") is None
    assert parse_cors_origin_regex("   ") is None


def test_parse_cors_origin_regex_trims_whitespace() -> None:
    pattern = r"https://.*\.vercel\.app"
    assert parse_cors_origin_regex(f"  {pattern}  ") == pattern

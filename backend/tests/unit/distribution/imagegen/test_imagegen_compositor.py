from __future__ import annotations

import pytest
from PIL import Image

from app.distribution.imagegen import RAQM_AVAILABLE, compose, cover_crop, harden_prompt
from app.distribution.imagegen.compositor import FontSet, _clusters, fit_text, headline_fonts, wrap
from app.distribution.types import IMAGE_SIZES

DEVA = "गजानन वडा पाव"


@pytest.mark.parametrize("fmt", list(IMAGE_SIZES))
def test_compose_exact_size_from_any_base(fmt):
    for base_size in [(1024, 1024), (640, 1600), (1920, 400)]:
        out = compose(Image.new("RGB", base_size, (90, 120, 200)), fmt, overlay_text="Fresh today", brand_name="Brand")
        assert out.size == IMAGE_SIZES[fmt]
        assert out.mode == "RGB"


def test_cover_crop_does_not_letterbox():
    base = Image.new("RGB", (100, 400), (255, 0, 0))
    out = cover_crop(base, (1200, 675))
    assert out.size == (1200, 675)
    assert out.getpixel((0, 0)) == (255, 0, 0) and out.getpixel((1199, 674)) == (255, 0, 0)


@pytest.mark.parametrize("fmt", list(IMAGE_SIZES))
def test_devanagari_renders_without_error(fmt):
    out = compose(Image.new("RGB", (800, 800), (30, 30, 30)), fmt, overlay_text=f"{DEVA} — आता नवीन शाखेत", brand_name=DEVA)
    assert out.size == IMAGE_SIZES[fmt]


def test_text_actually_drawn_in_text_zone():
    base = Image.new("RGB", (1080, 1080), (0, 0, 0))
    plain = compose(base, "square", overlay_text=None, brand_name="")
    text = compose(base, "square", overlay_text="Big headline here", brand_name="Brand")
    region = (80, 700, 1000, 1000)
    assert text.crop(region).convert("L").getextrema()[1] > 200  # white headline pixels
    assert plain.crop(region).convert("L").getextrema()[1] < 200


def test_devanagari_uses_devanagari_font_and_mixed_words():
    fonts = headline_fonts("नवीन Offer")
    assert "Devanagari" in fonts.for_word("नवीन", 40).getname()[0]
    assert "Devanagari" not in fonts.for_word("Offer", 40).getname()[0]


def test_wrap_and_fit_respect_width():
    fonts: FontSet = headline_fonts("x")
    text = "The quick brown fox jumps over the lazy dog again and again"
    fitted = fit_text(text, fonts, max_w=500, max_h=400, max_lines=4, hi=90, lo=30)
    assert 1 <= len(fitted.lines) <= 4
    for line in wrap(text, fonts, fitted.size, 500):
        assert fonts.for_word(" ".join(line), fitted.size).getlength(" ".join(line)) <= 500 + 1


def test_overlong_text_is_truncated_not_overflowing():
    fonts = headline_fonts("x")
    fitted = fit_text("word " * 200, fonts, max_w=400, max_h=200, max_lines=3, hi=60, lo=40)
    assert len(fitted.lines) <= 3
    assert fitted.lines[-1][-1].endswith("…")


def test_clusters_keep_matras_and_conjuncts_together():
    assert _clusters("पाव") == ["पा", "व"]
    assert _clusters("क्ष") == ["क्ष"]


def test_raqm_flag_is_bool():
    assert isinstance(RAQM_AVAILABLE, bool)


def test_harden_prompt():
    p = harden_prompt("a perfume bottle.", "warm")
    assert p.startswith("a perfume bottle") and "golden-hour" in p and p.endswith("no watermark")
    assert harden_prompt("x", "my custom vibe").count("my custom vibe") == 1

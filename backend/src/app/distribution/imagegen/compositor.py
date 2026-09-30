"""Compositor: crop a base scene to a platform size and draw all text ourselves.

Image models can't render text reliably (Devanagari least of all), so the model only paints the
scene and this module adds, per format:

* a cover-crop to `IMAGE_SIZES[format]` (exact pixel size),
* a soft dark scrim behind the text zone for contrast on any background,
* the headline (`overlay_text`), auto-sized and word-wrapped inside safe margins, with a faint
  shadow; the brand name underneath with a short accent bar,
* a small monogram tag in the top corner.

Layouts: square / portrait / gbp put the text block at the bottom; story keeps it in the lower
third but above the ~340 px strip Instagram/WhatsApp cover with their reply UI (and the monogram
below the ~250 px top UI); landscape puts a left-hand block over a horizontal scrim.

Devanagari: Pillow shapes complex scripts only with libraqm (conjuncts, matra reordering, reph).
Pillow's Windows/macOS wheels bundle it, but the Linux wheels load the system libraqm at runtime,
so on Linux install it (Debian/Ubuntu: `libraqm0`; the backend Dockerfile does). Without raqm Pillow
falls back to its BASIC layout: text still renders (no exception) but Devanagari clusters are
visibly mis-shaped (e.g. the i-matra ि drawn after its consonant). Latin text is unaffected.
Mixed-script lines use one font per word (Noto Sans Devanagari for Devanagari words, Noto Sans
for the rest) with a shared baseline, so neither script ever hits a missing-glyph box.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, features

from app.distribution.imagegen.palette import brand_palette
from app.distribution.types import IMAGE_SIZES, ImageFormat

FONT_DIR = Path(__file__).resolve().parent / "fonts"
DISPLAY_FONT = FONT_DIR / "Poppins-Bold.ttf"  # Latin-only headlines (clean numerals, has ₹)
SANS_BOLD = FONT_DIR / "NotoSans-Bold.ttf"
SANS_REGULAR = FONT_DIR / "NotoSans-Regular.ttf"
DEVA_BOLD = FONT_DIR / "NotoSansDevanagari-Bold.ttf"
DEVA_REGULAR = FONT_DIR / "NotoSansDevanagari-Regular.ttf"

RAQM_AVAILABLE: bool = bool(features.check("raqm"))
_LAYOUT = ImageFont.Layout.RAQM if RAQM_AVAILABLE else ImageFont.Layout.BASIC

WHITE = (255, 255, 255)
VIRAMA = "्"


# --- script / font helpers -----------------------------------------------------------------------


def is_devanagari(ch: str) -> bool:
    cp = ord(ch)
    return 0x0900 <= cp <= 0x097F or 0xA8E0 <= cp <= 0xA8FF or 0x1CD0 <= cp <= 0x1CFF


def has_devanagari(text: str) -> bool:
    return any(is_devanagari(c) for c in text)


def _display_ok(text: str) -> bool:
    return all(ord(c) < 0x250 or c in "‘’“”–—•…₹€" for c in text)


@lru_cache(maxsize=128)
def _font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size, layout_engine=_LAYOUT)


@dataclass(frozen=True)
class FontSet:
    """Which font file to use for Devanagari words and for everything else."""

    latin: Path
    deva: Path

    def for_word(self, word: str, size: int) -> ImageFont.FreeTypeFont:
        return _font(self.deva if has_devanagari(word) else self.latin, size)


def headline_fonts(text: str) -> FontSet:
    if has_devanagari(text):
        return FontSet(latin=SANS_BOLD, deva=DEVA_BOLD)  # one family when scripts mix
    return FontSet(latin=DISPLAY_FONT if _display_ok(text) else SANS_BOLD, deva=DEVA_BOLD)


def label_fonts(text: str) -> FontSet:
    return FontSet(latin=SANS_BOLD, deva=DEVA_BOLD)


# --- text layout ---------------------------------------------------------------------------------


def _clusters(word: str) -> list[str]:
    """Approximate grapheme clusters (never split a mark from its base, or across a virama)."""
    out: list[str] = []
    for ch in word:
        if out and (unicodedata.category(ch).startswith("M") or out[-1].endswith(VIRAMA) or ch == "‍"):
            out[-1] += ch
        else:
            out.append(ch)
    return out


def _width(words: list[str], fonts: FontSet, size: int) -> float:
    space = _font(fonts.latin, size).getlength(" ")
    return sum(fonts.for_word(w, size).getlength(w) for w in words) + space * max(0, len(words) - 1)


def _split_long(word: str, fonts: FontSet, size: int, max_w: float) -> list[str]:
    pieces, cur = [], ""
    for cl in _clusters(word):
        if cur and fonts.for_word(cur + cl, size).getlength(cur + cl) > max_w:
            pieces.append(cur)
            cur = cl
        else:
            cur += cl
    if cur:
        pieces.append(cur)
    return pieces


def wrap(text: str, fonts: FontSet, size: int, max_w: float) -> list[list[str]]:
    """Greedy word wrap. Returns lines as word lists (words are drawn one by one, per-word font)."""
    words: list[str] = []
    for w in text.split():
        if fonts.for_word(w, size).getlength(w) > max_w:
            words.extend(_split_long(w, fonts, size, max_w))
        else:
            words.append(w)
    lines: list[list[str]] = []
    for w in words:
        if lines and _width([*lines[-1], w], fonts, size) <= max_w:
            lines[-1].append(w)
        else:
            lines.append([w])
    return lines


def _line_height(text: str, size: int) -> float:
    return size * (1.42 if has_devanagari(text) else 1.12)


@dataclass
class FittedText:
    lines: list[list[str]]
    size: int
    fonts: FontSet
    line_h: float

    @property
    def height(self) -> float:
        return self.line_h * len(self.lines)


def _balance(text: str, fonts: FontSet, size: int, max_w: float, lines: list[list[str]]) -> list[list[str]]:
    """Narrowest wrap width that keeps the same line count → even lines, no one-word orphan."""
    if len(lines) < 2:
        return lines
    words = [w for ln in lines for w in ln]
    lo_w, hi_w, best = max_w * 0.4, max_w, lines
    for _ in range(12):
        mid = (lo_w + hi_w) / 2
        trial = wrap(text, fonts, size, mid)
        same_words = [w for ln in trial for w in ln] == words  # never break a word just to balance
        if same_words and len(trial) == len(lines) and all(_width(ln, fonts, size) <= max_w for ln in trial):
            best, hi_w = trial, mid
        else:
            lo_w = mid
    return best


def fit_text(text: str, fonts: FontSet, max_w: float, max_h: float, max_lines: int, hi: int, lo: int) -> FittedText:
    """Largest font size in [lo, hi] whose wrapped text fits the box; at `lo`, truncate with …"""
    for size in range(hi, lo - 1, -2):
        lines = wrap(text, fonts, size, max_w)
        lh = _line_height(text, size)
        if len(lines) <= max_lines and lh * len(lines) <= max_h:
            return FittedText(_balance(text, fonts, size, max_w, lines), size, fonts, lh)
    lines = wrap(text, fonts, lo, max_w)
    lh = _line_height(text, lo)
    keep = max(1, min(max_lines, int(max_h // lh)))
    if len(lines) > keep:
        lines = lines[:keep]
        last = lines[-1]
        while len(last) > 1 and _width([*last, "…"], fonts, lo) > max_w:
            last.pop()
        last[-1] = last[-1] + "…"
    return FittedText(lines, lo, fonts, lh)


def _draw_words(draw: ImageDraw.ImageDraw, x: float, baseline: float, words: list[str], fonts: FontSet, size: int, fill) -> None:
    space = _font(fonts.latin, size).getlength(" ")
    for w in words:
        font = fonts.for_word(w, size)
        draw.text((x, baseline), w, font=font, fill=fill, anchor="ls")
        x += font.getlength(w) + space


def _draw_tracked(draw: ImageDraw.ImageDraw, x: float, baseline: float, text: str, font, tracking: float, fill) -> float:
    """Letter-spaced label; only for Latin text (per-character drawing would break shaping)."""
    for ch in text:
        draw.text((x, baseline), ch, font=font, fill=fill, anchor="ls")
        x += font.getlength(ch) + tracking
    return x


# --- image helpers -------------------------------------------------------------------------------


def cover_crop(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    """Scale to cover `size` and crop the overflow (no letterboxing, no distortion)."""
    return ImageOps.fit(img.convert("RGB"), size, method=Image.Resampling.LANCZOS, centering=centering)


def _scrim_vertical(size: tuple[int, int], start: float, max_alpha: int) -> Image.Image:
    """Transparent above `start` (fraction of height), easing to `max_alpha` at the bottom."""
    w, h = size
    col = Image.new("L", (1, h))
    y0 = int(h * start)
    col.putdata([0 if y < y0 else int(max_alpha * (((y - y0) / max(1, h - y0)) ** 0.9) ** 1.0) for y in range(h)])
    return col.resize(size)


def _scrim_horizontal(size: tuple[int, int], end: float, max_alpha: int) -> Image.Image:
    w, h = size
    row = Image.new("L", (w, 1))
    x1 = int(w * end)
    row.putdata([int(max_alpha * (1 - x / x1) ** 1.2) if x < x1 else 0 for x in range(w)])
    return row.resize(size)


def _initials(brand_name: str) -> str:
    words = [w for w in brand_name.replace(".", " ").split() if w]
    if not words:
        return "•"
    if has_devanagari(words[0]):
        return _clusters(words[0])[0]
    letters = [w[0] for w in words if w[0].isalnum()][:2]
    return "".join(letters).upper() or brand_name[:1].upper()


# --- layout per format ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Layout:
    box: tuple[float, float, float, float]  # x0, y0 (top limit), x1, y1 (bottom) of the text block
    anchor_bottom: bool  # True: block sits on y1; False: vertically centred in the box
    headline_hi: float  # max headline size, fraction of width
    headline_lo: float
    max_lines: int
    scrim: str  # "bottom" | "left"
    scrim_start: float
    tag_xy: tuple[float, float]


def layout_for(fmt: ImageFormat) -> Layout:
    w, h = IMAGE_SIZES[fmt]
    m = round(w * 0.074)
    if fmt == "story":
        return Layout((m, h * 0.55, w - m, h - 340), True, 0.105, 0.05, 5, "bottom", 0.42, (m, 250))
    if fmt == "landscape":
        return Layout((m, m * 1.9, w * 0.6, h - m), False, 0.066, 0.032, 4, "left", 0.72, (m, m))
    if fmt == "portrait":
        return Layout((m, h * 0.5, w - m, h - m), True, 0.1, 0.048, 4, "bottom", 0.36, (m, m))
    if fmt == "gbp":
        return Layout((m, h * 0.45, w * 0.86, h - m), True, 0.075, 0.038, 3, "bottom", 0.32, (m, m))
    return Layout((m, h * 0.45, w - m, h - m), True, 0.092, 0.046, 4, "bottom", 0.3, (m, m))  # square


def compose(
    base: Image.Image,
    fmt: ImageFormat,
    *,
    overlay_text: str | None,
    brand_name: str,
    style: str | None = None,
) -> Image.Image:
    if fmt not in IMAGE_SIZES:
        raise ValueError(f"unknown image format: {fmt!r}")
    size = IMAGE_SIZES[fmt]
    w, h = size
    lay = layout_for(fmt)
    pal = brand_palette(brand_name, style)
    img = cover_crop(base, size, centering=(0.5, 0.4))

    headline = (overlay_text or "").strip() or brand_name.strip()
    show_brand_line = bool((overlay_text or "").strip()) and bool(brand_name.strip())

    # 1) scrim
    if lay.scrim == "left":
        mask = _scrim_horizontal(size, lay.scrim_start, 225)
    else:
        mask = _scrim_vertical(size, lay.scrim_start, 225)
    img = Image.composite(Image.new("RGB", size, pal.shade), img, mask)

    # 2) text layer (drawn separately so we can derive a soft shadow from its alpha)
    txt = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(txt)
    x0, top, x1, bottom = lay.box
    max_w = x1 - x0

    bar_h = max(6, round(w * 0.008))
    bar_w = round(w * 0.085)
    gap = round(w * 0.028)
    brand_size = round(w * (0.03 if fmt != "landscape" else 0.024))
    brand_fonts = label_fonts(brand_name)
    brand_block = (gap + brand_size * (1.5 if has_devanagari(brand_name) else 1.15)) if show_brand_line else 0

    fitted = fit_text(
        headline,
        headline_fonts(headline),
        max_w,
        max_h=(bottom - top) - bar_h - gap - brand_block,
        max_lines=lay.max_lines,
        hi=round(w * lay.headline_hi),
        lo=round(w * lay.headline_lo),
    )
    block_h = bar_h + gap + fitted.height + brand_block
    y = bottom - block_h if lay.anchor_bottom else top + ((bottom - top) - block_h) / 2

    d.rectangle((x0, y, x0 + bar_w, y + bar_h), fill=(*pal.accent, 255))
    y += bar_h + gap
    deva = has_devanagari(headline)
    first_baseline = fitted.size * (0.98 if deva else 0.9)
    for i, words in enumerate(fitted.lines):
        _draw_words(d, x0, y + first_baseline + i * fitted.line_h, words, fitted.fonts, fitted.size, (*WHITE, 255))
    y += fitted.height

    if show_brand_line:
        y += gap
        baseline = y + brand_size * (1.1 if has_devanagari(brand_name) else 0.9)
        if brand_name.isascii():
            font = _font(SANS_BOLD, brand_size)
            _draw_tracked(d, x0, baseline, brand_name.upper(), font, brand_size * 0.14, (*WHITE, 215))
        else:
            _draw_words(d, x0, baseline, brand_name.split(), brand_fonts, brand_size, (*WHITE, 215))

    # 3) monogram tag
    tx, ty = lay.tag_xy
    dia = round(w * (0.075 if fmt != "landscape" else 0.058))
    ss = 4
    badge = Image.new("RGBA", (dia * ss, dia * ss), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse((0, 0, dia * ss - 1, dia * ss - 1), fill=(*pal.accent, 255))
    badge = badge.resize((dia, dia), Image.Resampling.LANCZOS)
    txt.alpha_composite(badge, (int(tx), int(ty)))
    ini = _initials(brand_name)
    ini_size = round(dia * (0.4 if len(ini) > 1 else 0.48))
    ini_font = label_fonts(ini).for_word(ini, ini_size)
    d.text((tx + dia / 2, ty + dia / 2), ini, font=ini_font, fill=(*WHITE, 255), anchor="mm")

    # 4) shadow + composite
    shadow_alpha = txt.getchannel("A").filter(ImageFilter.GaussianBlur(radius=max(2, w * 0.006)))
    shadow_alpha = shadow_alpha.point(lambda v: v * 45 // 100)
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow.putalpha(shadow_alpha)
    out = img.convert("RGBA")
    out.alpha_composite(shadow, (0, max(1, round(w * 0.002))))
    out.alpha_composite(txt)
    return out.convert("RGB")

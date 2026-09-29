"""QR poster for review-request kits (`seek_review_coverage`): a printable portrait card with the
headline, a large QR code pointing at the review link, the brand name and the short URL.

Fully offline (template scene + `qrcode`), so it never depends on an image provider.
"""

from __future__ import annotations

import qrcode
from PIL import Image, ImageDraw
from qrcode.constants import ERROR_CORRECT_M

from app.distribution.imagegen.base import stable_seed
from app.distribution.imagegen.compositor import (
    SANS_REGULAR,
    WHITE,
    FontSet,
    _draw_words,
    _font,
    _initials,
    fit_text,
    has_devanagari,
    headline_fonts,
    label_fonts,
    _width,
)
from app.distribution.imagegen.palette import brand_palette
from app.distribution.imagegen.service import media_dir, new_asset_id, now_iso, save_png
from app.distribution.imagegen.template import render_scene
from app.distribution.types import IMAGE_SIZES, Asset

QR_FORMAT = "portrait"


def _short_url(url: str, limit: int = 42) -> str:
    s = url.split("://", 1)[-1].removeprefix("www.").rstrip("/")
    return s if len(s) <= limit else s[: limit - 1] + "…"


def render_qr_poster(*, url: str, brand_name: str, headline: str) -> Image.Image:
    size = IMAGE_SIZES[QR_FORMAT]
    w, h = size
    pal = brand_palette(brand_name, None)
    img = render_scene(size, brand_name=brand_name, style=None, seed=stable_seed("qr", brand_name.casefold(), url))
    img = Image.blend(img, Image.new("RGB", size, (8, 8, 12)), 0.35).convert("RGBA")
    d = ImageDraw.Draw(img)
    m = round(w * 0.074)

    # monogram
    dia = round(w * 0.075)
    d.ellipse((m, m, m + dia, m + dia), fill=(*pal.accent, 255))
    ini = _initials(brand_name)
    ini_size = round(dia * (0.4 if len(ini) > 1 else 0.48))
    d.text((m + dia / 2, m + dia / 2), ini, font=label_fonts(ini).for_word(ini, ini_size), fill=WHITE, anchor="mm")

    # headline, centred per line
    head = headline.strip() or f"Loved {brand_name}? Tell others."
    top, head_bottom = m * 2 + dia * 0.4, h * 0.3
    fitted = fit_text(head, headline_fonts(head), w - 2 * m, head_bottom - top, 3, round(w * 0.075), round(w * 0.04))
    y = head_bottom - fitted.height
    first = fitted.size * (1.05 if has_devanagari(head) else 0.86)
    for i, words in enumerate(fitted.lines):
        lw = _width(words, fitted.fonts, fitted.size)
        _draw_words(d, (w - lw) / 2, y + first + i * fitted.line_h, words, fitted.fonts, fitted.size, WHITE)

    # QR card
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, border=0, box_size=20)
    qr.add_data(url)
    qr.make(fit=True)
    code = qr.make_image(fill_color=(12, 12, 16), back_color="white").get_image().convert("RGB")
    card = round(w * 0.56)
    pad = round(card * 0.08)
    code = code.resize((card - 2 * pad, card - 2 * pad), Image.Resampling.NEAREST)
    cx0, cy0 = (w - card) // 2, round(h * 0.34)
    d.rounded_rectangle((cx0, cy0, cx0 + card, cy0 + card), radius=round(card * 0.06), fill=WHITE)
    img.paste(code, (cx0 + pad, cy0 + pad))
    d.rectangle((cx0 + card * 0.3, cy0 + card - 4, cx0 + card * 0.7, cy0 + card + 6), fill=(*pal.accent, 255))

    # brand name + short URL
    by = cy0 + card + round(h * 0.07)
    bsize = round(w * 0.045)
    bfonts: FontSet = label_fonts(brand_name)
    words = brand_name.split() or [brand_name]
    bw = _width(words, bfonts, bsize)
    _draw_words(d, (w - bw) / 2, by, words, bfonts, bsize, WHITE)
    usize = round(w * 0.028)
    ufont = _font(SANS_REGULAR, usize)
    short = _short_url(url)
    d.text(((w - ufont.getlength(short)) / 2, by + bsize * 1.1), short, font=ufont, fill=(*WHITE, 200), anchor="ls")
    return img.convert("RGB")


def make_qr_poster(*, campaign_id: str, url: str, brand_name: str, headline: str) -> Asset:
    """Render and save a QR poster (portrait, 1080×1350). Provider is always "template"."""
    if not url.strip():
        raise ValueError("url is required for a QR poster")
    media_dir(campaign_id)
    img = render_qr_poster(url=url.strip(), brand_name=brand_name, headline=headline)
    asset_id = new_asset_id()
    rel = save_png(img, campaign_id, asset_id)
    return Asset(
        asset_id=asset_id,
        format=QR_FORMAT,
        path=rel,
        provider="template",
        prompt=f"qr:{url.strip()}",
        seed=None,
        overlay_text=headline,
        created_at=now_iso(),
    )

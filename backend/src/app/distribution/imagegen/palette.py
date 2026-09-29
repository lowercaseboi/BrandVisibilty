"""Brand palette derived deterministically from the brand name (+ optional style).

Used by the offline template scenes and by the compositor (accent bar, monogram tag), so a
brand's creatives share one colour identity even when the base image comes from a hosted model.
"""

from __future__ import annotations

import colorsys
from dataclasses import dataclass

from app.distribution.imagegen.base import stable_seed

RGB = tuple[int, int, int]


@dataclass(frozen=True)
class Palette:
    bg_a: RGB  # gradient start (deep)
    bg_b: RGB  # gradient end
    glows: tuple[RGB, RGB, RGB]  # soft light blobs
    accent: RGB  # accent bar / tag / motif highlight
    motif: RGB  # line work
    shade: RGB  # near-black tinted with the brand hue: scrim / vignette colour
    light_scene: bool  # True when the scene is light (minimal style)


def _hls(h: float, l: float, s: float) -> RGB:  # noqa: E741 - HLS naming
    r, g, b = colorsys.hls_to_rgb(h % 1.0, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return round(r * 255), round(g * 255), round(b * 255)


def brand_palette(brand_name: str, style: str | None = None) -> Palette:
    key = (brand_name or "brand").strip().casefold()
    seed = stable_seed("palette", key)
    hue = (seed % 360) / 360.0
    shift = ((seed >> 9) % 5 - 2) * 0.02  # small per-brand variation in the analogous step
    style_key = (style or "").strip().lower()

    sat, deep, mid = 0.62, 0.13, 0.24
    accent_hue = hue + 0.5 if (seed >> 3) % 2 else hue - 0.14
    light_scene = False
    step = 0.07 + shift
    if style_key == "warm":
        hue = (seed % 32) / 360.0  # reds → deep oranges
        accent_hue = 0.11  # saffron/amber accent
        step = 0.035
    elif style_key == "festive":
        hue = (0.07, 0.92, 0.97)[seed % 3]  # saffron / magenta / rose
        accent_hue = 0.12
        sat = 0.8
    elif style_key == "vibrant":
        sat, deep, mid = 0.85, 0.16, 0.32
    elif style_key == "dark":
        sat, deep, mid = 0.45, 0.07, 0.14
    elif style_key == "minimal":
        sat, deep, mid = 0.22, 0.90, 0.82
        light_scene = True

    if light_scene:
        return Palette(
            bg_a=_hls(hue, deep, sat),
            bg_b=_hls(hue + step, mid, sat + 0.05),
            glows=(_hls(hue, 0.72, 0.45), _hls(hue + step, 0.78, 0.4), _hls(accent_hue, 0.7, 0.5)),
            accent=_hls(accent_hue, 0.45, 0.65),
            motif=_hls(hue, 0.35, 0.3),
            shade=_hls(hue, 0.07, 0.35),
            light_scene=True,
        )
    return Palette(
        bg_a=_hls(hue, deep, sat),
        bg_b=_hls(hue + step, mid, sat),
        glows=(_hls(hue, 0.55, sat + 0.2), _hls(hue + step * 1.6, 0.5, sat + 0.15), _hls(accent_hue, 0.58, 0.8)),
        accent=_hls(accent_hue, 0.58, 0.78),
        motif=_hls(hue + step, 0.78, 0.5),
        shade=_hls(hue, 0.045, 0.4),
        light_scene=False,
    )

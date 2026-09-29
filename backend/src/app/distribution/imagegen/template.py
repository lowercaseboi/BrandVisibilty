"""Offline template scenes: layered gradients, soft light, one geometric motif and film grain.

Always available, needs no network or key, and is fully deterministic: the same (brand, style,
seed, size) gives byte-identical PNGs. Used last in the fallback chain, for demos and tests.

Layout awareness: the compositor puts text at the bottom (square/portrait/story/gbp) or on the left
(landscape), so the motif and brightest light sit top/right and the text zone stays calm.
"""

from __future__ import annotations

import io
import math
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from app.distribution.imagegen.palette import RGB, Palette, brand_palette

MOTIFS = ("orbits", "arches", "waves", "sun")


def _linear_gradient(size: tuple[int, int], a: RGB, b: RGB, angle_deg: float) -> Image.Image:
    w, h = size
    # Pillow's linear_gradient is a 256×256 vertical ramp; rotate/scale it to the requested angle.
    ramp = Image.linear_gradient("L").resize((256, 256))
    diag = int(math.hypot(w, h)) + 4
    ramp = ramp.resize((diag, diag), Image.Resampling.BILINEAR).rotate(angle_deg, resample=Image.Resampling.BILINEAR)
    left, top = (diag - w) // 2, (diag - h) // 2
    mask = ramp.crop((left, top, left + w, top + h))
    return Image.composite(Image.new("RGB", size, b), Image.new("RGB", size, a), mask)


def _glows(size: tuple[int, int], pal: Palette, rng: random.Random, landscape: bool) -> Image.Image:
    """Big blurred colour blobs, rendered at 1/4 scale (the blur hides it) for speed."""
    w, h = size
    sw, sh = max(1, w // 4), max(1, h // 4)
    layer = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    # Anchor points biased away from the text zone.
    if landscape:
        anchors = [(0.78, 0.3), (0.95, 0.85), (0.5, 0.05), (0.2, 0.95)]
    else:
        anchors = [(0.8, 0.18), (0.15, 0.08), (0.95, 0.55), (0.3, 0.7)]
    for i, (ax, ay) in enumerate(anchors):
        colour = pal.glows[i % len(pal.glows)]
        cx = (ax + rng.uniform(-0.1, 0.1)) * sw
        cy = (ay + rng.uniform(-0.08, 0.08)) * sh
        r = rng.uniform(0.28, 0.45) * max(sw, sh) * (0.7 if i == 3 else 1.0)
        alpha = int(rng.uniform(150, 210) if i < 3 else 90)
        draw.ellipse((cx - r, cy - r * 0.85, cx + r, cy + r * 0.85), fill=(*colour, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=max(sw, sh) * 0.09))
    return layer.resize(size, Image.Resampling.BICUBIC)


def _motif(size: tuple[int, int], pal: Palette, rng: random.Random, motif: str, landscape: bool) -> Image.Image:
    """Crisp line work, supersampled 2× for anti-aliasing."""
    ss = 2
    w, h = size[0] * ss, size[1] * ss
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    unit = min(w, h)
    line = (*pal.motif, 120)
    faint = (*pal.motif, 60)
    accent = (*pal.accent, 235)
    cx, cy = (w * 0.74, h * 0.4) if landscape else (w * 0.72, h * 0.26)

    if motif == "orbits":
        base = unit * rng.uniform(0.2, 0.26)
        for i in range(4):
            r = base * (1 + i * 0.42)
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=line if i % 2 == 0 else faint, width=int(ss * 2.5))
        t = rng.uniform(0, math.tau)
        r = base * 1.42
        px, py = cx + r * math.cos(t), cy + r * math.sin(t)
        dot = unit * 0.022
        d.ellipse((px - dot, py - dot, px + dot, py + dot), fill=accent)
        d.ellipse((cx - base * 0.5, cy - base * 0.5, cx + base * 0.5, cy + base * 0.5), fill=(*pal.accent, 40))
    elif motif == "arches":
        aw = unit * 0.34
        ah = aw * 1.55
        x0 = cx - aw * 0.9
        for i in range(3):
            x = x0 + i * aw * 0.42
            y = cy - ah * 0.55 + i * aw * 0.12
            box = (x, y, x + aw, y + ah)
            if i == 2:
                d.rounded_rectangle(box, radius=aw / 2, fill=(*pal.accent, 70))
            d.rounded_rectangle(box, radius=aw / 2, outline=line, width=int(ss * 2.5))
    elif motif == "waves":
        amp = unit * 0.03
        period = unit * rng.uniform(0.45, 0.6)
        top = h * (0.12 if not landscape else 0.2)
        for i in range(7):
            y0 = top + i * unit * 0.045
            pts = [(x, y0 + amp * math.sin(x / period * math.tau + i * 0.5)) for x in range(int(w * 0.35), w + 20, 12)]
            d.line(pts, fill=line if i % 3 == 0 else faint, width=int(ss * 2.5), joint="curve")
        r = unit * 0.05
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=accent)
    else:  # "sun": a half disc with rays, a warm nod to signage
        r = unit * 0.2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*pal.accent, 90))
        for k in range(24):
            t = k / 24 * math.tau
            r1, r2 = r * 1.25, r * (1.55 if k % 2 == 0 else 1.4)
            d.line(
                (cx + r1 * math.cos(t), cy + r1 * math.sin(t), cx + r2 * math.cos(t), cy + r2 * math.sin(t)),
                fill=line,
                width=int(ss * 2.5),
            )

    # A small dot grid, a common print-design accent, in a corner away from the text.
    gx, gy = (w * 0.06, h * 0.08) if not landscape else (w * 0.58, h * 0.08)
    step = unit * 0.028
    dot = ss * 2.4
    for i in range(5):
        for j in range(4):
            x, y = gx + i * step, gy + j * step
            d.ellipse((x - dot, y - dot, x + dot, y + dot), fill=faint)
    return layer.resize(size, Image.Resampling.LANCZOS)


def _vignette(size: tuple[int, int], strength: int) -> Image.Image:
    mask = Image.radial_gradient("L").resize(size, Image.Resampling.BICUBIC)
    return mask.point(lambda v: min(255, int(max(0, v - 70) * strength / 185)))


def _grain(img: Image.Image, rng: random.Random, amount: float = 5.0) -> Image.Image:
    tile = Image.new("L", (256, 256))
    tile.putdata([max(0, min(255, int(128 + rng.gauss(0, amount)))) for _ in range(256 * 256)])
    noise = Image.new("L", img.size)
    for x in range(0, img.size[0], 256):
        for y in range(0, img.size[1], 256):
            noise.paste(tile, (x, y))
    noise_rgb = Image.merge("RGB", (noise, noise, noise))
    return ImageChops.add(img, noise_rgb, scale=1.0, offset=-128)


def render_scene(size: tuple[int, int], *, brand_name: str, style: str | None, seed: int) -> Image.Image:
    rng = random.Random(seed)
    pal = brand_palette(brand_name, style)
    landscape = size[0] > size[1] * 1.4
    angle = rng.uniform(20, 70) if not landscape else rng.uniform(-20, 20)
    img = _linear_gradient(size, pal.bg_a, pal.bg_b, angle).convert("RGBA")
    img.alpha_composite(_glows(size, pal, rng, landscape))
    motif = MOTIFS[rng.randrange(len(MOTIFS))]
    img.alpha_composite(_motif(size, pal, rng, motif, landscape))
    img = img.convert("RGB")
    img = Image.composite(Image.new("RGB", size, pal.shade), img, _vignette(size, 110 if not pal.light_scene else 50))
    return _grain(img, rng)


class TemplateProvider:
    """Offline provider; never fails. Ignores the prompt text (it only seeds variety)."""

    name = "template"

    def generate(
        self,
        prompt: str,
        size: tuple[int, int],
        seed: int | None,
        *,
        brand_name: str = "",
        style: str | None = None,
    ) -> bytes:
        img = render_scene(size, brand_name=brand_name, style=style, seed=seed or 0)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

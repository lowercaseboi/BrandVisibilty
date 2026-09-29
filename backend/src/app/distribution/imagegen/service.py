"""`generate_asset`: provider fallback chain → compositor → PNG on disk → `Asset`.

Providers are tried in `IMAGE_PROVIDERS` order (default "gemini,cloudflare,template"). Any provider
failure — missing key, HTTP error, quota (429), timeout, blocked prompt, undecodable image — is
logged and the next provider is tried. `template` is always appended as the last resort and cannot
fail, so callers never see a provider exception; only programmer errors (unknown format, unsafe
campaign id) raise.

Seeds: `seed=None` derives a stable seed from (brand, prompt, style, format), so the same inputs
reproduce the same template image; pass a new seed to get a different image ("regenerate").
The seed actually used is stored on the Asset.
"""

from __future__ import annotations

import io
import logging
import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

import app.paths as paths
from app.config.settings import Settings
from app.distribution.imagegen.base import ImageProvider, ProviderUnavailable, harden_prompt, stable_seed
from app.distribution.imagegen.cloudflare import CloudflareProvider
from app.distribution.imagegen.compositor import compose
from app.distribution.imagegen.gemini import GeminiProvider
from app.distribution.imagegen.template import TemplateProvider
from app.distribution.types import IMAGE_SIZES, Asset, ImageFormat

log = logging.getLogger(__name__)

DEFAULT_PROVIDERS = "gemini,cloudflare,template"
KNOWN_PROVIDERS = ("gemini", "cloudflare", "template")
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")

# Tests may point hosted providers at an httpx.MockTransport.
_TRANSPORT: httpx.BaseTransport | None = None

MAX_IMAGE_PIXELS = 40_000_000  # refuse absurd decodes from a misbehaving provider


def build_providers(names: str | None = None, *, transport: httpx.BaseTransport | None = None) -> list[ImageProvider]:
    """Provider chain from config; unknown names are ignored, `template` is always last."""
    s = Settings()
    names = names if names is not None else (getattr(s, "image_providers", None) or DEFAULT_PROVIDERS)
    transport = transport if transport is not None else _TRANSPORT
    chain: list[ImageProvider] = []
    seen: set[str] = set()
    for raw in names.split(","):
        name = raw.strip().lower()
        if not name or name in seen or name == "template":
            continue
        seen.add(name)
        if name == "gemini":
            chain.append(
                GeminiProvider(
                    getattr(s, "gemini_api_key", None),
                    getattr(s, "gemini_image_model", None),
                    transport=transport,
                )
            )
        elif name == "cloudflare":
            chain.append(
                CloudflareProvider(
                    getattr(s, "cloudflare_account_id", None),
                    getattr(s, "cloudflare_api_token", None),
                    getattr(s, "cloudflare_image_model", None),
                    transport=transport,
                )
            )
        else:
            log.warning("imagegen: unknown provider %r in IMAGE_PROVIDERS, ignored", name)
    chain.append(TemplateProvider())
    return chain


def _decode(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    if img.width * img.height > MAX_IMAGE_PIXELS:
        raise ValueError("image too large")
    img.load()
    return img.convert("RGB")


def render_base(
    prompt: str,
    size: tuple[int, int],
    seed: int,
    *,
    brand_name: str,
    style: str | None,
    providers: Sequence[ImageProvider],
) -> tuple[Image.Image, str]:
    """First provider that returns a decodable image wins. Returns (image, provider name)."""
    model_prompt = harden_prompt(prompt, style)
    for provider in providers:
        try:
            data = provider.generate(model_prompt, size, seed, brand_name=brand_name, style=style)
            return _decode(data), provider.name
        except ProviderUnavailable as exc:
            log.debug("imagegen: %s skipped (%s)", provider.name, exc)
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            log.warning("imagegen: %s returned an unusable image (%s); falling back", provider.name, exc)
        except Exception as exc:  # noqa: BLE001 - any provider failure means "try the next one"
            log.warning("imagegen: %s failed (%s); falling back", provider.name, exc)
    # Only reachable if a custom chain lacks the template provider.
    template = TemplateProvider()
    return _decode(template.generate(model_prompt, size, seed, brand_name=brand_name, style=style)), template.name


def media_dir(campaign_id: str) -> Path:
    if not _SAFE_ID.match(campaign_id):
        raise ValueError(f"unsafe campaign_id: {campaign_id!r}")
    return paths.DATA_DIR / "media" / campaign_id


JPEG_QUALITY = 92


def save_png(img: Image.Image, campaign_id: str, asset_id: str) -> str:
    """Write `<asset_id>.png` plus a `<asset_id>.jpg` sibling (Instagram feed accepts JPEG only)."""
    folder = media_dir(campaign_id)
    folder.mkdir(parents=True, exist_ok=True)
    img.save(folder / f"{asset_id}.png", format="PNG")
    img.convert("RGB").save(folder / f"{asset_id}.jpg", format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return f"{campaign_id}/{asset_id}.png"


def jpeg_path_for(asset: Asset) -> Path:
    """Absolute path of the asset's JPEG sibling (same stem, `.jpg`), created from the PNG if missing.

    `generate_asset` / `make_qr_poster` already write it; this also covers assets saved before the
    sibling existed. Raises FileNotFoundError if the PNG itself is gone."""
    png = paths.DATA_DIR / "media" / asset.path
    jpg = png.with_suffix(".jpg")
    if not jpg.is_file():
        with Image.open(png) as img:
            img.convert("RGB").save(jpg, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return jpg


def new_asset_id() -> str:
    return uuid.uuid4().hex[:12]


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def generate_asset(
    *,
    campaign_id: str,
    prompt: str,
    format: ImageFormat,  # noqa: A002 - public contract name
    overlay_text: str | None,
    brand_name: str,
    seed: int | None = None,
    style: str | None = None,
    providers: Sequence[ImageProvider] | None = None,
) -> Asset:
    """Generate one composited PNG under DATA_DIR/media/<campaign_id>/ and describe it."""
    if format not in IMAGE_SIZES:
        raise ValueError(f"unknown image format: {format!r}")
    media_dir(campaign_id)  # validate before spending a provider call
    size = IMAGE_SIZES[format]
    eff_seed = seed if seed is not None else stable_seed(brand_name.casefold(), prompt, style or "", format)
    chain = list(providers) if providers is not None else build_providers()
    base, provider_name = render_base(prompt, size, eff_seed, brand_name=brand_name, style=style, providers=chain)
    final = compose(base, format, overlay_text=overlay_text, brand_name=brand_name, style=style)
    asset_id = new_asset_id()
    rel = save_png(final, campaign_id, asset_id)
    return Asset(
        asset_id=asset_id,
        format=format,
        path=rel,
        provider=provider_name,
        prompt=prompt,
        seed=eff_seed,
        overlay_text=overlay_text,
        created_at=now_iso(),
    )

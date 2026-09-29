"""Campaign image generation: hosted model (or offline template) scene + our own text overlay.

Public API:

    from app.distribution.imagegen import generate_asset, make_qr_poster

    generate_asset(*, campaign_id, prompt, format, overlay_text, brand_name, seed=None, style=None) -> Asset
    make_qr_poster(*, campaign_id, url, brand_name, headline) -> Asset

Providers (`IMAGE_PROVIDERS`, default "gemini,cloudflare,template") are tried in order; failures
fall back to the next and the offline `template` provider always succeeds. Files land at
`DATA_DIR/media/<campaign_id>/<asset_id>.png` plus a `.jpg` sibling (Instagram needs JPEG;
`jpeg_path_for(asset)` returns it, creating it if missing); `Asset.path` is relative to
`DATA_DIR/media`.
Fonts (OFL, see fonts/OFL.txt): Noto Sans, Noto Sans Devanagari, Poppins.
"""

from app.distribution.imagegen.base import (
    STYLE_PROMPTS,
    ImageProvider,
    ProviderError,
    ProviderUnavailable,
    harden_prompt,
)
from app.distribution.imagegen.compositor import RAQM_AVAILABLE, compose, cover_crop
from app.distribution.imagegen.qr import make_qr_poster
from app.distribution.imagegen.service import build_providers, generate_asset, jpeg_path_for

__all__ = [
    "RAQM_AVAILABLE",
    "STYLE_PROMPTS",
    "ImageProvider",
    "ProviderError",
    "ProviderUnavailable",
    "build_providers",
    "compose",
    "cover_crop",
    "generate_asset",
    "harden_prompt",
    "jpeg_path_for",
    "make_qr_poster",
]

"""Provider protocol shared by every image backend.

A provider turns a prompt into the *base scene* only — never text. Image models cannot render
text reliably (Devanagari least of all), so headline, brand name and tag are drawn afterwards by
our own compositor (`compositor.py`).
"""

from __future__ import annotations

import hashlib
from typing import Protocol, runtime_checkable

import httpx

# Every request to a hosted model gets this suffix. The compositor owns all text on the image.
NO_TEXT_SUFFIX = "no text, no letters, no logos, no watermark"

# Hosted image models take 5-40 s; anything past this counts as a failure and we fall back.
DEFAULT_TIMEOUT_S = 60.0

# Style presets: a prompt suffix for the hosted models. The template provider also reads the key
# (see palette.py). Unknown styles are passed through as free text.
STYLE_PROMPTS: dict[str, str] = {
    "photo": "professional product photography, natural light, shallow depth of field, rich colour",
    "vibrant": "bold vibrant colours, energetic composition, high contrast, modern advertising look",
    "minimal": "minimal clean composition, generous negative space, soft even lighting, muted palette",
    "warm": "warm golden-hour tones, inviting and cosy atmosphere, soft shadows",
    "dark": "moody low-key lighting, deep rich shadows, premium luxury feel",
    "festive": "festive celebratory mood, warm lights, Indian festival colours, joyful",
    "illustration": "flat vector illustration, clean shapes, modern editorial style",
}


class ProviderError(Exception):
    """A provider could not produce an image (HTTP error, quota, timeout, bad payload…).

    `generate_asset` catches this (and any other exception from a hosted provider) and falls back
    to the next provider in `IMAGE_PROVIDERS` order."""


class ProviderUnavailable(ProviderError):
    """The provider is not configured (missing API key / account id). Skipped quietly."""


@runtime_checkable
class ImageProvider(Protocol):
    name: str

    def generate(
        self,
        prompt: str,
        size: tuple[int, int],
        seed: int | None,
        *,
        brand_name: str = "",
        style: str | None = None,
    ) -> bytes:
        """Return encoded image bytes (PNG/JPEG/WebP). `size` is the final target; providers may
        return any size near its aspect ratio — the compositor cover-crops to the exact size."""
        ...


def harden_prompt(prompt: str, style: str | None) -> str:
    """Prompt sent to hosted models: user/LLM prompt + style preset + the no-text suffix."""
    parts = [prompt.strip().rstrip(".")]
    if style:
        parts.append(STYLE_PROMPTS.get(style.strip().lower(), style.strip()))
    parts.append(NO_TEXT_SUFFIX)
    return ", ".join(p for p in parts if p)


def stable_seed(*parts: object) -> int:
    """Deterministic 31-bit seed from the inputs (same inputs → same image, across processes)."""
    digest = hashlib.sha256("\x1f".join(str(p) for p in parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


def make_client(transport: httpx.BaseTransport | None, timeout: float) -> httpx.Client:
    return httpx.Client(transport=transport, timeout=httpx.Timeout(timeout, connect=10.0))


def describe_http_error(exc: httpx.HTTPStatusError) -> str:
    """Short, key-free error text (never echo request headers/URLs that may carry tokens)."""
    body = exc.response.text[:200].replace("\n", " ") if exc.response is not None else ""
    return f"HTTP {exc.response.status_code}: {body}"

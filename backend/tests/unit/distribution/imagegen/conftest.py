from __future__ import annotations

import base64
import io

import httpx
import pytest
from PIL import Image

import app.paths as paths
from app.distribution.imagegen import service


def png_bytes(colour=(200, 40, 90), size=(96, 64)) -> bytes:
    img = Image.new("RGB", size, colour)
    img.paste((20, 20, 20), (0, 0, size[0] // 2, size[1] // 2))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def b64_png(**kw) -> str:
    return base64.b64encode(png_bytes(**kw)).decode()


@pytest.fixture
def make_b64_png():
    return b64_png


@pytest.fixture
def make_png():
    return png_bytes


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    """Temp DATA_DIR, no real network, no real keys from the developer's .env."""
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)

    def offline(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"unexpected network call in tests: {request.url.host}")

    monkeypatch.setattr(service, "_TRANSPORT", httpx.MockTransport(offline))
    monkeypatch.setenv("IMAGE_PROVIDERS", "template")
    # Real env vars beat .env files, so blanking them keeps the developer's keys out of tests
    # (blank means "unset" in Settings).
    for name in ("GEMINI_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"):
        monkeypatch.setenv(name, "")
    return tmp_path

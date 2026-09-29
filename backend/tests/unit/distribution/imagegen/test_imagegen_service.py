from __future__ import annotations

import json

import httpx
import pytest
from PIL import Image

from app.distribution.imagegen import generate_asset, jpeg_path_for, make_qr_poster, service
from app.distribution.imagegen.base import NO_TEXT_SUFFIX
from app.distribution.types import IMAGE_SIZES


def _open(data_dir, asset):
    return Image.open(data_dir / "media" / asset.path)


def _router(*, gemini: httpx.Response | Exception, cloudflare: httpx.Response | Exception, calls: list):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        outcome = gemini if request.url.host == "generativelanguage.googleapis.com" else cloudflare
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return httpx.MockTransport(handler)


@pytest.fixture
def hosted_env(monkeypatch):
    monkeypatch.setenv("IMAGE_PROVIDERS", "gemini,cloudflare,template")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "cf-token")


# --- files, sizes, determinism -------------------------------------------------------------------


@pytest.mark.parametrize("fmt", list(IMAGE_SIZES))
def test_each_format_has_exact_size_and_is_written_under_data_dir(isolated, fmt):
    asset = generate_asset(
        campaign_id="camp1",
        prompt="fresh vada pav on a steel plate",
        format=fmt,
        overlay_text="Mumbai's favourite since 1978",
        brand_name="Gajanan Vada Pav",
    )
    assert asset.format == fmt
    assert asset.provider == "template"
    assert asset.path == f"camp1/{asset.asset_id}.png"
    file = isolated / "media" / asset.path
    assert file.is_file()
    img = Image.open(file)
    assert img.format == "PNG"
    assert img.size == IMAGE_SIZES[fmt]
    assert asset.seed is not None and asset.created_at


def test_template_is_deterministic_for_same_inputs(isolated):
    kw = dict(campaign_id="c", prompt="p", format="square", overlay_text="Hello", brand_name="Mayekar", style="warm")
    a, b = generate_asset(**kw), generate_asset(**kw)
    assert a.asset_id != b.asset_id  # new file each time …
    assert (isolated / "media" / a.path).read_bytes() == (isolated / "media" / b.path).read_bytes()  # … same pixels
    c = generate_asset(**{**kw, "seed": 12345})
    assert (isolated / "media" / c.path).read_bytes() != (isolated / "media" / a.path).read_bytes()


def test_different_brands_get_different_palettes(isolated):
    kw = dict(campaign_id="c", prompt="p", format="square", overlay_text=None, seed=7)
    a = generate_asset(**kw, brand_name="Perfume Co")
    b = generate_asset(**kw, brand_name="Gajanan Vada Pav")
    assert _open(isolated, a).getpixel((540, 200)) != _open(isolated, b).getpixel((540, 200))


def test_programmer_errors_raise(isolated):
    with pytest.raises(ValueError):
        generate_asset(campaign_id="../etc", prompt="p", format="square", overlay_text=None, brand_name="b")
    with pytest.raises(ValueError):
        generate_asset(campaign_id="c", prompt="p", format="banner", overlay_text=None, brand_name="b")  # type: ignore[arg-type]


# --- provider fallback ---------------------------------------------------------------------------


def test_gemini_fails_then_cloudflare_succeeds(isolated, hosted_env, monkeypatch, make_b64_png):
    calls: list[httpx.Request] = []
    transport = _router(
        gemini=httpx.Response(429, json={"error": {"message": "quota exhausted"}}),
        cloudflare=httpx.Response(200, json={"success": True, "result": {"image": make_b64_png()}}),
        calls=calls,
    )
    monkeypatch.setattr(service, "_TRANSPORT", transport)
    asset = generate_asset(
        campaign_id="c", prompt="a bottle of attar", format="portrait", overlay_text="New", brand_name="Perfume Co", seed=42
    )
    assert asset.provider == "cloudflare"
    assert [r.url.host for r in calls] == ["generativelanguage.googleapis.com", "api.cloudflare.com"]

    gem, cf = calls
    assert gem.headers["x-goog-api-key"] == "test-gemini-key"
    assert "test-gemini-key" not in str(gem.url)
    gem_body = json.loads(gem.content)
    assert NO_TEXT_SUFFIX in gem_body["contents"][0]["parts"][0]["text"]
    assert gem_body["generationConfig"]["imageConfig"]["aspectRatio"] == "4:5"

    assert cf.url.path == "/client/v4/accounts/acct123/ai/run/@cf/black-forest-labs/flux-1-schnell"
    assert cf.headers["authorization"] == "Bearer cf-token"
    cf_body = json.loads(cf.content)
    assert cf_body["seed"] == 42 and cf_body["steps"] >= 1 and NO_TEXT_SUFFIX in cf_body["prompt"]
    assert Image.open(isolated / "media" / asset.path).size == IMAGE_SIZES["portrait"]


def test_gemini_success_uses_inline_image(isolated, hosted_env, monkeypatch, make_b64_png):
    calls: list[httpx.Request] = []
    ok = {"candidates": [{"content": {"parts": [{"text": "here"}, {"inlineData": {"mimeType": "image/png", "data": make_b64_png()}}]}}]}
    monkeypatch.setattr(
        service, "_TRANSPORT", _router(gemini=httpx.Response(200, json=ok), cloudflare=AssertionError("unused"), calls=calls)
    )
    asset = generate_asset(campaign_id="c", prompt="p", format="landscape", overlay_text="Hi", brand_name="B")
    assert asset.provider == "gemini"
    assert len(calls) == 1


def test_both_hosted_fail_falls_back_to_template(isolated, hosted_env, monkeypatch):
    calls: list[httpx.Request] = []
    transport = _router(
        gemini=httpx.ReadTimeout("slow"),
        cloudflare=httpx.Response(200, json={"success": False, "errors": [{"message": "daily limit"}]}),
        calls=calls,
    )
    monkeypatch.setattr(service, "_TRANSPORT", transport)
    asset = generate_asset(campaign_id="c", prompt="p", format="story", overlay_text="Hi", brand_name="B")
    assert asset.provider == "template"
    assert len(calls) == 2
    assert Image.open(isolated / "media" / asset.path).size == IMAGE_SIZES["story"]


def test_garbage_image_payload_falls_back(isolated, hosted_env, monkeypatch):
    calls: list[httpx.Request] = []
    bad = {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/png", "data": "bm90IGFuIGltYWdl"}}]}}]}
    transport = _router(
        gemini=httpx.Response(200, json=bad),
        cloudflare=httpx.Response(200, content=b"\x89PNG broken", headers={"content-type": "image/png"}),
        calls=calls,
    )
    monkeypatch.setattr(service, "_TRANSPORT", transport)
    asset = generate_asset(campaign_id="c", prompt="p", format="gbp", overlay_text=None, brand_name="B")
    assert asset.provider == "template"


def test_missing_keys_skip_hosted_providers_without_network(isolated, monkeypatch):
    monkeypatch.setenv("IMAGE_PROVIDERS", "gemini,cloudflare")  # template is appended automatically
    asset = generate_asset(campaign_id="c", prompt="p", format="square", overlay_text=None, brand_name="B")
    assert asset.provider == "template"  # the autouse transport would fail the test on any request


def test_build_providers_order_and_template_last():
    names = [p.name for p in service.build_providers("cloudflare, gemini ,bogus,template,gemini")]
    assert names == ["cloudflare", "gemini", "template"]


def test_cloudflare_raw_png_response(isolated, hosted_env, monkeypatch, make_png):
    monkeypatch.setenv("IMAGE_PROVIDERS", "cloudflare")
    calls: list[httpx.Request] = []
    transport = _router(
        gemini=AssertionError("unused"),
        cloudflare=httpx.Response(200, content=make_png(), headers={"content-type": "image/png"}),
        calls=calls,
    )
    monkeypatch.setattr(service, "_TRANSPORT", transport)
    asset = generate_asset(campaign_id="c", prompt="p", format="square", overlay_text=None, brand_name="B")
    assert asset.provider == "cloudflare"


# --- QR poster -----------------------------------------------------------------------------------


def test_qr_poster(isolated):
    asset = make_qr_poster(
        campaign_id="rev1", url="https://g.page/r/abc123/review", brand_name="V.A. Mayekar Opticians", headline="Loved your new glasses?"
    )
    img = Image.open(isolated / "media" / asset.path)
    assert img.size == IMAGE_SIZES["portrait"]
    assert asset.provider == "template" and asset.format == "portrait"
    with pytest.raises(ValueError):
        make_qr_poster(campaign_id="rev1", url=" ", brand_name="b", headline="h")


def test_jpeg_sibling_written_and_recreated_on_demand(isolated):
    asset = generate_asset(campaign_id="c", prompt="p", format="square", overlay_text="Hi", brand_name="B")
    png = isolated / "media" / asset.path
    jpg = png.with_suffix(".jpg")
    assert jpg.is_file()
    assert jpeg_path_for(asset) == jpg
    jpg.unlink()
    again = jpeg_path_for(asset)
    with Image.open(again) as img:
        assert img.format == "JPEG" and img.size == IMAGE_SIZES["square"]

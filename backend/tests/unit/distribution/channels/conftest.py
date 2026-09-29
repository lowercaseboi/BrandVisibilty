from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

import app.paths as paths
from app.distribution.types import Campaign, Variant

FULL = dict(
    meta_page_id="111",
    meta_page_token="PAGE-TOKEN-SECRET",
    ig_user_id="222",
    meta_graph_version="v21.0",
    x_api_key="ck",
    x_api_secret="cs",
    x_access_token="at",
    x_access_secret="as",
    x_monthly_post_limit=500,
    gbp_account_id="333",
    gbp_location_id="444",
    gbp_access_token="GBP-TOKEN-SECRET",
    public_base_url="https://brandviz.example.com",
)


def make_settings(**overrides: Any) -> SimpleNamespace:
    return SimpleNamespace(**{**FULL, **overrides})


def make_campaign() -> Campaign:
    return Campaign(
        campaign_id="cmp1",
        brand_key="perfume",
        recommendation_id="rec1",
        gap_id="gap1",
        action="faq_page",
        suggestion_key="faq_page|",
        status="approved",
        created_at="2026-09-01T00:00:00Z",
        updated_at="2026-09-01T00:00:00Z",
    )


def make_variant(channel: str = "facebook_page", **kw: Any) -> Variant:
    base: dict[str, Any] = dict(channel=channel, text="Fresh attars, made in Pune.", hashtags=["attar", "#Pune"])
    base.update(kw)
    return Variant(**base)


class Recorder:
    """MockTransport handler that records requests and answers from a list of (matcher, response)."""

    def __init__(self, routes: list[tuple[Callable[[httpx.Request], bool], Callable[[httpx.Request], httpx.Response]]]):
        self.routes = routes
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        request.read()
        self.requests.append(request)
        for match, respond in self.routes:
            if match(request):
                return respond(request)
        return httpx.Response(404, json={"error": {"message": f"no route for {request.method} {request.url}"}})

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self))


def route(method: str, path_suffix: str) -> Callable[[httpx.Request], bool]:
    return lambda r: r.method == method and r.url.path.endswith(path_suffix)


@pytest.fixture(name="make_settings")
def _make_settings_fixture() -> Callable[..., SimpleNamespace]:
    return make_settings


@pytest.fixture(name="make_variant")
def _make_variant_fixture() -> Callable[..., Variant]:
    return make_variant


@pytest.fixture
def campaign() -> Campaign:
    return make_campaign()


@pytest.fixture
def recorder() -> Callable[..., Recorder]:
    return Recorder


@pytest.fixture
def data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def image(tmp_path: Path) -> Path:
    p = tmp_path / "img.png"
    p.write_bytes(b"\x89PNG\r\n\x1a\nfake")
    return p

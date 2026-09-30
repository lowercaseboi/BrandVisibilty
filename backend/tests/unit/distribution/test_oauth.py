"""OAuth Connect flows: signed state, return_to, callbacks (mocked token exchanges), refresh, logs."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

import app.paths as paths
from app.distribution import accounts, oauth
from app.distribution.channels import get_adapter
from tests.unit.distribution.channels.conftest import make_campaign, make_variant

BRAND = "perfume"
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
SECRETS = ("APP-SECRET-XYZ", "SHORT-USER-TOKEN", "LONG-USER-TOKEN", "PAGE-TOKEN-A", "PAGE-TOKEN-B",
           "LI-ACCESS-TOKEN", "X-BEARER-1", "X-REFRESH-1", "X-BEARER-2", "X-REFRESH-2", "G-ACCESS-1", "G-REFRESH-1", "AUTHCODE-123")


def make_settings(**kw: Any) -> SimpleNamespace:
    base: dict[str, Any] = dict(
        secret_key="test-secret-key-0123456789",
        oauth_redirect_base="https://api.example.com",
        frontend_base_url="https://app.example.com",
        meta_app_id="meta-app", meta_app_secret="APP-SECRET-XYZ", meta_graph_version="v21.0",
        linkedin_client_id="li-app", linkedin_client_secret="APP-SECRET-XYZ", linkedin_api_version="202609",
        x_client_id="x-app", x_client_secret="APP-SECRET-XYZ", x_monthly_post_limit=500,
        google_client_id="g-app", google_client_secret="APP-SECRET-XYZ",
        public_base_url="https://brandviz.example.com",
    )
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


Route = tuple[Callable[[httpx.Request], bool], Callable[[httpx.Request], httpx.Response]]


class Mock:
    def __init__(self, routes: list[Route]) -> None:
        self.routes, self.requests = routes, []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        req.read()
        self.requests.append(req)
        for match, respond in self.routes:
            if match(req):
                return respond(req)
        return httpx.Response(404, json={"error": "no route"})

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self))


def on(method: str, host_path: str) -> Callable[[httpx.Request], bool]:
    return lambda r: r.method == method and (r.url.host + r.url.path).endswith(host_path)


def install(monkeypatch, routes: list[Route]) -> Mock:
    mock = Mock(routes)
    monkeypatch.setattr(oauth, "http_client", mock.client)
    return mock


def start_state(channel: str, s: SimpleNamespace, return_to: str | None = None) -> tuple[str, dict[str, list[str]]]:
    url = oauth.start(BRAND, channel, return_to, settings=s, now=NOW)
    q = parse_qs(urlsplit(url).query)
    return q["state"][0], q


def callback(channel: str, state: str, s: SimpleNamespace, **kw: Any) -> tuple[str, dict[str, list[str]], str]:
    url = oauth.handle_callback(channel, code=kw.pop("code", "AUTHCODE-123"), state=state, settings=s, now=NOW, **kw)
    parts = urlsplit(url)
    return parts.path, parse_qs(parts.query), parts.fragment


# --- state ----------------------------------------------------------------------------------------


def test_state_round_trip_tamper_and_expiry() -> None:
    s = make_settings()
    payload = {"b": BRAND, "c": "x", "n": "n" * 20, "e": int(NOW.timestamp()) + 600, "r": "/brands/perfume/details", "p": None}
    token = oauth.sign_state(payload, s)
    assert oauth.verify_state(token, s, now=NOW) == payload
    body, mac = token.split(".")
    forged = oauth.sign_state({**payload, "b": "other"}, s).split(".")[0] + "." + mac
    for bad in (forged, token[:-2] + ("AA" if not token.endswith("AA") else "BB"), "garbage", "", "a.b.c"):
        with pytest.raises(oauth.OAuthError) as e:
            oauth.verify_state(bad, s, now=NOW)
        assert e.value.reason == "bad_state"
    with pytest.raises(oauth.OAuthError) as e:
        oauth.verify_state(token, make_settings(secret_key="another-key"), now=NOW)
    assert e.value.reason == "bad_state"
    with pytest.raises(oauth.OAuthError) as e:
        oauth.verify_state(token, s, now=NOW + timedelta(minutes=11))
    assert e.value.reason == "expired"


def test_return_to_validation() -> None:
    d = "/brands/perfume/details"
    assert oauth.safe_return_to(BRAND, "/brands/perfume/studio/cmp-1") == "/brands/perfume/studio/cmp-1"
    for bad in (None, "", "https://evil.com/brands/perfume/", "//evil.com", "/brands/other/details", "/brands/perfume",
                "/brands/perfume/../../x", "/brands/perfume/details?x=1", "brands/perfume/details", "/brands/perfume//evil"):
        assert oauth.safe_return_to(BRAND, bad) == d, bad


def test_start_urls_pkce_and_errors(data_dir) -> None:
    s = make_settings()
    _, q = start_state("x", s)
    assert q["code_challenge_method"] == ["S256"] and q["redirect_uri"] == ["https://api.example.com/oauth/x/callback"]
    assert "media.write" in q["scope"][0] and "offline.access" in q["scope"][0]
    _, q = start_state("google_business", s)
    assert q["access_type"] == ["offline"] and "code_challenge" in q and "business.manage" in q["scope"][0]
    _, q = start_state("facebook_page", s)
    assert "code_challenge" not in q and "pages_manage_posts" in q["scope"][0]
    _, q = start_state("linkedin", s)
    assert q["scope"] == ["openid profile w_member_social"]
    _, q = start_state("linkedin", make_settings(linkedin_organization_scopes=True))
    assert "w_organization_social" in q["scope"][0]
    with pytest.raises(oauth.OAuthNotConfigured):
        oauth.start(BRAND, "x", settings=make_settings(x_client_id=None))
    with pytest.raises(oauth.OAuthNotConfigured):
        oauth.start(BRAND, "x", settings=make_settings(oauth_redirect_base=None))
    with pytest.raises(accounts.SecretKeyMissing):
        oauth.start(BRAND, "x", settings=make_settings(secret_key=None))
    assert "APP-SECRET-XYZ" not in oauth.start(BRAND, "facebook_page", settings=s)


def test_state_is_single_use_and_bound_to_channel(monkeypatch) -> None:
    s = make_settings()
    install(monkeypatch, _x_routes())
    state, _ = start_state("x", s)
    _, q, _ = callback("linkedin", state, s)  # state issued for x, used on linkedin's callback
    assert q["connect_error"] == ["linkedin"] and q["reason"] == ["bad_state"]
    state, _ = start_state("x", s)
    _, q, _ = callback("x", state, s)
    assert q == {"connected": ["x"]}
    _, q, _ = callback("x", state, s)  # replay
    assert q["reason"] == ["expired"]


def test_tampered_state_callback_redirects_to_brand_list_with_error() -> None:
    path, q, _ = callback("x", "forged.state", make_settings())
    assert path == "/app" and q == {"connect_error": ["x"], "reason": ["bad_state"]}


def test_user_denied() -> None:
    s = make_settings()
    state, _ = start_state("linkedin", s)
    path, q, frag = callback("linkedin", state, s, code=None, error="access_denied")
    assert path == "/brands/perfume/details" and frag == "accounts"
    assert q == {"connect_error": ["linkedin"], "reason": ["denied"]}


# --- Meta -----------------------------------------------------------------------------------------


def _meta_routes(pages: list[dict[str, Any]], exchange_ok: bool = True) -> list[Route]:
    def token(req: httpx.Request) -> httpx.Response:
        if not exchange_ok:
            return httpx.Response(400, json={"error": {"message": "bad code", "code": 100}})
        if req.url.params.get("grant_type") == "fb_exchange_token":
            assert req.url.params["fb_exchange_token"] == "SHORT-USER-TOKEN"
            return httpx.Response(200, json={"access_token": "LONG-USER-TOKEN", "expires_in": 5183944})
        assert req.url.params["code"] == "AUTHCODE-123"
        assert req.url.params["redirect_uri"].endswith("/oauth/facebook_page/callback") or req.url.params["redirect_uri"].endswith("/oauth/instagram/callback")
        return httpx.Response(200, json={"access_token": "SHORT-USER-TOKEN"})

    def me_accounts(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == "Bearer LONG-USER-TOKEN"
        return httpx.Response(200, json={"data": pages})

    return [(on("GET", "/oauth/access_token"), token), (on("GET", "/me/accounts"), me_accounts)]


PAGE_A = {"id": "101", "name": "Local Perfume Co", "access_token": "PAGE-TOKEN-A",
          "instagram_business_account": {"id": "17841", "username": "localperfume"}}
PAGE_B = {"id": "202", "name": "Second Page", "access_token": "PAGE-TOKEN-B"}


def test_meta_single_page_connects_and_offers_instagram(monkeypatch, data_dir) -> None:
    s = make_settings()
    install(monkeypatch, _meta_routes([PAGE_A]))
    state, _ = start_state("facebook_page", s)
    path, q, frag = callback("facebook_page", state, s)
    assert (path, frag) == ("/brands/perfume/details", "accounts")
    assert q == {"connected": ["facebook_page"], "offer": ["instagram"]}
    creds = accounts.brand_credentials(BRAND, "facebook_page", settings=s)
    assert creds.get("page_token") == "PAGE-TOKEN-A" and creds.account_name == "Local Perfume Co" and creds.method == "oauth"
    assert accounts.pending_choices(BRAND, "instagram") == [
        {"id": "17841", "name": "@localperfume (via Page Local Perfume Co)", "kind": "instagram"}
    ]
    accounts.choose(BRAND, "instagram", "17841", settings=s)
    ig = accounts.brand_credentials(BRAND, "instagram", settings=s)
    assert ig.get("ig_user_id") == "17841" and ig.get("page_token") == "PAGE-TOKEN-A" and ig.account_name == "@localperfume"
    raw = (data_dir / "accounts" / "perfume.json").read_text()
    assert not any(secret in raw for secret in SECRETS)


def test_meta_multiple_pages_needs_a_choice(monkeypatch) -> None:
    s = make_settings()
    install(monkeypatch, _meta_routes([PAGE_A, PAGE_B]))
    state, _ = start_state("facebook_page", s, "/brands/perfume/studio")
    path, q, frag = callback("facebook_page", state, s)
    assert path == "/brands/perfume/studio" and frag == ""
    assert q["connect_choose"] == ["facebook_page"]
    assert [c["id"] for c in accounts.pending_choices(BRAND, "facebook_page")] == ["101", "202"]
    assert accounts.brand_credentials(BRAND, "facebook_page", settings=s) is None
    accounts.choose(BRAND, "facebook_page", "202", settings=s)
    assert accounts.brand_credentials(BRAND, "facebook_page", settings=s).get("page_token") == "PAGE-TOKEN-B"


def test_meta_instagram_without_linked_account_and_exchange_failure(monkeypatch) -> None:
    s = make_settings()
    install(monkeypatch, _meta_routes([PAGE_B]))
    state, _ = start_state("instagram", s)
    _, q, _ = callback("instagram", state, s)
    assert q == {"connect_error": ["instagram"], "reason": ["no_instagram"]}
    install(monkeypatch, _meta_routes([PAGE_A], exchange_ok=False))
    state, _ = start_state("facebook_page", s)
    _, q, _ = callback("facebook_page", state, s)
    assert q == {"connect_error": ["facebook_page"], "reason": ["token_exchange"]}


# --- LinkedIn -------------------------------------------------------------------------------------


def _li_routes(orgs: bool = False) -> list[Route]:
    def token(req: httpx.Request) -> httpx.Response:
        form = parse_qs(req.content.decode())
        assert form["grant_type"] == ["authorization_code"] and form["code"] == ["AUTHCODE-123"]
        scope = "openid,profile,w_member_social" + (",w_organization_social,r_organization_admin" if orgs else "")
        return httpx.Response(200, json={"access_token": "LI-ACCESS-TOKEN", "expires_in": 5184000, "scope": scope})

    return [
        (on("POST", "/oauth/v2/accessToken"), token),
        (on("GET", "/v2/userinfo"), lambda r: httpx.Response(200, json={"sub": "abc123", "name": "Jane Doe"})),
        (on("GET", "/rest/organizationAcls"), lambda r: httpx.Response(200, json={"elements": [{"organization": "urn:li:organization:555"}]})),
        (on("GET", "/rest/organizations/555"), lambda r: httpx.Response(200, json={"localizedName": "Perfume Co Ltd"})),
    ]


def test_linkedin_member_connects(monkeypatch) -> None:
    s = make_settings()
    install(monkeypatch, _li_routes())
    state, _ = start_state("linkedin", s)
    _, q, _ = callback("linkedin", state, s)
    assert q == {"connected": ["linkedin"]}
    creds = accounts.brand_credentials(BRAND, "linkedin", settings=s)
    assert creds.get("author_urn") == "urn:li:person:abc123" and creds.account_name == "Jane Doe"
    assert creds.expires_at == (NOW + timedelta(seconds=5184000)).isoformat(timespec="seconds")


def test_linkedin_with_org_scope_offers_member_and_org(monkeypatch) -> None:
    s = make_settings(linkedin_organization_scopes=True)
    install(monkeypatch, _li_routes(orgs=True))
    state, _ = start_state("linkedin", s)
    _, q, _ = callback("linkedin", state, s)
    assert q == {"connect_choose": ["linkedin"]}
    assert accounts.pending_choices(BRAND, "linkedin") == [
        {"id": "urn:li:person:abc123", "name": "Jane Doe", "kind": "member"},
        {"id": "urn:li:organization:555", "name": "Perfume Co Ltd", "kind": "organization"},
    ]
    accounts.choose(BRAND, "linkedin", "urn:li:organization:555", settings=s)
    assert accounts.brand_credentials(BRAND, "linkedin", settings=s).get("author_urn") == "urn:li:organization:555"


# --- X --------------------------------------------------------------------------------------------


def _x_routes(expires_in: int = 7200) -> list[Route]:
    def token(req: httpx.Request) -> httpx.Response:
        form = parse_qs(req.content.decode())
        assert req.headers["authorization"].startswith("Basic ")
        if form["grant_type"] == ["refresh_token"]:
            assert form["refresh_token"] == ["X-REFRESH-1"]
            return httpx.Response(200, json={"access_token": "X-BEARER-2", "refresh_token": "X-REFRESH-2", "expires_in": 7200})
        assert form["code_verifier"][0] and form["code"] == ["AUTHCODE-123"]
        return httpx.Response(200, json={"access_token": "X-BEARER-1", "refresh_token": "X-REFRESH-1", "expires_in": expires_in,
                                         "scope": "tweet.read tweet.write users.read offline.access media.write"})

    return [
        (on("POST", "/2/oauth2/token"), token),
        (on("GET", "/2/users/me"), lambda r: httpx.Response(200, json={"data": {"id": "42", "username": "perfumeco", "name": "P"}})),
    ]


def test_x_connect_then_refresh_on_publish(monkeypatch, data_dir) -> None:
    s = make_settings()
    install(monkeypatch, _x_routes())
    state, _ = start_state("x", s)
    _, q, _ = callback("x", state, s)
    assert q == {"connected": ["x"]}
    creds = accounts.brand_credentials(BRAND, "x", settings=s)
    assert creds.get("bearer_token") == "X-BEARER-1" and creds.account_name == "@perfumeco"

    # three hours later the 2-hour token has expired → refreshed before posting, new pair persisted
    later = NOW + timedelta(hours=3)
    mock = Mock([*_x_routes(), (on("POST", "/2/tweets"), lambda r: httpx.Response(201, json={"data": {"id": "999"}}))])
    x = get_adapter("x", BRAND, settings=s, client=mock.client(), now=lambda: later)
    assert x.status().mode == "connected"
    res = x.publish(campaign=make_campaign(), variant=make_variant("x"))
    assert res.ok, res.error
    tweet = next(r for r in mock.requests if r.url.path == "/2/tweets")
    assert tweet.headers["authorization"] == "Bearer X-BEARER-2"
    stored = accounts.brand_credentials(BRAND, "x", settings=s)
    assert stored.get("bearer_token") == "X-BEARER-2" and stored.get("refresh_token") == "X-REFRESH-2"
    assert stored.expires_at == (later + timedelta(hours=2)).isoformat(timespec="seconds")


def test_x_refresh_failure_is_a_clean_error(monkeypatch) -> None:
    s = make_settings()
    accounts.save_account(BRAND, "x", fields={"bearer_token": "X-BEARER-1", "refresh_token": "X-REFRESH-1"}, method="oauth",
                          expires_at=(NOW - timedelta(minutes=5)).isoformat(), settings=s)
    mock = Mock([(on("POST", "/2/oauth2/token"), lambda r: httpx.Response(400, json={"error": "invalid_request"}))])
    res = get_adapter("x", BRAND, settings=s, client=mock.client(), now=lambda: NOW).publish(
        campaign=make_campaign(), variant=make_variant("x"))
    assert not res.ok and "reconnect" in res.error and "X-REFRESH-1" not in res.error


def test_x_oauth1_manual_still_signs(monkeypatch) -> None:
    s = make_settings()
    accounts.set_manual(BRAND, "x", {"api_key": "ck", "api_secret": "cs", "access_token": "at", "access_secret": "as"}, settings=s)
    mock = Mock([(on("POST", "/2/tweets"), lambda r: httpx.Response(201, json={"data": {"id": "1"}}))])
    res = get_adapter("x", BRAND, settings=s, client=mock.client()).publish(campaign=make_campaign(), variant=make_variant("x"))
    assert res.ok and mock.requests[0].headers["authorization"].startswith("OAuth ")


# --- Google ---------------------------------------------------------------------------------------


def _g_routes(locations: list[dict[str, str]]) -> list[Route]:
    def token(req: httpx.Request) -> httpx.Response:
        form = parse_qs(req.content.decode())
        if form["grant_type"] == ["refresh_token"]:
            return httpx.Response(200, json={"access_token": "G-ACCESS-2", "expires_in": 3599})
        assert form["code_verifier"][0]
        return httpx.Response(200, json={"access_token": "G-ACCESS-1", "refresh_token": "G-REFRESH-1", "expires_in": 3599})

    return [
        (on("POST", "oauth2.googleapis.com/token"), token),
        (on("GET", "/v1/accounts"), lambda r: httpx.Response(200, json={"accounts": [{"name": "accounts/12", "accountName": "Perfume Group"}]})),
        (on("GET", "/v1/accounts/12/locations"), lambda r: httpx.Response(200, json={"locations": locations})),
    ]


def test_google_multiple_locations_then_choose(monkeypatch) -> None:
    s = make_settings()
    install(monkeypatch, _g_routes([{"name": "locations/34", "title": "Pune Store"}, {"name": "locations/56", "title": "Mumbai Store"}]))
    state, _ = start_state("google_business", s)
    _, q, _ = callback("google_business", state, s)
    assert q == {"connect_choose": ["google_business"]}
    choices = accounts.pending_choices(BRAND, "google_business")
    assert choices[0] == {"id": "accounts/12/locations/34", "name": "Pune Store (Perfume Group)", "kind": "location"}
    accounts.choose(BRAND, "google_business", "accounts/12/locations/56", settings=s)
    creds = accounts.brand_credentials(BRAND, "google_business", settings=s)
    assert (creds.get("account_id"), creds.get("location_id"), creds.get("refresh_token")) == ("12", "56", "G-REFRESH-1")
    assert accounts.account_status(BRAND, "google_business", settings=s, now=NOW).state == "connected"


def test_google_no_locations(monkeypatch) -> None:
    s = make_settings()
    install(monkeypatch, _g_routes([]))
    state, _ = start_state("google_business", s)
    _, q, _ = callback("google_business", state, s)
    assert q["reason"] == ["no_locations"]


# --- no secrets in logs ---------------------------------------------------------------------------


def test_no_secret_reaches_the_logs(monkeypatch, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    s = make_settings()
    install(monkeypatch, _meta_routes([PAGE_A, PAGE_B]) + _x_routes())
    for ch in ("facebook_page", "x"):
        state, _ = start_state(ch, s)
        callback(ch, state, s)
    # a real httpx client logs request URLs at INFO — the Graph token URL carries secrets in its query
    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200))) as c:
        c.get("https://graph.facebook.com/v21.0/oauth/access_token?client_secret=APP-SECRET-XYZ&code=AUTHCODE-123")
    logging.getLogger("httpx").info('HTTP Request: %s %s "%s %d %s"', "GET",
                                    httpx.URL("https://graph.facebook.com/x?access_token=PAGE-TOKEN-A"), "HTTP/1.1", 200, "OK")
    text = caplog.text + " ".join(str(r.args) for r in caplog.records)
    assert "[redacted]" in text
    assert not any(secret in text for secret in SECRETS)

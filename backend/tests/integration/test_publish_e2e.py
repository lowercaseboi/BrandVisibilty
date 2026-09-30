"""End-to-end publish path, per real channel, through the real FastAPI app.

account stored (manual PUT / OAuth callback / .env) → GET /brands/{k}/channels says "connected" →
campaign create → approve → POST publish → the brand's credentials are resolved → the adapter makes
the platform calls → DistributionEvent "published" with the external URL → campaign status → board
card "done".

Only image generation is faked (no network, deterministic PNGs). Every outbound platform request —
adapters, token refresh, OAuth code exchange — goes through `channels.base.set_transport`, here an
httpx.MockTransport (`Platform`) that fails the test on any request it wasn't told to expect and
checks each request against the platform's documented shape:

- Meta Graph API (developers.facebook.com/docs/graph-api/reference/page/photos, Instagram Content
  Publishing): POST /{page-id}/photos (multipart `source` + `caption`) → {id, post_id};
  POST /{ig-user-id}/media {image_url, caption} → container; GET ?fields=status_code;
  POST /{ig-user-id}/media_publish {creation_id}; GET ?fields=permalink.
- X API v2 (docs.x.com/x-api/media/upload-media, /2/tweets): POST /2/media/upload multipart
  `media` + `media_category=tweet_image` → data.id; POST /2/tweets {"text", "media": {"media_ids"}};
  OAuth 1.0a HMAC-SHA1 user context (signature recomputed here) or OAuth 2.0 user bearer; refresh via
  POST /2/oauth2/token grant_type=refresh_token (Basic auth for confidential clients).
- LinkedIn (Posts API + Images API, LinkedIn-Version 202609 = the current version per
  learn.microsoft.com/linkedin/marketing/versioning): POST /rest/images?action=initializeUpload →
  PUT uploadUrl → POST /rest/posts → 201 + x-restli-id.
- Google Business Profile v4 (developers.google.com/my-business/reference/rest/v4/
  accounts.locations.localPosts/create): POST …/accounts/{a}/locations/{l}/localPosts
  {languageCode, summary, topicType, media[{mediaFormat: PHOTO, sourceUrl}], callToAction};
  refresh via POST oauth2.googleapis.com/token.
"""

from __future__ import annotations

import importlib
import json
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.parser import BytesParser
from email.policy import default as email_policy
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, parse_qsl, unquote, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.unit.distribution.campaign_helpers import BRAND, FakeImagegen, store_snapshot

ADMIN = "adm1n-t0ken"
H = {"X-Admin-Token": ADMIN}
PUBLIC = "https://brandviz.example.com"
GRAPH = "https://graph.facebook.com/v25.0"

# Every setting a real .env / .env.local could fill in: blanked so the developer's own
# credentials can never leak into (or be used by) these tests.
_CHANNEL_ENV = (
    "META_PAGE_ID META_PAGE_TOKEN IG_USER_ID X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET GBP_ACCOUNT_ID "
    "GBP_LOCATION_ID GBP_ACCESS_TOKEN LINKEDIN_AUTHOR_URN LINKEDIN_ACCESS_TOKEN META_APP_ID META_APP_SECRET "
    "LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET X_CLIENT_ID X_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET "
    "OAUTH_REDIRECT_BASE META_GRAPH_VERSION LINKEDIN_API_VERSION GEMINI_API_KEY CLOUDFLARE_API_TOKEN"
).split()


# --------------------------------------------------------------------------- the fake internet


@dataclass
class Route:
    method: str
    url: str  # scheme://host/path, compared without the query string
    handler: Callable[[httpx.Request], httpx.Response]
    times: int = 1


@dataclass
class Platform:
    """An httpx transport handler: each expected request is answered once, in order of arrival
    per route; anything unexpected is recorded and answered 599 (and fails `assert_done`)."""

    routes: list[Route] = field(default_factory=list)
    requests: list[httpx.Request] = field(default_factory=list)
    unexpected: list[str] = field(default_factory=list)

    def expect(self, method: str, url: str, handler: Callable[[httpx.Request], httpx.Response], times: int = 1) -> None:
        self.routes.append(Route(method, url, handler, times))

    def __call__(self, request: httpx.Request) -> httpx.Response:
        request.read()
        self.requests.append(request)
        base = f"{request.url.scheme}://{request.url.host}{request.url.path}"
        for route in self.routes:
            if route.times > 0 and route.method == request.method and route.url == base:
                route.times -= 1
                return route.handler(request)
        self.unexpected.append(f"{request.method} {base}")
        return httpx.Response(599, json={"error": "unexpected request in test"})

    def assert_done(self) -> None:
        assert self.unexpected == [], f"unexpected platform calls: {self.unexpected}"
        left = [f"{r.method} {r.url}" for r in self.routes if r.times > 0]
        assert left == [], f"expected platform calls never made: {left}"


def form(request: httpx.Request) -> dict[str, str]:
    assert request.headers["content-type"].startswith("application/x-www-form-urlencoded"), request.headers
    return dict(parse_qsl(request.content.decode()))


def multipart(request: httpx.Request) -> dict[str, tuple[bytes, str | None, str | None]]:
    """name → (payload, filename, content-type) of a multipart/form-data body."""
    ctype = request.headers["content-type"]
    assert ctype.startswith("multipart/form-data; boundary="), ctype
    msg = BytesParser(policy=email_policy).parsebytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + request.content)
    out = {}
    for part in msg.iter_parts():
        out[part.get_param("name", header="content-disposition")] = (
            part.get_payload(decode=True), part.get_filename(), part.get_content_type() if part.get_filename() else None,
        )
    return out


def body_json(request: httpx.Request) -> Any:
    assert request.headers["content-type"] == "application/json", request.headers
    return json.loads(request.content)


def ok(payload: Any, status: int = 200, headers: dict[str, str] | None = None) -> Callable[[httpx.Request], httpx.Response]:
    return lambda _r: httpx.Response(status, json=payload, headers=headers)


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


# --------------------------------------------------------------------------- app fixture


@pytest.fixture
def env(tmp_path, monkeypatch):
    """The real app on a temp DATA_DIR with SECRET_KEY + ADMIN_TOKEN, fake images, fake internet."""
    from app import paths
    from app.distribution import service
    from app.distribution.channels import base

    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    for name in _CHANNEL_ENV:
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("ADMIN_TOKEN", ADMIN)
    monkeypatch.setenv("SECRET_KEY", "integration-secret-key-0123456789")
    monkeypatch.setenv("PUBLIC_BASE_URL", PUBLIC)
    monkeypatch.setenv("COPY_PROVIDER", "template")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:8080")
    gen = FakeImagegen()
    monkeypatch.setattr(service, "_generate_asset", gen.generate_asset)
    monkeypatch.setattr(service, "_make_qr_poster", gen.make_qr_poster)
    store_snapshot()

    platform = Platform()
    previous = base.set_transport(httpx.MockTransport(platform))
    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    try:
        yield TestClient(main.app, follow_redirects=False), platform, tmp_path
    finally:
        base.set_transport(previous)
        sys.modules.pop("app.interface.main", None)


def channels(client: TestClient) -> dict[str, dict]:
    r = client.get(f"/brands/{BRAND}/channels")
    assert r.status_code == 200, r.text
    return {c["channel"]: c for c in r.json()}


def account(client: TestClient, channel: str) -> dict:
    return {a["channel"]: a for a in client.get(f"/brands/{BRAND}/accounts").json()}[channel]


def connect_manual(client: TestClient, channel: str, fields: dict[str, str]) -> dict:
    r = client.put(f"/brands/{BRAND}/accounts/{channel}", json={"fields": fields}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def approved_campaign(client: TestClient, *, link: dict[str, str] | None = None) -> dict:
    r = client.post(f"/brands/{BRAND}/campaigns", json={"recommendation_id": "rec-comp"})
    assert r.status_code == 202, r.text
    cid, job_id = r.json()["campaign"]["campaign_id"], r.json()["job"]["job_id"]
    for _ in range(300):
        if client.get(f"/jobs/{job_id}").json()["status"] in ("completed", "failed"):
            break
        time.sleep(0.02)
    for channel, url in (link or {}).items():
        assert client.patch(f"/brands/{BRAND}/campaigns/{cid}/variants/{channel}", json={"link": url}).status_code == 200
    r = client.post(f"/brands/{BRAND}/campaigns/{cid}/approve", headers=H)
    assert r.status_code == 200 and r.json()["status"] == "approved", r.text
    return r.json()


def publish(client: TestClient, campaign: dict, chans: list[str]) -> dict:
    r = client.post(f"/brands/{BRAND}/campaigns/{campaign['campaign_id']}/publish", json={"channels": chans}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def variant(campaign: dict, channel: str) -> dict:
    return next(v for v in campaign["variants"] if v["channel"] == channel)


def asset_path(root: Path, campaign: dict, channel: str) -> Path:
    asset_id = variant(campaign, channel)["asset_id"]
    rel = next(a["path"] for a in campaign["assets"] if a["asset_id"] == asset_id)
    return root / "media" / rel


def assert_done_card(client: TestClient, campaign: dict) -> None:
    cards = client.get(f"/brands/{BRAND}/board").json()["cards"]
    assert cards[campaign["suggestion_key"]]["column"] == "done"


def assert_no_secret(tmp_path: Path, client: TestClient, campaign: dict, *secrets: str) -> None:
    texts = [
        client.get(f"/brands/{BRAND}/campaigns/{campaign['campaign_id']}").text,
        client.get(f"/brands/{BRAND}/accounts").text,
        client.get(f"/brands/{BRAND}/channels").text,
        (tmp_path / "audit" / f"{BRAND}.jsonl").read_text(),
    ]
    acct = tmp_path / "accounts" / f"{BRAND}.json"
    if acct.exists():
        texts.append(acct.read_text())  # stored encrypted
    for secret in secrets:
        assert not any(secret in t for t in texts), f"secret {secret[:6]}… leaked"


# --------------------------------------------------------------------------- brand accounts, per channel


def test_facebook_page_manual_account_publishes(env) -> None:
    client, platform, root = env
    token = "EAAB-FB-PAGE-TOKEN-0001"
    assert channels(client)["facebook_page"]["mode"] == "export_only"
    st = connect_manual(client, "facebook_page", {"page_id": "1010", "page_token": token})
    assert st["state"] == "connected" and st["method"] == "manual"
    assert channels(client)["facebook_page"]["mode"] == "connected"

    campaign = approved_campaign(client)
    v = variant(campaign, "facebook_page")
    png = asset_path(root, campaign, "facebook_page").read_bytes()

    def photos(req: httpx.Request) -> httpx.Response:
        parts = multipart(req)
        assert set(parts) == {"caption", "access_token", "source"}
        assert parts["access_token"][0].decode() == token
        assert parts["caption"][0].decode().startswith(v["text"].strip())
        data, filename, ctype = parts["source"]
        assert data == png and data.startswith(PNG_MAGIC) and filename.endswith(".png") and ctype == "image/png"
        return httpx.Response(200, json={"id": "555", "post_id": "1010_777"})

    def permalink(req: httpx.Request) -> httpx.Response:
        assert dict(req.url.params) == {"fields": "permalink_url", "access_token": token}
        return httpx.Response(200, json={"permalink_url": "https://www.facebook.com/1010/posts/777", "id": "1010_777"})

    platform.expect("POST", f"{GRAPH}/1010/photos", photos)
    platform.expect("GET", f"{GRAPH}/1010_777", permalink)
    done = publish(client, campaign, ["facebook_page"])
    platform.assert_done()

    ev = done["events"][-1]
    assert (ev["outcome"], ev["external_url"], ev["external_id"]) == ("published", "https://www.facebook.com/1010/posts/777", "1010_777")
    assert ev["error"] is None and done["status"] == "published"
    assert_done_card(client, campaign)
    assert_no_secret(root, client, campaign, token)


def test_instagram_manual_account_publishes_public_jpeg(env) -> None:
    client, platform, root = env
    token = "EAAB-IG-PAGE-TOKEN-0002"
    connect_manual(client, "instagram", {"ig_user_id": "17841000", "page_token": token})
    assert account(client, "instagram")["state"] == "connected"
    assert channels(client)["instagram"]["mode"] == "connected"
    campaign = approved_campaign(client)
    v = variant(campaign, "instagram")
    fetched: list[httpx.Response] = []

    def create_container(req: httpx.Request) -> httpx.Response:
        f = form(req)
        assert set(f) == {"image_url", "caption", "access_token"} and f["access_token"] == token
        assert f["caption"].startswith(v["text"].strip())
        url = urlsplit(f["image_url"])
        assert f"{url.scheme}://{url.netloc}" == PUBLIC and url.path.endswith(".jpg")
        # Instagram downloads the image itself: the app must really serve it, as a JPEG.
        fetched.append(client.get(url.path))
        return httpx.Response(200, json={"id": "c-900"})

    def status(req: httpx.Request) -> httpx.Response:
        assert req.url.params["fields"] == "status_code,status" and req.url.params["access_token"] == token
        return httpx.Response(200, json={"status_code": "FINISHED", "id": "c-900"})

    def media_publish(req: httpx.Request) -> httpx.Response:
        assert form(req) == {"creation_id": "c-900", "access_token": token}
        return httpx.Response(200, json={"id": "m-901"})

    platform.expect("POST", f"{GRAPH}/17841000/media", create_container)
    platform.expect("GET", f"{GRAPH}/c-900", status)
    platform.expect("POST", f"{GRAPH}/17841000/media_publish", media_publish)
    platform.expect("GET", f"{GRAPH}/m-901", ok({"permalink": "https://www.instagram.com/p/ABC/"}))
    done = publish(client, campaign, ["instagram"])
    platform.assert_done()

    assert fetched[0].status_code == 200 and fetched[0].headers["content-type"] == "image/jpeg"
    assert fetched[0].content.startswith(JPEG_MAGIC)
    ev = done["events"][-1]
    assert (ev["outcome"], ev["external_url"], ev["external_id"]) == ("published", "https://www.instagram.com/p/ABC/", "m-901")
    assert done["status"] == "published"
    assert_done_card(client, campaign)
    assert_no_secret(root, client, campaign, token)


def _check_oauth1(req: httpx.Request, *, key: str, secret: str, token: str, token_secret: str) -> None:
    """Recompute the HMAC-SHA1 signature from the header's own nonce/timestamp (RFC 5849)."""
    from app.distribution.channels import oauth1

    header = req.headers["authorization"]
    assert header.startswith("OAuth ")
    params = {k: unquote(v.strip('"')) for k, v in (p.split("=", 1) for p in header[6:].split(", "))}
    assert params["oauth_consumer_key"] == key and params["oauth_token"] == token
    assert params["oauth_signature_method"] == "HMAC-SHA1" and params["oauth_version"] == "1.0"
    signed = [(k, v) for k, v in params.items() if k != "oauth_signature"]  # multipart/JSON bodies aren't signed
    url = f"{req.url.scheme}://{req.url.host}{req.url.path}"
    assert params["oauth_signature"] == oauth1.sign(req.method, url, signed, secret, token_secret)


def test_x_manual_oauth1_account_uploads_media_and_posts(env) -> None:
    client, platform, root = env
    creds = {"api_key": "ck-111111", "api_secret": "cs-222222", "access_token": "at-333333", "access_secret": "as-444444"}
    connect_manual(client, "x", creds)
    assert channels(client)["x"]["mode"] == "connected"
    campaign = approved_campaign(client)
    png = asset_path(root, campaign, "x").read_bytes()
    sign = dict(key="ck-111111", secret="cs-222222", token="at-333333", token_secret="as-444444")

    def upload(req: httpx.Request) -> httpx.Response:
        _check_oauth1(req, **sign)
        parts = multipart(req)
        assert parts["media_category"][0] == b"tweet_image" and parts["media"][0] == png
        return httpx.Response(200, json={"data": {"id": "1880000000000000001", "media_key": "3_1880000000000000001"}})

    def tweet(req: httpx.Request) -> httpx.Response:
        _check_oauth1(req, **sign)
        body = body_json(req)
        assert body["media"] == {"media_ids": ["1880000000000000001"]} and body["text"].startswith(variant(campaign, "x")["text"].strip())
        return httpx.Response(201, json={"data": {"id": "1880000000000000999", "text": body["text"]}})

    platform.expect("POST", "https://api.x.com/2/media/upload", upload)
    platform.expect("POST", "https://api.x.com/2/tweets", tweet)
    done = publish(client, campaign, ["x"])
    platform.assert_done()
    ev = done["events"][-1]
    assert ev["outcome"] == "published" and ev["external_url"] == "https://x.com/i/web/status/1880000000000000999"
    assert "left this month" in channels(client)["x"]["detail"]
    assert_done_card(client, campaign)
    assert_no_secret(root, client, campaign, *creds.values())


def _connect_x_with_oauth(client: TestClient, platform: Platform, monkeypatch, *, expires_in: int) -> None:
    """The real Connect flow: POST oauth/start → X consent (skipped) → GET /oauth/x/callback."""
    monkeypatch.setenv("X_CLIENT_ID", "x-client")
    monkeypatch.setenv("X_CLIENT_SECRET", "x-client-secret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "https://brandviz.example.com/api")
    r = client.post(f"/brands/{BRAND}/accounts/x/oauth/start", json={}, headers=H)
    assert r.status_code == 200, r.text
    q = parse_qs(urlsplit(r.json()["authorize_url"]).query)
    assert "media.write" in q["scope"][0] and "offline.access" in q["scope"][0]

    def token(req: httpx.Request) -> httpx.Response:
        f = form(req)
        assert f["grant_type"] == "authorization_code" and f["code"] == "auth-code" and f["code_verifier"]
        assert req.headers["authorization"].startswith("Basic ")
        return httpx.Response(200, json={"access_token": "X-BEARER-OLD", "refresh_token": "X-REFRESH-OLD",
                                         "expires_in": expires_in, "scope": "tweet.read tweet.write users.read offline.access media.write"})

    platform.expect("POST", "https://api.x.com/2/oauth2/token", token)
    platform.expect("GET", "https://api.x.com/2/users/me", ok({"data": {"id": "42", "username": "vadapav", "name": "Vada Pav"}}))
    r = client.get("/oauth/x/callback", params={"code": "auth-code", "state": q["state"][0]})
    assert "connected=x" in r.headers["location"], r.headers["location"]
    platform.assert_done()


def _bearer_post_routes(platform: Platform, bearer: str) -> None:
    def upload(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == f"Bearer {bearer}"
        assert multipart(req)["media_category"][0] == b"tweet_image"
        return httpx.Response(200, json={"data": {"id": "77"}})

    def tweet(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == f"Bearer {bearer}"
        assert body_json(req)["media"] == {"media_ids": ["77"]}
        return httpx.Response(201, json={"data": {"id": "78", "text": "…"}})

    platform.expect("POST", "https://api.x.com/2/media/upload", upload)
    platform.expect("POST", "https://api.x.com/2/tweets", tweet)


def test_x_oauth2_connected_account_publishes_with_bearer(env, monkeypatch) -> None:
    client, platform, root = env
    _connect_x_with_oauth(client, platform, monkeypatch, expires_in=7200)
    st = account(client, "x")
    assert (st["state"], st["method"], st["account_name"]) == ("connected", "oauth", "@vadapav")
    assert channels(client)["x"]["mode"] == "connected"
    campaign = approved_campaign(client)
    _bearer_post_routes(platform, "X-BEARER-OLD")
    done = publish(client, campaign, ["x"])
    platform.assert_done()
    assert done["events"][-1]["outcome"] == "published" and done["events"][-1]["external_url"].endswith("/78")
    assert_no_secret(root, client, campaign, "X-BEARER-OLD", "X-REFRESH-OLD", "x-client-secret")


def _expire(root: Path, channel: str) -> None:
    """Move the stored token's expiry into the past (expires_at isn't secret: plain JSON)."""
    path = root / "accounts" / f"{BRAND}.json"
    data = json.loads(path.read_text())
    data["accounts"][channel]["expires_at"] = (datetime.now(UTC) - timedelta(hours=1)).isoformat(timespec="seconds")
    path.write_text(json.dumps(data))


def test_x_expired_oauth2_token_is_refreshed_then_posts(env, monkeypatch) -> None:
    client, platform, root = env
    _connect_x_with_oauth(client, platform, monkeypatch, expires_in=7200)
    campaign = approved_campaign(client)
    _expire(root, "x")
    assert account(client, "x")["state"] == "connected"  # refreshable → still usable
    assert channels(client)["x"]["mode"] == "connected"

    def refresh(req: httpx.Request) -> httpx.Response:
        f = form(req)
        assert f == {"grant_type": "refresh_token", "refresh_token": "X-REFRESH-OLD", "client_id": "x-client"}
        assert req.headers["authorization"].startswith("Basic ")
        return httpx.Response(200, json={"access_token": "X-BEARER-NEW", "refresh_token": "X-REFRESH-NEW", "expires_in": 7200})

    platform.expect("POST", "https://api.x.com/2/oauth2/token", refresh)
    _bearer_post_routes(platform, "X-BEARER-NEW")
    done = publish(client, campaign, ["x"])
    platform.assert_done()
    assert done["events"][-1]["outcome"] == "published"

    from app.distribution import accounts

    creds = accounts.brand_credentials(BRAND, "x")
    assert creds.get("bearer_token") == "X-BEARER-NEW" and creds.get("refresh_token") == "X-REFRESH-NEW"
    assert not creds.expired()
    assert_no_secret(root, client, campaign, "X-BEARER-NEW", "X-REFRESH-NEW", "X-REFRESH-OLD")


def test_x_expired_token_with_revoked_refresh_fails_with_reconnect(env, monkeypatch) -> None:
    client, platform, root = env
    _connect_x_with_oauth(client, platform, monkeypatch, expires_in=7200)
    campaign = approved_campaign(client)
    _expire(root, "x")
    platform.expect("POST", "https://api.x.com/2/oauth2/token", ok({"error": "invalid_request"}, status=400))
    done = publish(client, campaign, ["x"])
    platform.assert_done()  # nothing posted after the failed refresh
    ev = done["events"][-1]
    assert ev["outcome"] == "failed" and "reconnect" in ev["error"] and done["status"] == "failed"
    assert_no_secret(root, client, campaign, "X-REFRESH-OLD", "X-BEARER-OLD")


def test_linkedin_manual_account_uploads_image_and_posts(env) -> None:
    client, platform, root = env
    token = "AQV-LINKEDIN-TOKEN-0003"
    connect_manual(client, "linkedin", {"author_urn": "urn:li:person:abc123", "access_token": token})
    assert channels(client)["linkedin"]["mode"] == "connected"
    campaign = approved_campaign(client)
    png = asset_path(root, campaign, "linkedin").read_bytes()
    upload_url = "https://www.linkedin.com/dms-uploads/sp/v2/D4E10AQ/upload"

    def versioned(req: httpx.Request) -> None:
        assert req.headers["authorization"] == f"Bearer {token}"
        assert req.headers["linkedin-version"] == "202609" and req.headers["x-restli-protocol-version"] == "2.0.0"

    def init(req: httpx.Request) -> httpx.Response:
        versioned(req)
        assert req.url.params["action"] == "initializeUpload"
        assert body_json(req) == {"initializeUploadRequest": {"owner": "urn:li:person:abc123"}}
        return httpx.Response(200, json={"value": {"uploadUrl": upload_url, "image": "urn:li:image:C4E10AQ", "uploadUrlExpiresAt": 1}})

    def put(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == f"Bearer {token}" and req.content == png
        return httpx.Response(201)

    def post(req: httpx.Request) -> httpx.Response:
        versioned(req)
        body = body_json(req)
        assert body["author"] == "urn:li:person:abc123" and body["visibility"] == "PUBLIC"
        assert body["lifecycleState"] == "PUBLISHED" and body["distribution"]["feedDistribution"] == "MAIN_FEED"
        assert body["content"]["media"]["id"] == "urn:li:image:C4E10AQ"
        assert body["commentary"]
        return httpx.Response(201, headers={"x-restli-id": "urn:li:share:7100000000000000000"})

    platform.expect("POST", "https://api.linkedin.com/rest/images", init)
    platform.expect("PUT", upload_url, put)
    platform.expect("POST", "https://api.linkedin.com/rest/posts", post)
    done = publish(client, campaign, ["linkedin"])
    platform.assert_done()
    ev = done["events"][-1]
    assert ev["outcome"] == "published"
    assert ev["external_url"] == "https://www.linkedin.com/feed/update/urn:li:share:7100000000000000000"
    assert_done_card(client, campaign)
    assert_no_secret(root, client, campaign, token)


def test_google_business_manual_account_creates_local_post(env) -> None:
    client, platform, root = env
    token = "ya29.GBP-TOKEN-0004"
    connect_manual(client, "google_business", {"account_id": "accounts/111", "location_id": "locations/222", "access_token": token})
    assert channels(client)["google_business"]["mode"] == "connected"
    campaign = approved_campaign(client, link={"google_business": "https://gajananvadapav.example/menu"})

    def local_post(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == f"Bearer {token}"
        body = body_json(req)
        assert body["languageCode"] == "en" and body["topicType"] == "STANDARD" and body["summary"]
        assert "#" not in body["summary"]  # hashtags do nothing on GBP
        assert body["callToAction"] == {"actionType": "LEARN_MORE", "url": "https://gajananvadapav.example/menu"}
        (media,) = body["media"]
        assert media["mediaFormat"] == "PHOTO" and media["sourceUrl"].startswith(f"{PUBLIC}/media/")
        assert client.get(urlsplit(media["sourceUrl"]).path).status_code == 200  # Google can fetch it
        return httpx.Response(200, json={"name": "accounts/111/locations/222/localPosts/9", "state": "LIVE",
                                         "searchUrl": "https://local.google.com/place?id=1&use=posts&lpsid=9"})

    platform.expect("POST", "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/localPosts", local_post)
    done = publish(client, campaign, ["google_business"])
    platform.assert_done()
    ev = done["events"][-1]
    assert ev["outcome"] == "published" and ev["external_url"].startswith("https://local.google.com/")
    assert ev["external_id"] == "accounts/111/locations/222/localPosts/9"
    assert_no_secret(root, client, campaign, token)


def test_google_oauth_record_expired_is_refreshed_then_posts(env, monkeypatch) -> None:
    client, platform, root = env
    from app.distribution import accounts

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "g-client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "g-client-secret")
    # What a finished Google Connect stores (same call the OAuth callback makes).
    accounts.save_account(
        BRAND, "google_business", method="oauth", account_id="accounts/111/locations/222", account_name="Gajanan Vada Pav",
        fields={"access_token": "ya29.OLD", "refresh_token": "1//G-REFRESH", "account_id": "111", "location_id": "222"},
        expires_at=(datetime.now(UTC) - timedelta(minutes=5)).isoformat(timespec="seconds"),
    )
    assert account(client, "google_business")["state"] == "connected"
    assert channels(client)["google_business"]["mode"] == "connected"
    campaign = approved_campaign(client)

    def refresh(req: httpx.Request) -> httpx.Response:
        assert form(req) == {"grant_type": "refresh_token", "refresh_token": "1//G-REFRESH",
                             "client_id": "g-client", "client_secret": "g-client-secret"}
        return httpx.Response(200, json={"access_token": "ya29.NEW", "expires_in": 3599, "token_type": "Bearer"})

    def local_post(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == "Bearer ya29.NEW"
        return httpx.Response(200, json={"name": "accounts/111/locations/222/localPosts/10", "state": "LIVE", "searchUrl": "https://g.co/p/10"})

    platform.expect("POST", "https://oauth2.googleapis.com/token", refresh)
    platform.expect("POST", "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/localPosts", local_post)
    done = publish(client, campaign, ["google_business"])
    platform.assert_done()
    assert done["events"][-1]["outcome"] == "published"
    assert accounts.brand_credentials(BRAND, "google_business").get("refresh_token") == "1//G-REFRESH"  # kept
    assert_no_secret(root, client, campaign, "ya29.NEW", "ya29.OLD", "1//G-REFRESH", "g-client-secret")


# --------------------------------------------------------------------------- .env fallback


def test_env_fallback_publishes_every_channel_with_server_credentials(env, monkeypatch) -> None:
    client, platform, root = env
    envs = {
        "META_PAGE_ID": "9001", "META_PAGE_TOKEN": "ENV-META-TOKEN-99", "IG_USER_ID": "9002",
        "X_API_KEY": "env-ck-1", "X_API_SECRET": "env-cs-1", "X_ACCESS_TOKEN": "env-at-1", "X_ACCESS_SECRET": "env-as-1",
        "LINKEDIN_AUTHOR_URN": "urn:li:organization:5", "LINKEDIN_ACCESS_TOKEN": "ENV-LI-TOKEN-99",
        "GBP_ACCOUNT_ID": "31", "GBP_LOCATION_ID": "32", "GBP_ACCESS_TOKEN": "ENV-GBP-TOKEN-99",
    }
    for k, v in envs.items():
        monkeypatch.setenv(k, v)
    real = ["facebook_page", "instagram", "x", "linkedin", "google_business"]
    ch = channels(client)
    assert all(ch[c]["mode"] == "connected" for c in real), ch
    assert all(account(client, c)["method"] == "env" for c in real)
    campaign = approved_campaign(client)

    def bearer(token: str, payload: Any, status: int = 200, headers: dict | None = None):
        def handler(req: httpx.Request) -> httpx.Response:
            assert req.headers["authorization"] == f"Bearer {token}"
            return httpx.Response(status, json=payload, headers=headers)
        return handler

    def graph_token(payload: Any):
        def handler(req: httpx.Request) -> httpx.Response:
            ctype = req.headers.get("content-type", "")
            if req.method == "GET":
                token = req.url.params["access_token"]
            elif ctype.startswith("multipart/"):
                token = multipart(req)["access_token"][0].decode()
            else:
                token = form(req)["access_token"]
            assert token == "ENV-META-TOKEN-99"
            return httpx.Response(200, json=payload)
        return handler

    def x_signed(payload: Any, status: int):
        def handler(req: httpx.Request) -> httpx.Response:
            _check_oauth1(req, key="env-ck-1", secret="env-cs-1", token="env-at-1", token_secret="env-as-1")
            return httpx.Response(status, json=payload)
        return handler

    platform.expect("POST", f"{GRAPH}/9001/photos", graph_token({"id": "1", "post_id": "9001_1"}))
    platform.expect("GET", f"{GRAPH}/9001_1", graph_token({"permalink_url": "https://www.facebook.com/9001_1"}))
    platform.expect("POST", f"{GRAPH}/9002/media", graph_token({"id": "c1"}))
    platform.expect("GET", f"{GRAPH}/c1", graph_token({"status_code": "FINISHED"}))
    platform.expect("POST", f"{GRAPH}/9002/media_publish", graph_token({"id": "m1"}))
    platform.expect("GET", f"{GRAPH}/m1", graph_token({"permalink": "https://www.instagram.com/p/m1/"}))
    platform.expect("POST", "https://api.x.com/2/media/upload", x_signed({"data": {"id": "5"}}, 200))
    platform.expect("POST", "https://api.x.com/2/tweets", x_signed({"data": {"id": "6"}}, 201))
    platform.expect("POST", "https://api.linkedin.com/rest/images",
                    bearer("ENV-LI-TOKEN-99", {"value": {"uploadUrl": "https://www.linkedin.com/dms-uploads/u", "image": "urn:li:image:1"}}))
    platform.expect("PUT", "https://www.linkedin.com/dms-uploads/u", bearer("ENV-LI-TOKEN-99", None, 201))
    platform.expect("POST", "https://api.linkedin.com/rest/posts", bearer("ENV-LI-TOKEN-99", None, 201, {"x-restli-id": "urn:li:share:1"}))
    platform.expect("POST", "https://mybusiness.googleapis.com/v4/accounts/31/locations/32/localPosts",
                    bearer("ENV-GBP-TOKEN-99", {"name": "accounts/31/locations/32/localPosts/1", "searchUrl": "https://g.co/1", "state": "LIVE"}))

    done = publish(client, campaign, [*real, "whatsapp"])
    platform.assert_done()
    outcomes = {e["channel"]: (e["outcome"], e["external_url"]) for e in done["events"]}
    assert outcomes == {
        "facebook_page": ("published", "https://www.facebook.com/9001_1"),
        "instagram": ("published", "https://www.instagram.com/p/m1/"),
        "x": ("published", "https://x.com/i/web/status/6"),
        "linkedin": ("published", "https://www.linkedin.com/feed/update/urn:li:share:1"),
        "google_business": ("published", "https://g.co/1"),
        "whatsapp": ("exported", outcomes["whatsapp"][1]),
    }
    wa = done["events"][-1]
    assert wa["external_url"].startswith("https://wa.me/?text=") and "no posting API" in wa["note"] and "Nothing was sent" in wa["note"]
    assert done["status"] == "published"
    assert_done_card(client, campaign)
    assert_no_secret(root, client, campaign, *(v for k, v in envs.items() if "TOKEN" in k or "SECRET" in k or "KEY" in k))


# --------------------------------------------------------------------------- failure cases


def test_revoked_tokens_fail_with_reconnect_message(env) -> None:
    client, platform, root = env
    li, fb = "AQV-REVOKED-LI-0005", "EAAB-REVOKED-FB-0006"
    connect_manual(client, "linkedin", {"author_urn": "urn:li:person:abc123", "access_token": li})
    connect_manual(client, "facebook_page", {"page_id": "1010", "page_token": fb})
    campaign = approved_campaign(client)
    platform.expect("POST", "https://api.linkedin.com/rest/images",
                    ok({"status": 401, "serviceErrorCode": 65601, "code": "REVOKED_ACCESS_TOKEN",
                        "message": f"The token used in the request has been revoked by the user ({li[:4]}…)"}, status=401))
    platform.expect("POST", f"{GRAPH}/1010/photos",
                    ok({"error": {"message": f"Error validating access token: The user has not authorized application. token={fb}",
                                  "type": "OAuthException", "code": 190, "error_subcode": 458}}, status=400))
    done = publish(client, campaign, ["linkedin", "facebook_page"])
    platform.assert_done()
    by = {e["channel"]: e for e in done["events"]}
    for ch in ("linkedin", "facebook_page"):
        assert by[ch]["outcome"] == "failed", by[ch]
        assert "reconnect the account in Details → Connected accounts" in by[ch]["error"], by[ch]["error"]
    assert "[redacted]" in by["facebook_page"]["error"]  # Meta echoed the token: scrubbed
    assert done["status"] == "failed"
    assert_no_secret(root, client, campaign, li, fb)


def test_instagram_without_public_base_url_is_blocked_before_any_call(env, monkeypatch) -> None:
    client, platform, _root = env
    connect_manual(client, "instagram", {"ig_user_id": "17841000", "page_token": "EAAB-IG-0007"})
    for base in ("", "http://localhost:8000"):
        monkeypatch.setenv("PUBLIC_BASE_URL", base)
        st = account(client, "instagram")
        assert st["state"] == "needs_setup" and "PUBLIC_BASE_URL" in st["detail"], st
        ch = channels(client)["instagram"]
        assert ch["mode"] == "export_only" and "PUBLIC_BASE_URL" in ch["detail"]
    campaign = approved_campaign(client)
    pre = client.post(f"/brands/{BRAND}/campaigns/{campaign['campaign_id']}/preflight", json={"channels": ["instagram"]}).json()
    assert pre[0]["action"] == "blocked" and "PUBLIC_BASE_URL" in pre[0]["detail"]
    done = publish(client, campaign, ["instagram"])
    assert platform.requests == []  # refused before any API call
    ev = done["events"][-1]
    assert ev["outcome"] == "blocked" and "PUBLIC_BASE_URL" in ev["error"] and ev["error"].startswith("Not posted")
    assert done["status"] == "approved"  # nothing reached a platform


def test_unconnected_channel_exports_with_explicit_note_and_preflight(env) -> None:
    client, platform, _root = env
    connect_manual(client, "facebook_page", {"page_id": "1010", "page_token": "EAAB-FB-0008"})
    campaign = approved_campaign(client)
    cid = campaign["campaign_id"]
    pre = {p["channel"]: p for p in client.post(f"/brands/{BRAND}/campaigns/{cid}/preflight",
                                                  json={"channels": ["facebook_page", "x", "whatsapp", "export"]}).json()}
    assert pre["facebook_page"]["action"] == "publish" and pre["facebook_page"]["has_image"]
    assert pre["x"]["action"] == "export" and "no X (Twitter) account connected" in pre["x"]["detail"]
    assert pre["whatsapp"]["action"] == "export" and "share link" in pre["whatsapp"]["detail"]
    assert pre["export"]["action"] == "export"
    assert platform.requests == [] and client.get(f"/brands/{BRAND}/campaigns/{cid}").json()["events"] == []

    done = publish(client, campaign, ["x"])
    ev = done["events"][-1]
    assert ev["outcome"] == "exported" and ev["external_url"] is None and "Not posted" in ev["note"]
    assert platform.requests == [] and done["status"] == "approved"


def test_incomplete_or_undecryptable_account_is_blocked_not_exported(env, monkeypatch) -> None:
    client, platform, _root = env
    connect_manual(client, "linkedin", {"author_urn": "urn:li:person:abc123", "access_token": "AQV-0009"})
    campaign = approved_campaign(client)
    monkeypatch.setenv("SECRET_KEY", "a-different-secret-key-9876543210")  # stored tokens can't be read now
    assert account(client, "linkedin")["state"] == "expired"
    assert channels(client)["linkedin"]["mode"] == "export_only"
    done = publish(client, campaign, ["linkedin"])
    ev = done["events"][-1]
    assert ev["outcome"] == "blocked" and "reconnect" in ev["error"] and platform.requests == []


# --------------------------------------------------------------------------- scripts/check_channels.py


def _check_channels_module():
    import importlib.util

    path = Path(__file__).resolve().parents[2] / "scripts" / "check_channels.py"
    spec = importlib.util.spec_from_file_location("check_channels", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_check_channels_cli_reads_only_and_never_prints_tokens(env) -> None:
    client, platform, _root = env
    token = "EAAB-CLI-TOKEN-0010"
    connect_manual(client, "facebook_page", {"page_id": "1010", "page_token": token})
    cli = _check_channels_module()

    def page(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == f"Bearer {token}" and req.url.params["fields"] == "id,name"
        return httpx.Response(200, json={"id": "1010", "name": "Gajanan Vada Pav"})

    platform.expect("GET", f"{GRAPH}/1010", page)
    lines: list[str] = []
    assert cli.check(BRAND, list(cli.CHANNELS), offline=False, out=lines.append) == 0
    platform.assert_done()  # one read-only GET, no POST anywhere
    text = "\n".join(lines)
    assert "WOULD POST" in text and "Gajanan Vada Pav" in text and "EXPORT ONLY" in text and "SHARE LINK" in text
    assert token not in text

    platform.expect("GET", f"{GRAPH}/1010", ok({"error": {"code": 190, "message": "revoked"}}, status=401))
    lines.clear()
    assert cli.check(BRAND, ["facebook_page"], offline=False, out=lines.append) == 1
    assert "FAILED" in "\n".join(lines)
    lines.clear()
    assert cli.check(BRAND, ["facebook_page"], offline=True, out=lines.append) == 0
    assert "skipped (--offline)" in "\n".join(lines)
    platform.assert_done()

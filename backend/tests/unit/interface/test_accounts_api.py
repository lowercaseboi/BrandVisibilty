"""Connected-accounts HTTP API: manual connect / test / disconnect, OAuth start + callback,
choices, brand-aware channels — and no secret ever in a response, error or log."""

from __future__ import annotations

import importlib
import json
import logging
import sys
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi.testclient import TestClient

BRAND = "gajanan_vada_pav"
ADMIN = "s3cret-admin"
PAGE_TOKEN = "EAAB-PAGE-TOKEN-SUPER-SECRET"
H = {"X-Admin-Token": ADMIN}

_BLANK = (
    "META_PAGE_ID META_PAGE_TOKEN IG_USER_ID X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET GBP_ACCOUNT_ID "
    "GBP_LOCATION_ID GBP_ACCESS_TOKEN LINKEDIN_AUTHOR_URN LINKEDIN_ACCESS_TOKEN LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET "
    "X_CLIENT_ID X_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET"
).split()


@pytest.fixture
def api(tmp_path, monkeypatch):
    from app import paths

    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    for name in _BLANK:
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("ADMIN_TOKEN", ADMIN)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-0123456789")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://brandviz.example.com")
    monkeypatch.setenv("META_APP_ID", "meta-app")
    monkeypatch.setenv("META_APP_SECRET", "APP-SECRET-XYZ")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "http://localhost:8080/api")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:8080")
    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    try:
        yield TestClient(main.app, follow_redirects=False)
    finally:
        sys.modules.pop("app.interface.main", None)


def _by_channel(client: TestClient) -> dict[str, dict]:
    r = client.get(f"/brands/{BRAND}/accounts")
    assert r.status_code == 200, r.text
    return {a["channel"]: a for a in r.json()}


def test_list_accounts_shape(api) -> None:
    accts = _by_channel(api)
    assert list(accts) == ["facebook_page", "instagram", "x", "linkedin", "google_business", "whatsapp"]
    fb = accts["facebook_page"]
    assert set(fb) == {"channel", "state", "method", "account_name", "account_id", "connected_at", "expires_at",
                       "oauth_available", "manual_fields", "detail"}
    assert fb["state"] == "not_connected" and fb["oauth_available"] is True
    assert accts["x"]["state"] == "needs_setup" and accts["x"]["oauth_available"] is False
    assert accts["google_business"]["state"] == "pending_approval"
    assert accts["whatsapp"] == {**accts["whatsapp"], "state": "connected", "method": None,
                                 "detail": "No account needed — posts via a share link"}
    assert api.get("/brands/nope/accounts").status_code == 404


def test_manual_connect_test_disconnect_without_leaks(api, monkeypatch, caplog, tmp_path) -> None:
    caplog.set_level(logging.DEBUG)
    body = {"fields": {"page_id": "101", "page_token": PAGE_TOKEN}}
    assert api.put(f"/brands/{BRAND}/accounts/facebook_page", json=body).status_code == 401
    assert api.put(f"/brands/{BRAND}/accounts/facebook_page", json=body, headers={"X-Admin-Token": "wrong"}).status_code == 401
    r = api.put(f"/brands/{BRAND}/accounts/facebook_page", json=body, headers=H)
    assert r.status_code == 200, r.text
    st = r.json()
    assert st["state"] == "connected" and st["method"] == "manual" and st["account_id"] == "101"

    # brand-aware channels vs the global view
    brand_ch = {c["channel"]: c for c in api.get(f"/brands/{BRAND}/channels").json()}
    assert brand_ch["facebook_page"]["mode"] == "connected"
    assert {c["channel"]: c for c in api.get("/channels").json()}["facebook_page"]["mode"] == "export_only"

    # test connection: one read-only Graph call with the brand's token
    from app.distribution import oauth

    seen: list[httpx.Request] = []

    def graph(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={"id": "101", "name": "Gajanan Vada Pav"})

    monkeypatch.setattr(oauth, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(graph)))
    r = api.post(f"/brands/{BRAND}/accounts/facebook_page/test", headers=H)
    assert r.json() == {"ok": True, "detail": "Connected to the Page “Gajanan Vada Pav”."}
    assert seen[0].method == "GET" and seen[0].headers["authorization"] == f"Bearer {PAGE_TOKEN}"
    monkeypatch.setattr(oauth, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={}))))
    r = api.post(f"/brands/{BRAND}/accounts/facebook_page/test", headers=H)
    assert r.json()["ok"] is False and "rejected" in r.json()["detail"]

    # invalid input names the field, never echoes the value
    r = api.put(f"/brands/{BRAND}/accounts/facebook_page", json={"fields": {"page_id": "abc", "page_token": PAGE_TOKEN}}, headers=H)
    assert r.status_code == 422 and "page_id" in r.text and PAGE_TOKEN not in r.text

    everything = [api.get(f"/brands/{BRAND}/accounts").text, api.get(f"/brands/{BRAND}/channels").text, r.text]
    audit = (tmp_path / "audit" / f"{BRAND}.jsonl").read_text()
    assert '"account.connect"' in audit and "account:facebook_page" in audit
    everything.append(audit)
    everything += [(tmp_path / "accounts" / f"{BRAND}.json").read_text(), caplog.text]
    assert not any(PAGE_TOKEN in t for t in everything)

    r = api.delete(f"/brands/{BRAND}/accounts/facebook_page", headers=H)
    assert r.status_code == 200 and r.json()["state"] == "not_connected" and r.json()["method"] is None
    assert api.delete(f"/brands/{BRAND}/accounts/facebook_page").status_code == 401


def test_unknown_channel_and_missing_secret_key(api, monkeypatch) -> None:
    assert api.put(f"/brands/{BRAND}/accounts/myspace", json={"fields": {}}, headers=H).status_code == 404
    assert api.put(f"/brands/{BRAND}/accounts/whatsapp", json={"fields": {}}, headers=H).status_code == 404
    assert api.post(f"/brands/{BRAND}/accounts/whatsapp/test", headers=H).json()["ok"] is True
    monkeypatch.setenv("SECRET_KEY", "")
    r = api.put(f"/brands/{BRAND}/accounts/facebook_page", json={"fields": {"page_id": "1", "page_token": PAGE_TOKEN}}, headers=H)
    assert r.status_code == 503 and "SECRET_KEY" in r.json()["detail"]


def test_oauth_start_callback_choices_choose(api, monkeypatch) -> None:
    from app.distribution import oauth

    assert api.post(f"/brands/{BRAND}/accounts/facebook_page/oauth/start", json={}).status_code == 401
    r = api.post(f"/brands/{BRAND}/accounts/x/oauth/start", json={}, headers=H)
    assert r.status_code == 409 and "X_CLIENT_ID" in r.json()["detail"]

    r = api.post(f"/brands/{BRAND}/accounts/facebook_page/oauth/start", json={"return_to": "https://evil.example"}, headers=H)
    assert r.status_code == 200
    url = r.json()["authorize_url"]
    q = parse_qs(urlsplit(url).query)
    assert url.startswith("https://www.facebook.com/") and q["client_id"] == ["meta-app"]
    assert q["redirect_uri"] == ["http://localhost:8080/api/oauth/facebook_page/callback"]
    assert "APP-SECRET-XYZ" not in url

    pages = [
        {"id": "101", "name": "Vada Pav Main", "access_token": "PAGE-TOKEN-A"},
        {"id": "202", "name": "Vada Pav Events", "access_token": "PAGE-TOKEN-B"},
    ]

    def meta(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/oauth/access_token"):
            return httpx.Response(200, json={"access_token": "USER-TOKEN"})
        return httpx.Response(200, json={"data": pages})

    monkeypatch.setattr(oauth, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(meta)))
    r = api.get("/oauth/facebook_page/callback", params={"code": "c0de", "state": q["state"][0]})
    assert r.status_code == 302
    assert r.headers["location"] == f"http://localhost:8080/brands/{BRAND}/details?connect_choose=facebook_page#accounts"

    r = api.get(f"/brands/{BRAND}/accounts/facebook_page/choices")
    assert r.json() == [{"id": "101", "name": "Vada Pav Main", "kind": "page"}, {"id": "202", "name": "Vada Pav Events", "kind": "page"}]
    assert "PAGE-TOKEN" not in r.text
    assert api.post(f"/brands/{BRAND}/accounts/facebook_page/choose", json={"id": "202"}).status_code == 401
    assert api.post(f"/brands/{BRAND}/accounts/facebook_page/choose", json={"id": "999"}, headers=H).status_code == 404
    r = api.post(f"/brands/{BRAND}/accounts/facebook_page/choose", json={"id": "202"}, headers=H)
    assert r.status_code == 200 and r.json()["account_name"] == "Vada Pav Events" and r.json()["method"] == "oauth"
    assert "PAGE-TOKEN" not in r.text
    assert api.get(f"/brands/{BRAND}/accounts/facebook_page/choices").json() == []

    # the same state can't be replayed; a forged one is refused
    r = api.get("/oauth/facebook_page/callback", params={"code": "c0de", "state": q["state"][0]})
    assert "connect_error=facebook_page" in r.headers["location"] and "reason=expired" in r.headers["location"]
    r = api.get("/oauth/facebook_page/callback", params={"code": "c0de", "state": "x.y"})
    assert r.headers["location"] == "http://localhost:8080/app?connect_error=facebook_page&reason=bad_state"


def test_openapi_documents_account_routes(api) -> None:
    paths = api.get("/openapi.json").json()["paths"]
    for p in ("/brands/{brand_key}/accounts", "/brands/{brand_key}/accounts/{channel}", "/brands/{brand_key}/accounts/{channel}/test",
              "/brands/{brand_key}/accounts/{channel}/oauth/start", "/oauth/{channel}/callback",
              "/brands/{brand_key}/accounts/{channel}/choices", "/brands/{brand_key}/accounts/{channel}/choose",
              "/brands/{brand_key}/channels"):
        assert p in paths, p
    schema = json.dumps(paths["/brands/{brand_key}/accounts"]["get"]["responses"]["200"])
    assert "AccountStatusOut" in schema

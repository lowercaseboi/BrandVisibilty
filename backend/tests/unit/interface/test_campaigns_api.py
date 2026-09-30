"""Campaign Studio HTTP API: routes, admin-token rules, AC-7 / AC-10 over HTTP.

The real app over a temp DATA_DIR (same pattern as test_api.py's `real_client`), with the image
generator and channel adapters faked (tests/unit/distribution/campaign_helpers.py)."""

from __future__ import annotations

import importlib
import io
import sys
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from tests.unit.distribution.campaign_helpers import (
    BRAND,
    install_fakes,
    store_snapshot,
)

TOKEN = "s3cret-admin"


@pytest.fixture
def api(tmp_path, monkeypatch):
    from app import paths

    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    monkeypatch.setenv("ADMIN_TOKEN", "")
    store_snapshot()
    _, adapters = install_fakes(monkeypatch)
    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    try:
        yield TestClient(main.app), adapters
    finally:
        sys.modules.pop("app.interface.main", None)


def _create(client: TestClient, rec: str = "rec-comp") -> dict:
    r = client.post(f"/brands/{BRAND}/campaigns", json={"recommendation_id": rec})
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["job"]["kind"] == "campaign"
    assert body["campaign"]["gap_id"]  # AC-7 from the first response on
    job_id = body["job"]["job_id"]
    for _ in range(250):
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] in ("completed", "failed"):
            break
        time.sleep(0.02)
    assert job["status"] == "completed", job
    cid = body["campaign"]["campaign_id"]
    campaign = client.get(f"/brands/{BRAND}/campaigns/{cid}").json()
    assert campaign["status"] == "ready"
    return campaign


def _path(c: dict, suffix: str = "") -> str:
    return f"/brands/{BRAND}/campaigns/{c['campaign_id']}{suffix}"


def test_channels_and_list(api):
    client, _ = api
    channels = client.get("/channels").json()
    assert {c["channel"] for c in channels} == {"facebook_page", "instagram", "x", "linkedin", "google_business", "whatsapp", "export", "sandbox"}
    assert client.get(f"/brands/{BRAND}/campaigns").json() == []
    assert client.get("/brands/nope/campaigns").status_code == 404


def test_create_errors(api):
    client, _ = api
    assert client.post(f"/brands/{BRAND}/campaigns", json={"recommendation_id": "rec-missing"}).status_code == 404
    r = client.post(f"/brands/{BRAND}/campaigns", json={"recommendation_id": "rec-nogap"})
    assert r.status_code == 422 and "AC-7" in r.json()["detail"]
    assert client.post("/brands/nope/campaigns", json={"recommendation_id": "rec-comp"}).status_code == 404


def test_flow_without_admin_token_sandbox_only(api):
    client, adapters = api
    c = _create(client)
    assert client.get(f"/brands/{BRAND}/campaigns").json()[0]["campaign_id"] == c["campaign_id"]

    r = client.patch(_path(c, "/variants/sandbox"), json={"text": "Gajanan Vada Pav — hello Mumbai", "link": None})
    assert r.status_code == 200 and next(v for v in r.json()["variants"] if v["channel"] == "sandbox")["text"].startswith("Gajanan")

    # no ADMIN_TOKEN: approve works; a request with only real channels → 403, attempt still logged
    assert client.post(_path(c, "/approve")).json()["status"] == "approved"
    r = client.post(_path(c, "/publish"), json={"channels": ["facebook_page", "x"]})
    assert r.status_code == 403 and "ADMIN_TOKEN" in r.json()["detail"]
    events = client.get(_path(c)).json()["events"]
    assert [(e["channel"], e["outcome"]) for e in events] == [("facebook_page", "blocked"), ("x", "blocked")]
    assert adapters["facebook_page"].calls == [] and adapters["x"].calls == []
    assert client.get(_path(c)).json()["status"] == "approved"  # blocked attempts don't change status

    # mixed request: allowed channels go out, the real one is logged "blocked", 200
    r = client.post(_path(c, "/publish"), json={"channels": ["sandbox", "facebook_page", "export", "whatsapp"]})
    assert r.status_code == 200
    outcomes = [(e["channel"], e["outcome"]) for e in r.json()["events"][2:]]
    assert outcomes == [("sandbox", "published"), ("facebook_page", "blocked"), ("export", "exported"), ("whatsapp", "exported")]
    assert "ADMIN_TOKEN" in r.json()["events"][3]["error"]
    assert adapters["facebook_page"].calls == []
    # blocked sends nothing, so it doesn't count toward status: sandbox went out → published
    assert r.json()["status"] == "published"
    board = client.get(f"/brands/{BRAND}/board").json()["cards"]
    assert board[c["suggestion_key"]]["column"] == "done"


def test_admin_token_required_when_set(api, monkeypatch):
    client, _ = api
    c = _create(client)
    monkeypatch.setenv("ADMIN_TOKEN", TOKEN)
    assert client.post(_path(c, "/approve")).status_code == 401
    assert client.post(_path(c, "/approve"), headers={"X-Admin-Token": "wrong"}).status_code == 401
    r = client.post(_path(c, "/approve"), headers={"X-Admin-Token": TOKEN})
    assert r.status_code == 200 and r.json()["status"] == "approved"

    # wrong token on publish: 401, and the refused attempt is logged (AC-10)
    r = client.post(_path(c, "/publish"), json={"channels": ["x"]}, headers={"X-Admin-Token": "nope"})
    assert r.status_code == 401
    assert client.get(_path(c)).json()["events"][-1]["outcome"] == "blocked"

    r = client.post(_path(c, "/publish"), json={"channels": ["facebook_page", "x"]}, headers={"X-Admin-Token": TOKEN})
    assert r.status_code == 200
    assert [e["outcome"] for e in r.json()["events"][-2:]] == ["published", "published"]

    assert client.delete(_path(c)).status_code == 401
    assert client.delete(_path(c), headers={"X-Admin-Token": TOKEN}).json() == {"campaign_id": c["campaign_id"], "deleted": True}
    assert client.get(_path(c)).status_code == 404


def test_edit_revokes_approval_and_blocks_publish(api):
    client, _ = api
    c = _create(client)
    client.post(_path(c, "/approve"))
    r = client.patch(_path(c, "/variants/sandbox"), json={"hashtags": ["#New"]})
    assert r.json()["status"] == "ready" and r.json()["approved_at"] is None
    r = client.post(_path(c, "/publish"), json={"channels": ["sandbox"]})
    assert r.status_code == 200
    assert r.json()["events"][-1]["outcome"] == "blocked"


def test_patch_errors(api):
    client, _ = api
    c = _create(client)
    assert client.patch(_path(c, "/variants/sandbox"), json={"asset_id": "missing"}).status_code == 422
    assert client.patch(_path(c, "/variants/nope"), json={"text": "x"}).status_code == 404
    assert client.patch(f"/brands/{BRAND}/campaigns/cmp-missing/variants/x", json={"text": "x"}).status_code == 404
    assert client.post(_path(c, "/publish"), json={"channels": ["myspace"]}).status_code == 422


def test_deliverable_regenerate_export_and_media(api):
    client, _ = api
    c = _create(client)
    r = client.post(_path(c, "/deliverables/0"), json={"body": "# Edited"})
    assert r.status_code == 200 and r.json()["deliverables"][0]["body"] == "# Edited"
    assert client.post(_path(c, "/deliverables/99"), json={"body": "x"}).status_code == 404

    r = client.post(_path(c, "/regenerate-image"), json={"format": "story", "style": "festive", "seed": 7})
    assert r.status_code == 200 and len(r.json()["assets"]) == len(c["assets"]) + 1
    assert client.post(_path(c, "/regenerate-image"), json={"format": "poster"}).status_code == 422

    r = client.get(_path(c, "/export.zip"))
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert "README.md" in zipfile.ZipFile(io.BytesIO(r.content)).namelist()

    asset = c["assets"][0]
    img = client.get(f"/media/{asset['path']}")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert img.content.startswith(b"\x89PNG")
    for bad in ("/media/..%2F..%2Fetc/passwd", f"/media/{c['campaign_id']}/x.txt", f"/media/{c['campaign_id']}/..png",
                "/media/cmp-x/missing.png"):
        assert client.get(bad).status_code == 404


def test_every_campaign_route_declares_a_response_model(api):
    client, _ = api
    openapi = client.get("/openapi.json").json()
    for path, ops in openapi["paths"].items():
        if "campaign" not in path and path != "/channels":
            continue
        for method, op in ops.items():
            assert "campaigns" in op["tags"]
            content = op["responses"].get("200", op["responses"].get("202", {})).get("content", {})
            assert content, (method, path)
    assert "CampaignOut" in openapi["components"]["schemas"]

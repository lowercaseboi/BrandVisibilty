"""Per-brand account store: encryption, resolution (brand → .env fallback), statuses, choices."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

import app.paths as paths
from app.distribution import accounts
from app.distribution.channels import channel_statuses, get_adapter
from tests.unit.distribution.channels.conftest import make_campaign, make_variant

BRAND = "perfume"
PAGE_TOKEN = "EAAB-PAGE-TOKEN-SUPER-SECRET"


def make_settings(**kw: Any) -> SimpleNamespace:
    base: dict[str, Any] = dict(secret_key="test-secret-key-0123456789", public_base_url="https://brandviz.example.com")
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


def _file(data_dir) -> str:
    return (data_dir / "accounts" / f"{BRAND}.json").read_text()


def test_encryption_round_trip_and_nothing_plain_on_disk(data_dir) -> None:
    s = make_settings()
    accounts.set_manual(BRAND, "facebook_page", {"page_id": "111", "page_token": PAGE_TOKEN}, settings=s)
    raw = _file(data_dir)
    assert PAGE_TOKEN not in raw and "111" in raw  # id plain, token encrypted
    creds = accounts.brand_credentials(BRAND, "facebook_page", settings=s)
    assert creds is not None and creds.get("page_token") == PAGE_TOKEN and creds.method == "manual"
    assert PAGE_TOKEN not in repr(creds)
    assert accounts.decrypt(accounts.encrypt("x", s), s) == "x"
    assert (data_dir / "accounts" / f"{BRAND}.json").stat().st_mode & 0o077 == 0


def test_refuses_to_store_secrets_without_secret_key(data_dir) -> None:
    with pytest.raises(accounts.SecretKeyMissing, match="SECRET_KEY"):
        accounts.set_manual(BRAND, "facebook_page", {"page_id": "111", "page_token": PAGE_TOKEN}, settings=make_settings(secret_key=None))
    assert not (data_dir / "accounts" / f"{BRAND}.json").exists()


def test_changed_secret_key_marks_account_unusable() -> None:
    accounts.set_manual(BRAND, "facebook_page", {"page_id": "111", "page_token": PAGE_TOKEN}, settings=make_settings())
    other = make_settings(secret_key="a-different-key")
    creds = accounts.brand_credentials(BRAND, "facebook_page", settings=other)
    assert creds is not None and creds.problem and creds.fields == {}
    st = accounts.account_status(BRAND, "facebook_page", settings=other)
    assert st.state == "expired" and "SECRET_KEY" in st.detail
    assert get_adapter("facebook_page", BRAND, settings=other).status().mode == "export_only"


def test_manual_validation_names_field_never_value() -> None:
    s = make_settings()
    with pytest.raises(accounts.AccountError) as e:
        accounts.set_manual(BRAND, "facebook_page", {"page_id": "not-a-number", "page_token": PAGE_TOKEN}, settings=s)
    assert "page_id" in str(e.value) and PAGE_TOKEN not in str(e.value) and "not-a-number" not in str(e.value)
    with pytest.raises(accounts.AccountError, match="page_token is required"):
        accounts.set_manual(BRAND, "facebook_page", {"page_id": "1"}, settings=s)
    with pytest.raises(accounts.AccountError, match="Unknown field"):
        accounts.set_manual(BRAND, "x", {"api_key": "a", "api_secret": "b", "access_token": "c", "access_secret": "d", "bogus": "e"}, settings=s)
    with pytest.raises(accounts.AccountError, match="author_urn"):
        accounts.set_manual(BRAND, "linkedin", {"author_urn": "bob", "access_token": "t"}, settings=s)
    with pytest.raises(accounts.AccountError):
        accounts.set_manual("../etc", "linkedin", {"author_urn": "urn:li:person:abc", "access_token": "t"}, settings=s)
    accounts.set_manual(
        BRAND, "google_business", {"account_id": "accounts/12", "location_id": "locations/34", "access_token": "t"}, settings=s
    )
    st = accounts.account_status(BRAND, "google_business", settings=s)
    assert st.account_id == "accounts/12/locations/34" and st.state == "connected"


def test_resolution_brand_first_then_env_fallback() -> None:
    s = make_settings(meta_page_id="999", meta_page_token="ENV-TOKEN")
    # no brand account → .env credentials
    env = accounts.resolve("facebook_page", BRAND, settings=s)
    assert env.method == "env" and env.get("page_token") == "ENV-TOKEN"
    accounts.set_manual(BRAND, "facebook_page", {"page_id": "111", "page_token": PAGE_TOKEN}, settings=s)
    mine = accounts.resolve("facebook_page", BRAND, settings=s)
    assert mine.method == "manual" and mine.get("page_id") == "111" and mine.get("page_token") == PAGE_TOKEN
    # another brand, and the global view, still use .env
    assert accounts.resolve("facebook_page", "vadapav", settings=s).get("page_token") == "ENV-TOKEN"
    assert accounts.resolve("facebook_page", None, settings=s).get("page_token") == "ENV-TOKEN"
    by = {c.channel: c for c in channel_statuses(BRAND, settings=s)}
    assert by["facebook_page"].mode == "connected" and by["facebook_page"].detail == "Page ID 111"
    assert by["linkedin"].mode == "export_only"
    # disconnect → back to .env
    assert accounts.delete_account(BRAND, "facebook_page") is True
    assert accounts.resolve("facebook_page", BRAND, settings=s).method == "env"


def test_account_statuses_states() -> None:
    s = make_settings(public_base_url=None)
    sts = {a.channel: a for a in accounts.account_statuses(BRAND, settings=s)}
    assert list(sts) == ["facebook_page", "instagram", "x", "linkedin", "google_business", "whatsapp"]
    assert sts["whatsapp"].state == "connected" and sts["whatsapp"].method is None
    assert sts["whatsapp"].detail == "No account needed — posts via a share link"
    assert sts["facebook_page"].state == "needs_setup" and not sts["facebook_page"].oauth_available
    assert sts["google_business"].state == "pending_approval" and "approval" in sts["google_business"].detail.lower()
    assert "PUBLIC_BASE_URL" in sts["instagram"].detail
    assert sts["x"].manual_fields == ["api_key", "api_secret", "access_token", "access_secret"]
    assert sts["instagram"].manual_fields == ["ig_user_id", "page_token"]

    s2 = make_settings(meta_app_id="app", meta_app_secret="sec", oauth_redirect_base="http://localhost:8000",
                       x_api_key="a", x_api_secret="b", x_access_token="c", x_access_secret="d")
    sts = {a.channel: a for a in accounts.account_statuses(BRAND, settings=s2)}
    assert sts["facebook_page"].state == "not_connected" and sts["facebook_page"].oauth_available
    assert sts["instagram"].oauth_available
    assert sts["x"].state == "connected" and sts["x"].method == "env"


def test_expired_state_unless_refreshable() -> None:
    now = datetime(2026, 9, 30, tzinfo=UTC)
    past = (now - timedelta(hours=1)).isoformat()
    s = make_settings()
    accounts.save_account(BRAND, "linkedin", fields={"author_urn": "urn:li:person:abc", "access_token": "tok"}, method="oauth",
                          account_name="Jane", expires_at=past, settings=s)
    st = accounts.account_status(BRAND, "linkedin", settings=s, now=now)
    assert st.state == "expired" and st.account_name == "Jane"
    assert get_adapter("linkedin", BRAND, settings=s, now=lambda: now).status().mode == "export_only"
    # X with a refresh token and the X OAuth app configured → still connected (refreshed on publish)
    sx = make_settings(x_client_id="cid")
    accounts.save_account(BRAND, "x", fields={"bearer_token": "b", "refresh_token": "r"}, method="oauth", expires_at=past, settings=sx)
    assert accounts.account_status(BRAND, "x", settings=sx, now=now).state == "connected"
    assert accounts.account_status(BRAND, "x", settings=s, now=now).state == "expired"  # no app keys → can't refresh


def test_pending_choices_hide_tokens_and_expire(data_dir) -> None:
    s = make_settings()
    now = datetime(2026, 9, 30, tzinfo=UTC)
    choices = [
        {"id": "1", "name": "Page One", "kind": "page", "fields": {"page_id": "1", "page_token": "TOK-ONE-SECRET"}},
        {"id": "2", "name": "Page Two", "kind": "page", "fields": {"page_id": "2", "page_token": "TOK-TWO-SECRET"}},
    ]
    accounts.save_pending(BRAND, "facebook_page", choices, settings=s, now=now)
    assert "TOK-ONE-SECRET" not in _file(data_dir)
    listed = accounts.pending_choices(BRAND, "facebook_page", now=now)
    assert listed == [{"id": "1", "name": "Page One", "kind": "page"}, {"id": "2", "name": "Page Two", "kind": "page"}]
    assert accounts.pending_choices(BRAND, "facebook_page", now=now + timedelta(hours=1)) == []
    with pytest.raises(LookupError):
        accounts.choose(BRAND, "facebook_page", "3", settings=s, now=now)
    accounts.choose(BRAND, "facebook_page", "2", settings=s, now=now)
    creds = accounts.brand_credentials(BRAND, "facebook_page", settings=s)
    assert creds.get("page_token") == "TOK-TWO-SECRET" and creds.account_name == "Page Two" and creds.method == "oauth"
    assert accounts.pending_choices(BRAND, "facebook_page", now=now) == []


def test_brand_delete_removes_account_file(data_dir) -> None:
    from app.tracking import store

    accounts.set_manual(BRAND, "facebook_page", {"page_id": "111", "page_token": PAGE_TOKEN}, settings=make_settings())
    assert (data_dir / "accounts" / f"{BRAND}.json").exists()
    store.delete_brand_data(BRAND)
    assert not (data_dir / "accounts" / f"{BRAND}.json").exists()


def test_publish_uses_brand_credentials(data_dir) -> None:
    """The adapter the service gets for a brand posts with that brand's token, not .env's."""
    import httpx

    s = make_settings(meta_page_id="999", meta_page_token="ENV-TOKEN", meta_graph_version="v21.0")
    accounts.set_manual(BRAND, "facebook_page", {"page_id": "111", "page_token": PAGE_TOKEN}, settings=s)
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        req.read()
        seen.append(req)
        if req.method == "POST":
            return httpx.Response(200, json={"id": "111_5"})
        return httpx.Response(200, json={"permalink_url": "https://facebook.com/111_5"})

    fb = get_adapter("facebook_page", BRAND, settings=s, client=httpx.Client(transport=httpx.MockTransport(handler)))
    res = fb.publish(campaign=make_campaign(), variant=make_variant("facebook_page"))
    assert res.ok, res.error
    assert seen[0].url.path.endswith("/111/feed")
    assert PAGE_TOKEN in seen[0].content.decode() and "ENV-TOKEN" not in seen[0].content.decode()


def test_service_passes_campaign_brand(monkeypatch) -> None:
    from app.distribution import service

    got: list[Any] = []

    def fake_get_adapter(channel: str, brand_key: str | None = None) -> Any:
        got.append((channel, brand_key))
        raise RuntimeError("stop here")

    monkeypatch.setattr(service, "_get_adapter", fake_get_adapter)
    from app.distribution.types import Campaign, Variant

    c = Campaign("cmp1", BRAND, "rec1", "gap1", "faq_page", "faq_page|", "approved", "t", "t",
                 variants=[Variant(channel="linkedin", text="hi")], approved_at="t")
    c.variants[0].approved_hash = __import__("app.distribution.gate", fromlist=["x"]).content_hash(c.variants[0])
    service._attempt(c, "linkedin", None)
    assert got == [("linkedin", BRAND)]


def test_pending_file_is_json(data_dir) -> None:
    accounts.save_pending(BRAND, "linkedin", [{"id": "urn:li:person:a", "name": "A", "kind": "member", "fields": {}}], settings=make_settings())
    data = json.loads(_file(data_dir))
    assert data["pending"]["linkedin"]["choices"][0]["id"] == "urn:li:person:a"

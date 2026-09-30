from __future__ import annotations

import json

import httpx

from app.distribution.channels import get_adapter
from app.distribution.channels.base import ChannelCredentials
from app.distribution.channels.linkedin import escape_little
from tests.unit.distribution.channels.conftest import route

TOKEN = "LI-TOKEN-SECRET"
URN = "urn:li:share:7100000000000000000"


def creds(author: str = "urn:li:person:abc123", **kw) -> ChannelCredentials:
    return ChannelCredentials("linkedin", "oauth", {"author_urn": author, "access_token": TOKEN}, brand_key="perfume",
                              account_name="Jane Doe", **kw)


def _adapter(make_settings, rec, credentials=None):
    return get_adapter("linkedin", settings=make_settings(linkedin_api_version="202609"), client=rec.client(),
                       credentials=credentials if credentials is not None else creds())


def test_status_modes(make_settings) -> None:
    s = make_settings()
    st = get_adapter("linkedin", settings=s).status()
    assert st.mode == "export_only" and "LINKEDIN_AUTHOR_URN" in st.detail
    st = get_adapter("linkedin", settings=s, credentials=creds()).status()
    assert st.mode == "connected" and st.detail == "Member: Jane Doe"
    st = get_adapter("linkedin", settings=s, credentials=creds("urn:li:organization:555")).status()
    assert st.detail == "Company Page: Jane Doe"
    assert get_adapter("linkedin", settings=s, credentials=creds("bob")).status().mode == "export_only"
    env = make_settings(linkedin_author_urn="urn:li:person:zz", linkedin_access_token="t")
    assert get_adapter("linkedin", settings=env).status().mode == "connected"


def test_text_post(make_settings, recorder, campaign, make_variant) -> None:
    rec = recorder([(route("POST", "/rest/posts"), lambda r: httpx.Response(201, headers={"x-restli-id": URN}))])
    v = make_variant("linkedin", text="Fresh attars (hand-made) in Pune.", link="https://perfume.example.com")
    res = _adapter(make_settings, rec).publish(campaign=campaign, variant=v)
    assert res.ok, res.error
    assert res.external_id == URN and res.external_url == f"https://www.linkedin.com/feed/update/{URN}"
    req = rec.requests[0]
    assert req.headers["linkedin-version"] == "202609" and req.headers["x-restli-protocol-version"] == "2.0.0"
    assert req.headers["authorization"] == f"Bearer {TOKEN}"
    body = json.loads(req.content)
    assert body["author"] == "urn:li:person:abc123" and body["lifecycleState"] == "PUBLISHED" and body["visibility"] == "PUBLIC"
    assert "\\(hand-made\\)" in body["commentary"] and "https://perfume.example.com" in body["commentary"]
    assert "{hashtag|\\#|attar}" in body["commentary"] and "{hashtag|\\#|Pune}" in body["commentary"]
    assert "content" not in body


def test_image_post(make_settings, recorder, campaign, make_variant, image) -> None:
    init = lambda r: httpx.Response(200, json={"value": {"uploadUrl": "https://www.linkedin.com/dms-uploads/abc", "image": "urn:li:image:C4D"}})  # noqa: E731
    rec = recorder([
        (route("POST", "/rest/images"), init),
        (route("PUT", "/dms-uploads/abc"), lambda r: httpx.Response(201)),
        (route("POST", "/rest/posts"), lambda r: httpx.Response(201, headers={"x-restli-id": URN})),
    ])
    v = make_variant("linkedin", alt_text="A bottle of attar")
    res = _adapter(make_settings, rec).publish(campaign=campaign, variant=v, image_path=image)
    assert res.ok, res.error
    init_req, put_req, post_req = rec.requests
    assert json.loads(init_req.content) == {"initializeUploadRequest": {"owner": "urn:li:person:abc123"}}
    assert put_req.content == image.read_bytes()
    assert json.loads(post_req.content)["content"] == {"media": {"id": "urn:li:image:C4D", "altText": "A bottle of attar"}}


def test_errors_and_validation(make_settings, recorder, campaign, make_variant) -> None:
    rec = recorder([(route("POST", "/rest/posts"), lambda r: httpx.Response(403, json={"message": "Not enough permissions"}))])
    res = _adapter(make_settings, rec).publish(campaign=campaign, variant=make_variant("linkedin"))
    assert not res.ok and "403" in res.error and "w_member_social" in res.error and TOKEN not in res.error
    a = _adapter(make_settings, recorder([]))
    assert a.validate(make_variant("linkedin", text="a" * 3000, hashtags=[])) == []
    assert a.validate(make_variant("linkedin", text="a" * 3001, hashtags=[]))
    # no credentials → export only: nothing sent
    rec = recorder([])
    res = get_adapter("linkedin", settings=make_settings(), client=rec.client()).publish(campaign=campaign, variant=make_variant("linkedin"))
    assert res.ok and res.external_url is None and rec.requests == []


def test_escape_little() -> None:
    assert escape_little("a (b) [c] {d} <e> @f #g *h _i ~j |k \\l") == "a \\(b\\) \\[c\\] \\{d\\} \\<e\\> \\@f \\#g \\*h \\_i \\~j \\|k \\\\l"

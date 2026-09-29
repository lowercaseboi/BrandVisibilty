from __future__ import annotations

import json
from urllib.parse import unquote

import httpx

from app.distribution.channels import get_adapter

LOCAL_POSTS = "/v4/accounts/333/locations/444/localPosts"


# --- Google Business Profile ----------------------------------------------------------------------


def test_gbp_posts_local_post_with_media_and_cta(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder(
        [
            (
                lambda r: r.method == "POST" and r.url.path == LOCAL_POSTS,
                lambda r: httpx.Response(
                    200,
                    json={"name": "accounts/333/locations/444/localPosts/9", "searchUrl": "https://local.google.com/p/9", "state": "LIVE"},
                ),
            )
        ]
    )
    gbp = get_adapter("google_business", settings=make_settings(), client=rec.client())
    variant = make_variant("google_business", link="https://perfume.example/faq", asset_id="a1")
    res = gbp.publish(campaign=campaign, variant=variant, image_path=None, image_url="https://brandviz.example.com/media/a.jpg")
    assert res.ok, res.error
    assert res.external_url == "https://local.google.com/p/9"
    assert res.external_id == "accounts/333/locations/444/localPosts/9"
    req = rec.requests[0]
    assert req.url.host == "mybusiness.googleapis.com"
    assert req.headers["authorization"] == "Bearer GBP-TOKEN-SECRET"
    body = json.loads(req.content)
    assert body["summary"] == "Fresh attars, made in Pune."  # no hashtags, link goes to CTA
    assert body["topicType"] == "STANDARD" and body["languageCode"] == "en"
    assert body["media"] == [{"mediaFormat": "PHOTO", "sourceUrl": "https://brandviz.example.com/media/a.jpg"}]
    assert body["callToAction"] == {"actionType": "LEARN_MORE", "url": "https://perfume.example/faq"}


def test_gbp_accepts_resource_name_ids(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder([(lambda r: r.url.path == LOCAL_POSTS, lambda r: httpx.Response(200, json={"name": "n", "state": "LIVE"}))])
    s = make_settings(gbp_account_id="accounts/333", gbp_location_id="locations/444")
    res = get_adapter("google_business", settings=s, client=rec.client()).publish(
        campaign=campaign, variant=make_variant("google_business"), image_path=None, image_url=None
    )
    assert res.ok and "media" not in json.loads(rec.requests[0].content)


def test_gbp_errors(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder(
        [(lambda r: True, lambda r: httpx.Response(403, json={"error": {"code": 403, "message": "API has not been used", "status": "PERMISSION_DENIED"}}))]
    )
    res = get_adapter("google_business", settings=make_settings(), client=rec.client()).publish(
        campaign=campaign, variant=make_variant("google_business"), image_path=None, image_url=None
    )
    assert not res.ok and "403" in res.error and "API has not been used" in res.error
    assert "GBP-TOKEN-SECRET" not in res.error

    rec2 = recorder([(lambda r: True, lambda r: httpx.Response(200, json={"name": "n", "state": "REJECTED"}))])
    res2 = get_adapter("google_business", settings=make_settings(), client=rec2.client()).publish(
        campaign=campaign, variant=make_variant("google_business"), image_path=None, image_url=None
    )
    assert not res2.ok and "rejected" in res2.error


def test_gbp_export_only_without_credentials(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder([])
    gbp = get_adapter("google_business", settings=make_settings(gbp_access_token=None), client=rec.client())
    assert gbp.status().mode == "export_only"
    res = gbp.publish(campaign=campaign, variant=make_variant("google_business"), image_path=None, image_url=None)
    assert res.ok and res.external_url is None and rec.requests == []


# --- WhatsApp / export / sandbox -----------------------------------------------------------------


def test_whatsapp_share_link(make_settings, make_variant, campaign) -> None:
    wa = get_adapter("whatsapp", settings=make_settings())
    v = make_variant("whatsapp", text="वडा पाव & chai?", link="https://g.example/r?x=1")
    res = wa.publish(campaign=campaign, variant=v, image_path=None, image_url=None)
    assert res.ok and res.external_url.startswith("https://wa.me/?text=")
    encoded = res.external_url.removeprefix("https://wa.me/?text=")
    assert "&" not in encoded and " " not in encoded
    assert unquote(encoded) == "वडा पाव & chai?\n\nhttps://g.example/r?x=1\n\n#attar #Pune"


def test_whatsapp_too_long_fails(make_settings, make_variant, campaign) -> None:
    res = get_adapter("whatsapp", settings=make_settings()).publish(
        campaign=campaign, variant=make_variant("whatsapp", text="a" * 5000), image_path=None, image_url=None
    )
    assert not res.ok and "4096" in res.error


def test_export_always_ok(make_settings, make_variant, campaign) -> None:
    res = get_adapter("export", settings=make_settings()).publish(
        campaign=campaign, variant=make_variant("export"), image_path=None, image_url=None
    )
    assert res.ok and res.external_url is None


def test_sandbox_fake_url_after_validation(make_settings, make_variant, campaign) -> None:
    sb = get_adapter("sandbox", settings=make_settings())
    res = sb.publish(campaign=campaign, variant=make_variant("sandbox"), image_path=None, image_url=None)
    assert res.ok and res.external_url == "sandbox://sandbox/cmp1"
    bad = sb.publish(campaign=campaign, variant=make_variant("sandbox", text="", hashtags=[]), image_path=None, image_url=None)
    assert not bad.ok

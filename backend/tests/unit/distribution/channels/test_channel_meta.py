from __future__ import annotations

from urllib.parse import parse_qs

import httpx

from app.distribution.channels import get_adapter


def on(method: str, suffix: str):
    return lambda r: r.method == method and r.url.path.endswith(suffix)


def form(req: httpx.Request) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(req.content.decode()).items()}


# --- Facebook Page -----------------------------------------------------------------------------


def test_fb_photo_upload_multipart_then_permalink(make_settings, make_variant, campaign, recorder, image) -> None:
    rec = recorder(
        [
            (on("POST", "/v21.0/111/photos"), lambda r: httpx.Response(200, json={"id": "p9", "post_id": "111_77"})),
            (on("GET", "/v21.0/111_77"), lambda r: httpx.Response(200, json={"permalink_url": "https://fb.com/perm/77"})),
        ]
    )
    fb = get_adapter("facebook_page", settings=make_settings(), client=rec.client())
    res = fb.publish(campaign=campaign, variant=make_variant(asset_id="a1"), image_path=image, image_url=None)
    assert res.ok and res.external_url == "https://fb.com/perm/77" and res.external_id == "111_77"
    upload = rec.requests[0]
    assert upload.headers["content-type"].startswith("multipart/form-data")
    body = upload.content
    assert b'name="source"' in body and b"fake" in body
    assert b"Fresh attars, made in Pune." in body and b"#attar #Pune" in body
    assert rec.requests[1].url.params["fields"] == "permalink_url"


def test_fb_photo_by_url(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder(
        [
            (on("POST", "/111/photos"), lambda r: httpx.Response(200, json={"id": "p9", "post_id": "111_78"})),
            (on("GET", "/111_78"), lambda r: httpx.Response(500)),
        ]
    )
    fb = get_adapter("facebook_page", settings=make_settings(), client=rec.client())
    res = fb.publish(campaign=campaign, variant=make_variant(), image_path=None, image_url="https://cdn.example/i.jpg")
    assert res.ok and res.external_url == "https://www.facebook.com/111_78"  # permalink lookup failed → fallback
    sent = form(rec.requests[0])
    assert sent["url"] == "https://cdn.example/i.jpg" and sent["access_token"] == "PAGE-TOKEN-SECRET"


def test_fb_text_only_uses_feed_with_link(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder(
        [
            (on("POST", "/111/feed"), lambda r: httpx.Response(200, json={"id": "111_80"})),
            (on("GET", "/111_80"), lambda r: httpx.Response(200, json={"permalink_url": "https://fb.com/80"})),
        ]
    )
    fb = get_adapter("facebook_page", settings=make_settings(), client=rec.client())
    res = fb.publish(campaign=campaign, variant=make_variant(link="https://perfume.example"), image_path=None, image_url=None)
    assert res.ok and res.external_url == "https://fb.com/80"
    sent = form(rec.requests[0])
    assert sent["link"] == "https://perfume.example"
    assert "https://perfume.example" not in sent["message"]


def test_fb_graph_error_is_readable_and_hides_token(make_settings, make_variant, campaign, recorder) -> None:
    err = {"error": {"message": "Error validating access token", "type": "OAuthException", "code": 190}}
    rec = recorder([(on("POST", "/feed"), lambda r: httpx.Response(400, json=err))])
    fb = get_adapter("facebook_page", settings=make_settings(), client=rec.client())
    res = fb.publish(campaign=campaign, variant=make_variant(), image_path=None, image_url=None)
    assert not res.ok
    assert "190" in res.error and "Page token" in res.error
    assert "PAGE-TOKEN-SECRET" not in res.error


def test_fb_network_error_returns_result(make_settings, make_variant, campaign) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    fb = get_adapter("facebook_page", settings=make_settings(), client=httpx.Client(transport=httpx.MockTransport(boom)))
    res = fb.publish(campaign=campaign, variant=make_variant(), image_path=None, image_url=None)
    assert not res.ok and "network error" in res.error


def test_fb_export_only_sends_nothing(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder([])
    fb = get_adapter("facebook_page", settings=make_settings(meta_page_token=None), client=rec.client())
    res = fb.publish(campaign=campaign, variant=make_variant(), image_path=None, image_url=None)
    assert res.ok and res.external_url is None
    assert rec.requests == []


def test_fb_invalid_variant_not_sent(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder([])
    fb = get_adapter("facebook_page", settings=make_settings(), client=rec.client())
    res = fb.publish(campaign=campaign, variant=make_variant(text="", hashtags=[]), image_path=None, image_url=None)
    assert not res.ok and "empty" in res.error
    assert rec.requests == []


# --- Instagram ---------------------------------------------------------------------------------


def _ig(make_settings, rec, sleeps: list[float], attempts: int = 5):
    return get_adapter(
        "instagram",
        settings=make_settings(),
        client=rec.client(),
        poll_attempts=attempts,
        poll_interval=2.0,
        sleep=sleeps.append,
    )


def test_ig_container_poll_publish_permalink(make_settings, make_variant, campaign, recorder) -> None:
    statuses = iter(["IN_PROGRESS", "IN_PROGRESS", "FINISHED"])
    rec = recorder(
        [
            (on("POST", "/v21.0/222/media"), lambda r: httpx.Response(200, json={"id": "c1"})),
            (on("GET", "/v21.0/c1"), lambda r: httpx.Response(200, json={"status_code": next(statuses), "id": "c1"})),
            (on("POST", "/v21.0/222/media_publish"), lambda r: httpx.Response(200, json={"id": "m1"})),
            (on("GET", "/v21.0/m1"), lambda r: httpx.Response(200, json={"permalink": "https://instagram.com/p/XYZ/"})),
        ]
    )
    sleeps: list[float] = []
    ig = _ig(make_settings, rec, sleeps)
    res = ig.publish(
        campaign=campaign,
        variant=make_variant("instagram", asset_id="a1"),
        image_path=None,
        image_url="https://brandviz.example.com/media/cmp1/a1.jpg",
    )
    assert res.ok, res.error
    assert res.external_url == "https://instagram.com/p/XYZ/" and res.external_id == "m1"
    assert sleeps == [2.0, 2.0]
    create = form(rec.requests[0])
    assert create["image_url"].endswith("/a1.jpg") and "#attar" in create["caption"]
    assert form(rec.requests[4])["creation_id"] == "c1"


def test_ig_container_error_stops_before_publish(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder(
        [
            (on("POST", "/222/media"), lambda r: httpx.Response(200, json={"id": "c1"})),
            (on("GET", "/c1"), lambda r: httpx.Response(200, json={"status_code": "ERROR", "status": "Error: 2207026"})),
        ]
    )
    res = _ig(make_settings, rec, []).publish(
        campaign=campaign, variant=make_variant("instagram", asset_id="a1"), image_path=None, image_url="https://x.example/a.jpg"
    )
    assert not res.ok and "2207026" in res.error
    assert not any(r.url.path.endswith("media_publish") for r in rec.requests)


def test_ig_container_poll_is_bounded(make_settings, make_variant, campaign, recorder) -> None:
    rec = recorder(
        [
            (on("POST", "/222/media"), lambda r: httpx.Response(200, json={"id": "c1"})),
            (on("GET", "/c1"), lambda r: httpx.Response(200, json={"status_code": "IN_PROGRESS"})),
        ]
    )
    sleeps: list[float] = []
    res = _ig(make_settings, rec, sleeps, attempts=3).publish(
        campaign=campaign, variant=make_variant("instagram", asset_id="a1"), image_path=None, image_url="https://x.example/a.jpg"
    )
    assert not res.ok and "still processing" in res.error
    assert len(sleeps) == 2
    assert sum(r.url.path.endswith("/c1") for r in rec.requests) == 3


def test_ig_requires_image_url(make_settings, make_variant, campaign, recorder, image) -> None:
    rec = recorder([])
    res = _ig(make_settings, rec, []).publish(
        campaign=campaign, variant=make_variant("instagram", asset_id="a1"), image_path=image, image_url=None
    )
    assert not res.ok and "public image URL" in res.error
    assert rec.requests == []


def test_ig_create_container_error(make_settings, make_variant, campaign, recorder) -> None:
    err = {"error": {"message": "Media download has failed.", "code": 9004, "error_subcode": 2207052}}
    rec = recorder([(on("POST", "/222/media"), lambda r: httpx.Response(400, json=err))])
    res = _ig(make_settings, rec, []).publish(
        campaign=campaign, variant=make_variant("instagram", asset_id="a1"), image_path=None, image_url="https://x.example/a.png"
    )
    assert not res.ok and "PUBLIC_BASE_URL" in res.error and "JPEG" in res.error

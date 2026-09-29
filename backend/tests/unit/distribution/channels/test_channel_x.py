from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from urllib.parse import unquote

import httpx

from app.distribution.channels import get_adapter, oauth1

# --- OAuth 1.0a signing -------------------------------------------------------------------------


def test_signature_matches_twitter_documented_example() -> None:
    # The worked example from X/Twitter's "Creating a signature" docs.
    params = [
        ("status", "Hello Ladies + Gentlemen, a signed OAuth request!"),
        ("include_entities", "true"),
        ("oauth_consumer_key", "xvz1evFS4wEEPTGEFPHBog"),
        ("oauth_nonce", "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg"),
        ("oauth_signature_method", "HMAC-SHA1"),
        ("oauth_timestamp", "1318622958"),
        ("oauth_token", "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb"),
        ("oauth_version", "1.0"),
    ]
    sig = oauth1.sign(
        "POST",
        "https://api.twitter.com/1.1/statuses/update.json",
        params,
        "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
        "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
    )
    assert sig == "hCtSmYh+iHYCEqBWrE7C7hYmtUk="


def test_header_includes_query_params_in_signature() -> None:
    header = oauth1.authorization_header(
        "POST",
        "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
        consumer_key="xvz1evFS4wEEPTGEFPHBog",
        consumer_secret="kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
        token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
        token_secret="LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
        form_params=[("status", "Hello Ladies + Gentlemen, a signed OAuth request!")],
        nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
        timestamp=1318622958,
    )
    assert header.startswith("OAuth ")
    assert 'oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"' in header


def _parse_header(header: str) -> dict[str, str]:
    return {k: unquote(v) for k, v in re.findall(r'(\w+)="([^"]*)"', header)}


# --- adapter ------------------------------------------------------------------------------------


def _clock(y: int, m: int):
    return lambda: datetime(y, m, 15, tzinfo=timezone.utc)


def _x(make_settings, rec, **kw):
    settings = make_settings(**{k: v for k, v in kw.items() if k != "now"})
    return get_adapter("x", settings=settings, client=rec.client(), now=kw.get("now", _clock(2026, 9)))


def _ok_routes():
    return [
        (
            lambda r: r.method == "POST" and r.url.path == "/2/media/upload",
            lambda r: httpx.Response(200, json={"data": {"id": "M1", "media_key": "3_M1"}}),
        ),
        (
            lambda r: r.method == "POST" and r.url.path == "/2/tweets",
            lambda r: httpx.Response(201, json={"data": {"id": "T1", "text": "..."}}),
        ),
    ]


def test_x_upload_then_post_with_signed_requests(make_settings, make_variant, campaign, recorder, data_dir, image) -> None:
    rec = recorder(_ok_routes())
    x = _x(make_settings, rec)
    res = x.publish(campaign=campaign, variant=make_variant("x", asset_id="a1"), image_path=image, image_url=None)
    assert res.ok, res.error
    assert res.external_id == "T1" and res.external_url == "https://x.com/i/web/status/T1"

    upload, tweet = rec.requests
    assert upload.url.host == "api.x.com"
    assert b'name="media"' in upload.content and b"tweet_image" in upload.content
    assert json.loads(tweet.content) == {
        "text": "Fresh attars, made in Pune.\n\n#attar #Pune",
        "media": {"media_ids": ["M1"]},
    }
    for req in (upload, tweet):
        h = _parse_header(req.headers["authorization"])
        assert h["oauth_consumer_key"] == "ck" and h["oauth_token"] == "at"
        oauth_params = [(k, v) for k, v in h.items() if k != "oauth_signature"]
        assert h["oauth_signature"] == oauth1.sign("POST", str(req.url), oauth_params, "cs", "as")


def test_x_text_only_skips_upload(make_settings, make_variant, campaign, recorder, data_dir) -> None:
    rec = recorder(_ok_routes())
    res = _x(make_settings, rec).publish(campaign=campaign, variant=make_variant("x"), image_path=None, image_url=None)
    assert res.ok
    assert [r.url.path for r in rec.requests] == ["/2/tweets"]
    assert "media" not in json.loads(rec.requests[0].content)


def test_x_quota_counts_successful_posts_per_month(make_settings, make_variant, campaign, recorder, data_dir) -> None:
    rec = recorder(_ok_routes())
    x = _x(make_settings, rec, x_monthly_post_limit=2)
    assert x.status().quota_remaining == 2
    for _ in range(2):
        assert x.publish(campaign=campaign, variant=make_variant("x"), image_path=None, image_url=None).ok
    assert x.status().quota_remaining == 0
    assert json.loads((data_dir / "channels" / "x_usage.json").read_text()) == {"2026-09": 2}

    n = len(rec.requests)
    blocked = x.publish(campaign=campaign, variant=make_variant("x"), image_path=None, image_url=None)
    assert not blocked.ok and "monthly post limit" in blocked.error
    assert len(rec.requests) == n  # nothing sent

    next_month = _x(make_settings, rec, x_monthly_post_limit=2, now=_clock(2026, 10))
    assert next_month.status().quota_remaining == 2


def test_x_failed_post_not_counted_and_403_hint(make_settings, make_variant, campaign, recorder, data_dir) -> None:
    rec = recorder(
        [
            (
                lambda r: r.url.path == "/2/tweets",
                lambda r: httpx.Response(403, json={"title": "Forbidden", "detail": "You are not permitted to perform this action."}),
            )
        ]
    )
    x = _x(make_settings, rec)
    res = x.publish(campaign=campaign, variant=make_variant("x"), image_path=None, image_url=None)
    assert not res.ok
    assert "403" in res.error and "not permitted" in res.error and "Read and Write" in res.error
    assert "cs" not in res.error.split() and x.posts_this_month() == 0


def test_x_upload_failure(make_settings, make_variant, campaign, recorder, data_dir, image) -> None:
    rec = recorder(
        [(lambda r: r.url.path == "/2/media/upload", lambda r: httpx.Response(400, json={"errors": [{"message": "bad media"}]}))]
    )
    res = _x(make_settings, rec).publish(campaign=campaign, variant=make_variant("x", asset_id="a1"), image_path=image, image_url=None)
    assert not res.ok and "image upload failed" in res.error and "bad media" in res.error
    assert all(r.url.path != "/2/tweets" for r in rec.requests)


def test_x_corrupt_usage_file_is_tolerated(make_settings, recorder, data_dir) -> None:
    (data_dir / "channels").mkdir()
    (data_dir / "channels" / "x_usage.json").write_text("{not json")
    assert _x(make_settings, recorder([])).status().quota_remaining == 500


def test_x_export_only_without_keys(make_settings, recorder, data_dir) -> None:
    st = _x(make_settings, recorder([]), x_access_secret=None).status()
    assert st.mode == "export_only" and "X_ACCESS_SECRET" in st.detail and st.quota_remaining is None

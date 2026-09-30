from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.distribution.channels import channel_statuses, compose_text, get_adapter, x_weighted_length
from app.distribution.channels.base import ChannelAdapter, normalize_hashtags
from app.distribution.types import CHANNEL_IDS


def test_statuses_cover_all_channels_in_order_with_no_settings() -> None:
    statuses = channel_statuses(settings=SimpleNamespace())
    assert [s.channel for s in statuses] == list(CHANNEL_IDS)
    modes = {s.channel: s.mode for s in statuses}
    assert modes == {
        "facebook_page": "export_only",
        "instagram": "export_only",
        "x": "export_only",
        "linkedin": "export_only",
        "google_business": "export_only",
        "whatsapp": "export_only",
        "export": "connected",
        "sandbox": "connected",
    }
    by = {s.channel: s for s in statuses}
    assert by["google_business"].detail == "Needs Google Business Profile API access (apply: see CHANNEL_SETUP.md)"
    assert "simulated" in by["sandbox"].label.lower()
    assert "META_PAGE_ID" in by["facebook_page"].detail


def test_statuses_connected_with_full_settings(make_settings, data_dir) -> None:
    by = {s.channel: s for s in channel_statuses(settings=make_settings())}
    for ch in ("facebook_page", "instagram", "x", "google_business"):
        assert by[ch].mode == "connected", ch
    assert by["x"].quota_remaining == 500
    assert by["whatsapp"].mode == "export_only"


def test_blank_settings_count_as_unset(make_settings) -> None:
    by = {s.channel: s for s in channel_statuses(settings=make_settings(meta_page_token="  ", gbp_access_token=""))}
    assert by["facebook_page"].mode == "export_only"
    assert by["google_business"].mode == "export_only"


def test_instagram_needs_public_base_url(make_settings) -> None:
    st = get_adapter("instagram", settings=make_settings(public_base_url=None)).status()
    assert st.mode == "export_only"
    assert "needs PUBLIC_BASE_URL (public image hosting)" in st.detail.replace("Needs", "needs")
    st = get_adapter("instagram", settings=make_settings(public_base_url="http://localhost:8000")).status()
    assert st.mode == "export_only"


def test_real_settings_object_works() -> None:
    assert len(channel_statuses()) == len(CHANNEL_IDS)  # reads env/.env; must not crash either way


def test_get_adapter_unknown_channel() -> None:
    with pytest.raises(ValueError):
        get_adapter("myspace")  # type: ignore[arg-type]


def test_every_adapter_satisfies_protocol(make_settings) -> None:
    for ch in CHANNEL_IDS:
        adapter = get_adapter(ch, settings=make_settings())
        assert isinstance(adapter, ChannelAdapter)
        assert adapter.channel == ch


# --- text composition & validation ----------------------------------------------------------------


def test_hashtags_normalized_and_deduped() -> None:
    assert normalize_hashtags(["attar", "#Pune Local", "#ATTAR", "", "#"]) == ["#attar", "#PuneLocal"]


def test_compose_text_order_and_link_not_duplicated(make_variant) -> None:
    v = make_variant(link="https://perfume.example/faq")
    assert compose_text(v) == "Fresh attars, made in Pune.\n\nhttps://perfume.example/faq\n\n#attar #Pune"
    v2 = make_variant(text="See https://perfume.example/faq", link="https://perfume.example/faq", hashtags=[])
    assert compose_text(v2) == "See https://perfume.example/faq"


def test_x_weighted_length_counts_urls_as_23_and_cjk_double() -> None:
    assert x_weighted_length("hi https://a.very.long.example.com/path/that/is/long") == 3 + 23
    assert x_weighted_length("वडा पाव") == 7  # Devanagari weighs 1 per code point
    assert x_weighted_length("日本") == 4


def test_x_validation_counts_hashtags_and_link(make_settings, make_variant) -> None:
    adapter = get_adapter("x", settings=make_settings())
    ok = make_variant("x", text="a" * 240, hashtags=["b"], link="https://example.com/" + "p" * 100)
    # 240 + 2 + 23 (link) + 2 + 2 ("#b") = 269
    assert adapter.validate(ok) == []
    too_long = make_variant("x", text="a" * 260, hashtags=["b"], link="https://example.com")
    issues = adapter.validate(too_long)
    assert issues and "289/280" in issues[0]


def test_empty_text_is_an_issue(make_settings, make_variant) -> None:
    for ch in ("facebook_page", "whatsapp", "sandbox"):
        assert get_adapter(ch, settings=make_settings()).validate(make_variant(ch, text="  ", hashtags=[]))


def test_limits_per_channel(make_settings, make_variant) -> None:
    s = make_settings()
    assert get_adapter("whatsapp", settings=s).validate(make_variant("whatsapp", text="a" * 4096, hashtags=[])) == []
    assert get_adapter("whatsapp", settings=s).validate(make_variant("whatsapp", text="a" * 4090))  # + hashtags
    assert get_adapter("google_business", settings=s).validate(make_variant("google_business", text="a" * 1500)) == []
    assert get_adapter("google_business", settings=s).validate(make_variant("google_business", text="a" * 1501))


def test_instagram_validation(make_settings, make_variant) -> None:
    ig = get_adapter("instagram", settings=make_settings(public_base_url=None))
    issues = " ".join(ig.validate(make_variant("instagram", hashtags=[f"t{i}" for i in range(31)])))
    assert "image" in issues
    assert "PUBLIC_BASE_URL" in issues
    assert "30 hashtags" in issues
    ok = get_adapter("instagram", settings=make_settings())
    assert ok.validate(make_variant("instagram", asset_id="a1")) == []

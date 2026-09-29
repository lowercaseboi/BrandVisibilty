import pytest

from app.distribution import kits
from app.distribution.types import CHANNEL_IDS, IMAGE_SIZES
from app.recommendation.engine import ACTION_VOCABULARY


def test_every_action_in_the_vocabulary_has_a_kit():
    assert set(kits.KITS) == set(ACTION_VOCABULARY)
    for action in ACTION_VOCABULARY:
        kit = kits.kit_for(action)
        assert kit.action == action and kit.deliverables
        assert set(kit.channels) <= set(CHANNEL_IDS)
        assert set(kit.image_formats) <= set(IMAGE_SIZES)
        assert "export" in kit.variant_channels  # every kit has an export fallback


def test_unknown_action_is_rejected():
    with pytest.raises(KeyError):
        kits.kit_for("buy_ads")


@pytest.mark.parametrize("action", ["community_answer", "submit_to_directory", "pitch_listicle"])
def test_listing_outreach_and_community_kits_are_export_only(action):
    kit = kits.kit_for(action)
    assert not kit.auto_post
    assert kit.channels == ()
    assert kit.variant_channels == ("export",)


def test_social_kits_post_to_social_channels_with_matching_images():
    for kit in kits.KITS.values():
        if not kit.auto_post:
            continue
        assert kit.channels == kits.SOCIAL_CHANNELS
        assert "sandbox" in kit.variant_channels
        assert "social_post" in kit.deliverables
        for channel in kit.channels:
            assert kits.CHANNEL_FORMAT[channel] in kit.image_formats


def test_kit_deliverables_follow_the_plan():
    assert {"article", "faq"} <= set(kits.kit_for("comparison_page").deliverables)
    assert "video_script" in kits.kit_for("video").deliverables
    assert "profile_copy" in kits.kit_for("clarify_category_descriptor").deliverables
    assert "review_request" in kits.kit_for("seek_review_coverage").deliverables
    assert kits.kit_for("submit_to_directory").deliverables == ("listing",)
    assert kits.kit_for("pitch_listicle").deliverables == ("outreach_email",)


def test_image_prompt_is_deterministic_scene_only_and_never_names_the_competitor():
    kit = kits.kit_for("comparison_page")
    kw = {"category": "vada pav outlet", "cities": ("Mumbai",), "audiences": ("students",), "competitor": "Ashok Vada Pav"}
    prompt = kits.image_prompt(kit, **kw)
    assert prompt == kits.image_prompt(kit, **kw)
    assert "vada pav outlet" in prompt and "Mumbai" in prompt
    assert "Ashok" not in prompt
    assert "no text" in prompt.lower()

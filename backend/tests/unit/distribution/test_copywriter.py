import json

import pytest

from app.brands.registry import get_brand
from app.distribution import copywriter as cw
from app.distribution import kits
from app.distribution.types import TEXT_LIMITS, Variant

FACTS = cw.BrandFacts.from_config(get_brand("gajanan_vada_pav"))
GAP = {"gap_id": "gap-1", "gap_type": "competitive", "detail": {"competitor_id": "ashok_vada_pav"}}
REC = {"recommendation_id": "rec-1", "gap_id": "gap-1", "action": "comparison_page", "reasoning": "r"}


def test_facts_come_from_the_brand_profile():
    assert FACTS.name == "Gajanan Vada Pav"
    assert FACTS.category == "vada pav outlet"
    assert FACTS.cities == ("Mumbai",)
    assert "Ashok Vada Pav" in FACTS.competitors
    assert "Gajanan" in FACTS.aliases and FACTS.jobs


@pytest.mark.parametrize("action", sorted(kits.KITS))
def test_template_draft_for_every_action(action):
    kit = kits.kit_for(action)
    draft = cw.draft_campaign(kit, FACTS, gap=GAP, recommendation=REC, competitor="Ashok Vada Pav", provider_id=None)
    assert draft.drafted_by == "template"
    assert draft.headline and len(draft.overlay_text) <= cw.OVERLAY_MAX
    assert [v.channel for v in draft.variants] == list(kit.variant_channels)
    expected = [k for k in kit.deliverables if k != "social_post"]
    assert [d.kind for d in draft.deliverables] == expected
    for v in draft.variants:
        assert FACTS.name in v.text
        assert len(cw.compose(v)) <= TEXT_LIMITS[v.channel]
        assert len(v.hashtags) <= cw.HASHTAG_CAPS[v.channel]
        assert all(h.startswith("#") for h in v.hashtags)
        # template copy never makes claims or leaves placeholders in a post
        assert not [i for i in v.issues if "claim" in i.lower() or "placeholder" in i.lower()], v.issues
    assert "no text" in draft.image_prompt.lower()


def test_template_is_deterministic():
    kit = kits.kit_for("faq_page")
    a = cw.draft_campaign(kit, FACTS, gap=GAP, recommendation=REC, provider_id=None)
    b = cw.draft_campaign(kit, FACTS, gap=GAP, recommendation=REC, provider_id=None)
    assert a == b


def test_faq_has_jsonld_and_review_request_has_wa_link():
    faq = cw.draft_campaign(kits.kit_for("faq_page"), FACTS, gap=GAP, recommendation=REC, provider_id=None)
    jsonld = json.loads(faq.deliverables[0].extra["jsonld"])
    assert jsonld["@type"] == "FAQPage" and len(jsonld["mainEntity"]) >= 3
    review = cw.draft_campaign(kits.kit_for("seek_review_coverage"), FACTS, gap=GAP, recommendation=REC, provider_id=None)
    d = next(d for d in review.deliverables if d.kind == "review_request")
    assert d.extra["wa_link"].startswith("https://wa.me/?text=")


def test_community_answer_keeps_a_disclosure():
    draft = cw.draft_campaign(kits.kit_for("community_answer"), FACTS, gap=GAP, recommendation=REC, provider_id=None)
    assert "Disclosure" in draft.deliverables[0].body


@pytest.mark.parametrize(
    "text",
    ["The best vada pav in Mumbai", "We are #1 in town", "Award-winning taste", "Only ₹20!", "20% off today",
     "Use promo code VADA", "The cheapest in the city", "Most popular stall"],
)
def test_unsupported_claims_are_flagged(text):
    v = cw.validate_variant(Variant(channel="facebook_page", text=f"Gajanan Vada Pav. {text}"), FACTS)
    assert any("Unsupported claim" in i for i in v.issues), v.issues


def test_competitor_named_and_placeholder_are_flagged():
    v = cw.validate_variant(Variant(channel="x", text="Gajanan vs Ashok Vada Pav [add fact]"), FACTS)
    assert any("competitor" in i for i in v.issues)
    assert any("placeholder" in i for i in v.issues)


def test_fix_trims_x_to_limit_and_drops_claim_hashtags():
    v = Variant(channel="x", text="word " * 100, hashtags=["#BestVadaPav", "Mumbai Food", "#mumbai", "#Extra", "#More"])
    cw.validate_variant(v, FACTS, fix=True)
    assert len(cw.compose(v)) <= 280
    assert "#BestVadaPav" not in v.hashtags and len(v.hashtags) <= 2
    assert any("Removed hashtag" in i for i in v.issues)
    assert any("Shortened" in i for i in v.issues)


def test_without_fix_too_long_is_reported_not_changed():
    text = "a" * 300
    v = cw.validate_variant(Variant(channel="x", text=text), FACTS)
    assert v.text == text and any("Too long" in i for i in v.issues)


def _llm_reply(**over):
    kit = kits.kit_for("comparison_page")
    data = {
        "headline": "Gajanan Vada Pav in Mumbai",
        "overlay_text": "Hot vada pav, Mumbai",
        "image_scene": "a steaming vada pav on a steel plate at a Mumbai street stall",
        "variants": {c: {"text": f"Gajanan Vada Pav post for {c}", "hashtags": ["#VadaPav", "#BestInMumbai"], "alt_text": "vada pav"} for c in kit.variant_channels},
        "faq": [{"q": f"Q{i}?", "a": f"A{i}."} for i in range(4)],
        "deliverables": {"article": {"title": "Choosing a vada pav outlet", "body": "# Article\n\nGajanan Vada Pav ..."}},
    }
    data.update(over)
    return "```json\n" + json.dumps(data) + "\n```"


def test_llm_path_is_parsed_validated_and_recorded():
    seen = {}

    def llm(prompt, system):
        seen["prompt"], seen["system"] = prompt, system
        return _llm_reply(), "gemini-3.1-flash-lite-001"

    kit = kits.kit_for("comparison_page")
    draft = cw.draft_campaign(kit, FACTS, gap=GAP, recommendation=REC, competitor="Ashok Vada Pav", provider_id="gemini", llm=llm)
    assert draft.drafted_by == "gemini:gemini-3.1-flash-lite-001"
    assert draft.headline == "Gajanan Vada Pav in Mumbai"
    assert "Gajanan Vada Pav" in seen["prompt"] and "never" in seen["system"]
    fb = next(v for v in draft.variants if v.channel == "facebook_page")
    assert fb.text == "Gajanan Vada Pav post for facebook_page"
    assert "#BestInMumbai" not in fb.hashtags and "#VadaPav" in fb.hashtags
    assert "steel plate" in draft.image_prompt
    assert draft.deliverables[0].body.startswith("# Article")
    faq = next(d for d in draft.deliverables if d.kind == "faq")
    assert "Q0?" in faq.body and "jsonld" in faq.extra


def test_llm_claims_in_text_end_up_in_issues():
    kit = kits.kit_for("faq_page")
    reply = _llm_reply(variants={"x": {"text": "Gajanan Vada Pav: the best vada pav, 50% off", "hashtags": []}})
    draft = cw.draft_campaign(kit, FACTS, gap=GAP, recommendation=REC, provider_id="groq", llm=lambda p, s: (reply, "m"))
    x = next(v for v in draft.variants if v.channel == "x")
    assert "50% off" in x.text  # kept for the human to see…
    assert sum("Unsupported claim" in i for i in x.issues) >= 2  # …but never silently


@pytest.mark.parametrize("reply", ["not json at all", "{broken", json.dumps(["a list"])])
def test_bad_llm_reply_falls_back_to_template(reply):
    kit = kits.kit_for("faq_page")
    draft = cw.draft_campaign(kit, FACTS, gap=GAP, recommendation=REC, provider_id="gemini", llm=lambda p, s: (reply, "m"))
    assert draft.drafted_by == "template" and draft.notes


def test_llm_exception_falls_back_to_template():
    def boom(prompt, system):
        raise RuntimeError("429")

    draft = cw.draft_campaign(kits.kit_for("video"), FACTS, gap=GAP, recommendation=REC, provider_id="gemini", llm=boom)
    assert draft.drafted_by == "template"


def test_resolve_copy_provider():
    from types import SimpleNamespace as NS

    assert cw.resolve_copy_provider(NS(copy_provider="auto", gemini_api_key=None, groq_api_key=None)) is None
    assert cw.resolve_copy_provider(NS(copy_provider="auto", gemini_api_key=None, groq_api_key="k")) == "groq"
    assert cw.resolve_copy_provider(NS(copy_provider="auto", gemini_api_key="k", groq_api_key="k")) == "gemini"
    assert cw.resolve_copy_provider(NS(copy_provider="template", gemini_api_key="k", groq_api_key="k")) is None
    assert cw.resolve_copy_provider(NS(copy_provider="groq", gemini_api_key="k", groq_api_key=None)) is None

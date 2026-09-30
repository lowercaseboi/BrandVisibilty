"""Campaign kits — pure and deterministic: no I/O, no LLM calls.

Maps every action in the closed recommendation vocabulary (recommendation/engine.py
ACTION_VOCABULARY) to a *kit*: what the campaign must produce (deliverables), which channels get a
variant by default, which image formats are needed, and the skeleton of the image prompt.

The image prompt describes a *scene only*. Image models can't render text reliably, so brand
name / headline / CTA are drawn afterwards by our compositor; the prompt never asks for text,
logos or a competitor's branding.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.distribution.types import ChannelId, DeliverableKind, ImageFormat
from app.recommendation.engine import ACTION_CLASS, ACTION_LABEL, ACTION_VOCABULARY

# Social channels a social kit posts to by default (WhatsApp = share link + status image).
SOCIAL_CHANNELS: tuple[ChannelId, ...] = ("facebook_page", "instagram", "x", "linkedin", "google_business", "whatsapp")

# Which image each channel posts.
CHANNEL_FORMAT: dict[ChannelId, ImageFormat] = {
    "facebook_page": "square",
    "instagram": "square",
    "x": "landscape",
    "linkedin": "landscape",
    "google_business": "gbp",
    "whatsapp": "story",
    "sandbox": "square",
    "export": "square",
}


@dataclass(frozen=True)
class Kit:
    action: str
    action_class: str
    label: str
    deliverables: tuple[DeliverableKind, ...]
    channels: tuple[ChannelId, ...]  # default publishing channels (empty for export-only kits)
    image_formats: tuple[ImageFormat, ...]
    auto_post: bool  # False: export only — never posted automatically (listings, pitches, forums)
    angle: str  # what the social post is about, one short phrase (template copy + LLM brief)
    scene: str  # image scene skeleton; fields: {a_category} {city} {audience}

    @property
    def variant_channels(self) -> tuple[ChannelId, ...]:
        """Every channel that gets a Variant: the defaults, plus the sandbox (simulated publish,
        for demos) on social kits, plus the export pack on every kit."""
        extra: tuple[ChannelId, ...] = ("sandbox", "export") if self.auto_post else ("export",)
        return self.channels + extra


def _formats(channels: tuple[ChannelId, ...], *more: ImageFormat) -> tuple[ImageFormat, ...]:
    out: list[ImageFormat] = []
    for fmt in [CHANNEL_FORMAT[c] for c in channels] + list(more):
        if fmt not in out:
            out.append(fmt)
    return tuple(out)


_SOCIAL_FORMATS = _formats(SOCIAL_CHANNELS)

_SCENE_PRODUCT = (
    "an inviting, high-quality photo at {a_category} in {city}, the product as the hero, "
    "real local setting, {audience} enjoying it"
)
_SCENE_CHOICE = (
    "an editorial photo about choosing {a_category} in {city}: a customer comparing options, "
    "the product in sharp focus, no brand logos or signage"
)
_SCENE_STOREFRONT = (
    "a welcoming street-level view of {a_category} in {city}, warm light, friendly staff serving "
    "customers, no readable signage"
)
_SCENE_COMMUNITY = (
    "happy {audience} sharing a moment at {a_category} in {city}, candid and authentic"
)
_SCENE_VIDEO = "a cinematic thumbnail frame at {a_category} in {city}, close-up, dramatic light, space for a title"

_KIT_SPECS: dict[str, tuple[tuple[DeliverableKind, ...], bool, str, str, tuple[ImageFormat, ...]]] = {
    # action: (deliverables, auto_post, angle, scene, extra formats)
    "comparison_page": (("article", "faq", "social_post"), True, "how to choose", _SCENE_CHOICE, ()),
    "use_case_page": (("article", "faq", "social_post"), True, "who it is for", _SCENE_PRODUCT, ()),
    "faq_page": (("faq", "social_post"), True, "answers to common questions", _SCENE_PRODUCT, ()),
    "video": (("video_script", "social_post"), True, "a short video", _SCENE_VIDEO, ()),
    "clarify_category_descriptor": (("profile_copy", "social_post"), True, "what we are", _SCENE_STOREFRONT, ()),
    "add_attribute_claim": (("profile_copy", "social_post"), True, "what makes us different", _SCENE_PRODUCT, ()),
    "correct_outdated_description": (("profile_copy", "social_post"), True, "an update about us", _SCENE_STOREFRONT, ()),
    "seek_review_coverage": (("review_request", "social_post"), True, "asking for reviews", _SCENE_COMMUNITY, ()),
    "submit_to_directory": (("listing",), False, "a directory listing", _SCENE_STOREFRONT, ("square",)),
    "pitch_listicle": (("outreach_email",), False, "a roundup pitch", _SCENE_PRODUCT, ("landscape",)),
    "community_answer": (("community_answer",), False, "a community answer", _SCENE_COMMUNITY, ()),
}


def _build(action: str) -> Kit:
    deliverables, auto_post, angle, scene, extra = _KIT_SPECS[action]
    channels: tuple[ChannelId, ...] = SOCIAL_CHANNELS if auto_post else ()
    formats = _formats(channels, *extra) if auto_post else tuple(dict.fromkeys(extra))
    return Kit(
        action=action,
        action_class=ACTION_CLASS[action],
        label=ACTION_LABEL[action],
        deliverables=deliverables,
        channels=channels,
        image_formats=formats,
        auto_post=auto_post,
        angle=angle,
        scene=scene,
    )


KITS: dict[str, Kit] = {action: _build(action) for action in sorted(ACTION_VOCABULARY)}


def kit_for(action: str) -> Kit:
    """The kit for a closed-vocabulary action. KeyError for anything outside the vocabulary."""
    return KITS[action]


def image_prompt(
    kit: Kit,
    *,
    category: str,
    cities: tuple[str, ...] | list[str] = (),
    audiences: tuple[str, ...] | list[str] = (),
    competitor: str | None = None,
) -> str:
    """Scene description for the image provider, from brand facts only. Never asks for text.
    A competitor (comparison kits) only changes the composition — it is never named or shown."""
    city = cities[0] if cities else "the city"
    audience = audiences[0] if audiences else "local customers"
    category = category or "local business"
    a_category = ("an " if category[:1].lower() in "aeiou" else "a ") + category
    scene = kit.scene.format(a_category=a_category, city=city, audience=audience)
    if competitor and kit.action == "comparison_page":
        scene += ", two unbranded options side by side, one in the foreground, no logos"
    return f"{scene}. Leave clean space in the lower third for a caption; no text, no letters, no logos in the image."

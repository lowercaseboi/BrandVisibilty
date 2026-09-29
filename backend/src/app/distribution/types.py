"""Shared contract for the distribution module ("Campaign Studio", PRD §11.5 / AC-10).

A recommendation becomes a Campaign: channel-specific copy (Variants) plus generated images
(Assets). A human edits and approves it; only then can it be published, and every publish attempt
— success or failure — is recorded as a DistributionEvent (and an AuditLogEntry). Every campaign
keeps its recommendation_id and gap_id, so AC-7 traceability extends to what was posted.

Shapes are plain dataclasses that map 1:1 onto the DESIGN ER entities (Campaign, Asset, Variant,
DistributionEvent, AuditLogEntry) so a later PostgreSQL migration is mechanical. JSON on disk and
over the API uses exactly these field names (the frontend mirrors them in src/api/types.ts).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# --- enums (string literals keep JSON and TS mirrors trivial) ------------------------------------

ChannelId = Literal["facebook_page", "instagram", "x", "google_business", "whatsapp", "export", "sandbox"]
CHANNEL_IDS: tuple[ChannelId, ...] = (
    "facebook_page",
    "instagram",
    "x",
    "google_business",
    "whatsapp",
    "export",
    "sandbox",
)

# connected: can publish now · export_only: adapter exists but no credentials / no API (copy + download)
# · disabled: turned off in config.
ChannelMode = Literal["connected", "export_only", "disabled"]

# draft → (generating) → ready → approved → published | partially_published | failed
# Any edit to an approved campaign drops it back to "ready" (approval revoked).
CampaignStatus = Literal["generating", "ready", "approved", "published", "partially_published", "failed"]

# What a campaign kit asks for, from the closed action vocabulary (recommendation/engine.py).
DeliverableKind = Literal[
    "social_post",  # short ad/post copy + image, per social channel
    "article",  # long-form article / comparison / use-case page (crawlable text for AI visibility)
    "faq",  # Q&A pairs + FAQ JSON-LD snippet for the brand's website
    "profile_copy",  # GBP description, IG bio, website "about" rewrite
    "video_script",  # script + shot list (+ thumbnail image)
    "review_request",  # WhatsApp/SMS review-request message + QR poster
    "listing",  # prefilled directory listing text
    "outreach_email",  # listicle / review pitch email
    "community_answer",  # answer text for a forum thread (export only — never auto-posted)
]

# Output image sizes, px (width, height). The compositor crops/overlays per target.
ImageFormat = Literal["square", "portrait", "landscape", "story", "gbp"]
IMAGE_SIZES: dict[ImageFormat, tuple[int, int]] = {
    "square": (1080, 1080),  # IG / FB feed
    "portrait": (1080, 1350),  # IG portrait
    "landscape": (1200, 675),  # X card / FB link
    "story": (1080, 1920),  # WhatsApp status / stories
    "gbp": (1200, 900),  # Google Business post
}

# Per-channel hard limits used by validation (characters).
TEXT_LIMITS: dict[ChannelId, int] = {
    "facebook_page": 63_206,
    "instagram": 2_200,
    "x": 280,
    "google_business": 1_500,
    "whatsapp": 4_096,
    "export": 1_000_000,
    "sandbox": 1_000_000,
}

EventOutcome = Literal["published", "failed", "exported", "blocked"]  # blocked = gate refused


# --- entities -------------------------------------------------------------------------------------


@dataclass
class Asset:
    """One generated image (base scene from an image provider + our text overlay)."""

    asset_id: str
    format: ImageFormat
    path: str  # relative to DATA_DIR/media, e.g. "<campaign_id>/<asset_id>.png"
    provider: str  # "gemini" | "cloudflare" | "template"
    prompt: str
    seed: int | None = None
    overlay_text: str | None = None  # headline/CTA drawn by the compositor, not the model
    created_at: str = ""


@dataclass
class Variant:
    """Copy for one channel. `approved_hash` is set on approval; any edit that changes
    `content_hash()` makes the campaign unpublishable until re-approved."""

    channel: ChannelId
    text: str
    hashtags: list[str] = field(default_factory=list)
    link: str | None = None
    asset_id: str | None = None  # which Asset this channel posts
    alt_text: str | None = None
    enabled: bool = True
    approved_hash: str | None = None
    issues: list[str] = field(default_factory=list)  # validation problems (too long, unsupported claim…)


@dataclass
class Deliverable:
    """Non-post output of the kit (article, FAQ + JSON-LD, profile copy, script, email…)."""

    kind: DeliverableKind
    title: str
    body: str  # markdown
    extra: dict[str, str] = field(default_factory=dict)  # e.g. {"jsonld": "..."} or {"qr_url": "..."}


@dataclass
class DistributionEvent:
    """One publish/export attempt on one channel (AC-10: logged regardless of outcome)."""

    event_id: str
    campaign_id: str
    recommendation_id: str
    channel: ChannelId
    outcome: EventOutcome
    at: str
    external_url: str | None = None
    external_id: str | None = None
    error: str | None = None
    content_hash: str | None = None  # what exactly was sent


@dataclass
class AuditLogEntry:
    entry_id: str
    actor: str  # "admin" (token holder) | "system"
    action: str  # "campaign.create" | "campaign.edit" | "campaign.approve" | "campaign.publish" | ...
    target_ref: str  # campaign_id (+ channel)
    at: str
    context: dict[str, str] = field(default_factory=dict)


@dataclass
class Campaign:
    campaign_id: str
    brand_key: str
    recommendation_id: str
    gap_id: str  # AC-7: never empty
    action: str  # closed-vocabulary action from the recommendation
    suggestion_key: str  # board card key (`action|competitor_id`) so the board status can follow
    status: CampaignStatus
    created_at: str
    updated_at: str
    headline: str = ""
    variants: list[Variant] = field(default_factory=list)
    assets: list[Asset] = field(default_factory=list)
    deliverables: list[Deliverable] = field(default_factory=list)
    events: list[DistributionEvent] = field(default_factory=list)
    drafted_by: str = ""  # "gemini:<model>" | "groq:<model>" | "template"
    approved_at: str | None = None
    job_id: str | None = None  # generation job while status == "generating"


@dataclass
class ChannelStatus:
    channel: ChannelId
    label: str
    mode: ChannelMode
    detail: str = ""  # e.g. "Page: Local Perfume Co" or "needs GBP API approval"
    quota_remaining: int | None = None  # X free tier posts left this month, when known


@dataclass
class PublishResult:
    ok: bool
    external_url: str | None = None
    external_id: str | None = None
    error: str | None = None

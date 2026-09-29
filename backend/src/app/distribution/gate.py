"""Approval gate (PRD §11.5, AC-10, §15.7) — pure: no I/O, no clock reads (callers pass `now`).

Invariants:
- A channel can be published only when the campaign has been approved AND that channel's variant
  still has exactly the content that was approved (`approved_hash == content_hash(variant)`).
- Any edit that changes an approved variant's content revokes the approval of the whole campaign
  (status back to "ready", every `approved_hash` cleared) — `revalidate` enforces this.
- A disabled variant is never publishable.
- `export` and `whatsapp` send nothing to a platform (a download / a share link the human sends
  themselves), so they're allowed without approval; the service still logs them ("exported").
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace

from app.distribution.types import Campaign, ChannelId, Variant

# Channels whose "publish" sends nothing externally.
EXPORT_CHANNELS: frozenset[str] = frozenset({"export", "whatsapp"})
# Channels that need no admin token even when the server has none set (nothing leaves the server,
# or sandbox only simulates).
LOCAL_CHANNELS: frozenset[str] = frozenset({"sandbox", "export", "whatsapp"})


class GateError(ValueError):
    """An approval request the gate refuses (e.g. while the campaign is still generating)."""


def content_hash(variant: Variant) -> str:
    """Hash of exactly what would be posted: text, hashtags, link, image and alt text."""
    basis = json.dumps(
        {
            "text": variant.text,
            "hashtags": list(variant.hashtags),
            "link": variant.link,
            "asset_id": variant.asset_id,
            "alt_text": variant.alt_text,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:20]


def _variant(campaign: Campaign, channel: str) -> Variant | None:
    return next((v for v in campaign.variants if v.channel == channel), None)


def approve(campaign: Campaign, *, now: str) -> Campaign:
    """Approve the campaign as it stands: every enabled variant gets its current content hash;
    disabled ones get none. Returns a new Campaign (the input is not modified)."""
    if campaign.status == "generating":
        raise GateError("The campaign is still being generated")
    if not any(v.enabled for v in campaign.variants):
        raise GateError("Enable at least one channel before approving")
    variants = [replace(v, approved_hash=content_hash(v) if v.enabled else None) for v in campaign.variants]
    return replace(campaign, variants=variants, status="approved", approved_at=now, updated_at=now)


def is_approved(campaign: Campaign) -> bool:
    return campaign.approved_at is not None and campaign.status not in ("generating", "ready")


def revalidate(campaign: Campaign, *, now: str) -> Campaign:
    """Call after every edit. If the campaign was approved and any enabled variant no longer
    matches what was approved (content changed, or a never-approved channel was switched on),
    the approval is revoked for the whole campaign. Otherwise returned unchanged."""
    if campaign.approved_at is None:
        return campaign
    stale = any(v.enabled and v.approved_hash != content_hash(v) for v in campaign.variants)
    if not stale:
        return campaign
    variants = [replace(v, approved_hash=None) for v in campaign.variants]
    return replace(campaign, variants=variants, status="ready", approved_at=None, updated_at=now)


def can_publish(campaign: Campaign, channel: ChannelId) -> tuple[bool, str]:
    """(ok, reason). `reason` explains a refusal in plain English (it goes on the blocked event)."""
    variant = _variant(campaign, channel)
    if variant is None:
        return False, f"This campaign has no {channel} version"
    if not variant.enabled:
        return False, f"The {channel} version is switched off"
    if campaign.status == "generating":
        return False, "The campaign is still being generated"
    if channel in EXPORT_CHANNELS:
        return True, "Export only: nothing is sent to a platform"
    if not is_approved(campaign) or variant.approved_hash is None:
        return False, "Not approved: approve the campaign before publishing"
    if variant.approved_hash != content_hash(variant):
        return False, "Edited since approval: approve it again before publishing"
    return True, "Approved"

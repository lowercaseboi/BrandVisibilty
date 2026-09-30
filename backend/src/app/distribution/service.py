"""Campaign Studio service: recommendation → campaign → edit → approve → publish (PRD §11.5, AC-10).

Orchestrates the pure pieces (kits, gate), the copywriter, image generation
(`app.distribution.imagegen.generate_asset`) and channel adapters
(`app.distribution.channels.get_adapter`), and persists everything through `store`.

Invariants kept here:
- AC-7: a campaign is created only from a recommendation found in a stored snapshot, and carries
  its non-empty `recommendation_id` and `gap_id`.
- AC-10: every publish attempt on every channel — published, failed, exported or blocked (gate,
  validation, missing admin token) — is appended to `campaign.events` and to the brand's audit log.
- Any edit goes through `gate.revalidate`, so changing approved content revokes the approval.

Imports of other app modules that tests fake (tracking store/board, brand registry) and of the
image/channel packages happen inside functions, so importing this module stays cheap and never
binds a faked module permanently (same reason as `interface/main.py::_board_store`).
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import random
import threading
import uuid
import zipfile
from collections.abc import Callable
from dataclasses import asdict, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.distribution import gate, kits, store
from app.distribution.copywriter import (
    BrandFacts,
    compose,
    draft_campaign,
    validate_variant,
)
from app.distribution.types import (
    CHANNEL_IDS,
    IMAGE_SIZES,
    Asset,
    AuditLogEntry,
    Campaign,
    ChannelId,
    DistributionEvent,
    ImageFormat,
    PublishResult,
    Variant,
)

log = logging.getLogger(__name__)

_LOCK = threading.RLock()  # serialises load-modify-save of campaign files within this process

ProgressFn = Callable[[str, int, int], None]


class CampaignNotFound(LookupError):
    pass


class RecommendationNotFound(LookupError):
    pass


class CampaignBusy(RuntimeError):
    """The campaign is still generating; edits/approval must wait."""


# --------------------------------------------------------------------------- seams (tests patch these)


def _generate_asset(**kwargs: Any) -> Asset:
    from app.distribution.imagegen import generate_asset

    return generate_asset(**kwargs)


def _make_qr_poster(**kwargs: Any) -> Asset:
    from app.distribution.imagegen import make_qr_poster

    return make_qr_poster(**kwargs)


def _get_adapter(channel: ChannelId, brand_key: str | None = None) -> Any:
    """The adapter with the brand's connected account (else the global .env credentials)."""
    from app.distribution.channels import get_adapter

    return get_adapter(channel, brand_key)


def channel_statuses(brand_key: str | None = None) -> list[Any]:
    from app.distribution.channels import channel_statuses as statuses

    return statuses(brand_key)


def _public_base_url() -> str | None:
    from app.config.settings import Settings

    url = Settings().public_base_url
    return url.rstrip("/") if url else None


# --------------------------------------------------------------------------- helpers


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _audit(brand_key: str, actor: str, audit_action: str, target: str, **context: Any) -> None:
    entry = AuditLogEntry(
        entry_id=_new_id("aud"),
        actor=actor,
        action=audit_action,
        target_ref=target,
        at=now_iso(),
        context={k: str(v) for k, v in context.items() if v is not None},
    )
    try:
        store.append_audit(brand_key, entry)
    except OSError:  # the audit log must never break the action it records
        log.exception("Could not append to the audit log for %s", brand_key)


def _load(brand_key: str, campaign_id: str) -> Campaign:
    campaign = store.get_campaign(brand_key, campaign_id)
    if campaign is None:
        raise CampaignNotFound(campaign_id)
    return campaign


def _brand(brand_key: str) -> Any:
    from app.brands import registry

    return registry.get_brand(brand_key)  # KeyError for an unknown brand


def suggestion_key(action: str, gap: dict[str, Any]) -> str:
    """The board's stable card key, `action|competitor_id` (competitor empty when none) — the
    same rule as the frontend's `suggestionKey` (components/dashboard/helpers.ts)."""
    comp = (gap.get("detail") or {}).get("competitor_id")
    return f"{action}|{comp if isinstance(comp, str) else ''}"


def find_recommendation(brand_key: str, recommendation_id: str) -> tuple[dict, dict, dict]:
    """(recommendation, gap, entities) from the newest snapshot that contains the recommendation.
    RecommendationNotFound if no stored snapshot has it."""
    from app.tracking import store as tracking_store

    for snap in reversed(tracking_store.load_snapshots(brand_key)):
        for rec in snap.get("recommendations") or []:
            if rec.get("recommendation_id") != recommendation_id:
                continue
            gap = next((g for g in snap.get("gaps") or [] if g.get("gap_id") == rec.get("gap_id")), None)
            return rec, gap or {"gap_id": rec.get("gap_id"), "gap_type": "", "detail": {}}, dict(snap.get("entities") or {})
    raise RecommendationNotFound(recommendation_id)


def _competitor_name(gap: dict[str, Any], entities: dict[str, str], cfg: Any) -> str | None:
    cid = (gap.get("detail") or {}).get("competitor_id")
    if not isinstance(cid, str) or not cid:
        return None
    if cid in entities:
        return entities[cid]
    aliases = getattr(cfg, "competitors", {}).get(cid)
    return aliases[0] if aliases else cid.replace("_", " ").title()


def _set_board_column(brand_key: str, key: str, column: str, *, keep_if: tuple[str, ...] = ()) -> None:
    """Move the recommendation's board card (forwards only: callers pass `keep_if` for the columns
    it must never leave). The load-modify-save runs under the board's lock, so it can't drop a
    concurrent move. Never breaks the campaign flow on a board error."""
    from app.tracking import board

    def move(cards: dict) -> dict | None:
        card = cards.get(key)
        current = card.get("column") if isinstance(card, dict) else None
        if current is not None and (current in keep_if or current == column):
            return None
        orders = [c.get("order") for c in cards.values() if isinstance(c, dict) and c.get("column") == column]
        order = 1 + max((o for o in orders if isinstance(o, int)), default=-1)
        cards[key] = {"column": column, "order": order, "updated_at": now_iso()}
        return cards

    try:
        board.update_board(brand_key, move)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        log.warning("Could not update the board card %s for %s", key, brand_key)


def _campaign_seed(campaign_id: str) -> int:
    return int(hashlib.sha256(campaign_id.encode()).hexdigest()[:8], 16) & 0x7FFFFFFF


def _assign_assets(variants: list[Variant], assets: list[Asset]) -> None:
    for v in variants:
        want = kits.CHANNEL_FORMAT.get(v.channel)
        match = next((a for a in assets if a.format == want), None) or (assets[0] if assets else None)
        v.asset_id = match.asset_id if match else None


def _mutate(brand_key: str, campaign_id: str, fn: Callable[[Campaign], Campaign], *, allow_generating: bool = False) -> Campaign:
    with _LOCK:
        campaign = _load(brand_key, campaign_id)
        if campaign.status == "generating" and not allow_generating:
            raise CampaignBusy("The campaign is still being generated — try again in a moment")
        updated = fn(campaign)
        store.save_campaign(updated)
        return updated


# --------------------------------------------------------------------------- create / generate


def create_campaign(
    brand_key: str,
    recommendation_id: str,
    *,
    jobs: Any | None = None,
    actor: str = "user",
) -> tuple[Campaign, dict[str, Any] | None]:
    """Create a campaign (status "generating") for a stored recommendation, then draft its copy and
    images — in a JobManager job (kind="campaign") when `jobs` is given, else synchronously.
    Raises KeyError (unknown brand), RecommendationNotFound, ValueError (AC-7: no gap_id)."""
    cfg = _brand(brand_key)
    rec, gap, entities = find_recommendation(brand_key, recommendation_id)
    gap_id = str(rec.get("gap_id") or "")
    if not gap_id:
        raise ValueError("This recommendation has no gap_id, so it cannot become a campaign (AC-7)")
    action = str(rec.get("action") or "")
    if action not in kits.KITS:
        raise ValueError(f"Action {action!r} is not in the closed action vocabulary")

    competitor = _competitor_name(gap, entities, cfg)
    context = {"rec": rec, "gap": gap, "competitor": competitor}
    holder: dict[str, str] = {}

    def task(on_progress: ProgressFn) -> dict[str, Any]:
        done = generate_content(brand_key, holder["campaign_id"], context=context, on_progress=on_progress)
        return {"message": f"Campaign ready ({done.drafted_by} copy, {len(done.assets)} images)"}

    # Check-and-create is one step under the lock, so two concurrent requests for the same
    # recommendation (a double click, two tabs, a client retry) get the same campaign instead of
    # two parallel drafts. The job is submitted and its id stored inside the same step, so a
    # second request always sees a job it can hand back.
    with _LOCK:
        existing = _in_flight(brand_key, recommendation_id, jobs)
        if existing is not None:
            return existing
        now = now_iso()
        campaign = Campaign(
            campaign_id=_new_id("cmp"),
            brand_key=brand_key,
            recommendation_id=recommendation_id,
            gap_id=gap_id,
            action=action,
            suggestion_key=suggestion_key(action, gap),
            status="generating",
            created_at=now,
            updated_at=now,
            headline=kits.KITS[action].label,
        )
        holder["campaign_id"] = campaign.campaign_id
        job = None
        if jobs is not None:
            store.save_campaign(campaign)  # before the job can start and load it
            try:
                job = jobs.submit_task(
                    brand_key, kind="campaign", fn=task, message="Queued: drafting campaign",
                    extra={"campaign_id": campaign.campaign_id},
                )
            except Exception:
                store.save_campaign(replace(campaign, status="failed"))  # never leave an orphan "generating"
                raise
            # The job can't finish meanwhile: its final save needs this lock.
            campaign.job_id = job["job_id"]
        store.save_campaign(campaign)
    _audit(brand_key, actor, "campaign.create", campaign.campaign_id, recommendation_id=recommendation_id, gap_id=gap_id, action=action)
    _set_board_column(brand_key, campaign.suggestion_key, "in_progress", keep_if=("done",))

    if jobs is None:
        task(lambda *_: None)
        return _load(brand_key, campaign.campaign_id), None
    return _load(brand_key, campaign.campaign_id), job


_LIVE_JOB_STATES = frozenset({"queued", "running"})
# Without a job manager (CLI / synchronous use) there's no job to ask, so a "generating" campaign
# older than this is taken to be left over from a crashed process rather than still drafting.
_SYNC_IN_FLIGHT_SECONDS = 600


def _in_flight(brand_key: str, recommendation_id: str, jobs: Any | None) -> tuple[Campaign, dict[str, Any] | None] | None:
    """A campaign for this recommendation that is still being drafted, with its live job — or
    None. A "generating" campaign whose job is gone or finished (or, without a job manager, that
    is too old) is stale and doesn't count. Must be called with `_LOCK` held."""
    for c in store.list_campaigns(brand_key):  # newest first
        if c.recommendation_id != recommendation_id or c.status != "generating":
            continue
        if jobs is None:
            try:
                age = (datetime.now(UTC) - datetime.fromisoformat(c.updated_at)).total_seconds()
            except (TypeError, ValueError):
                continue
            if age < _SYNC_IN_FLIGHT_SECONDS:
                return c, None
            continue
        job = jobs.get(c.job_id) if c.job_id else None
        if job is not None and job.get("status") in _LIVE_JOB_STATES:
            return c, job
    return None


def generate_content(
    brand_key: str,
    campaign_id: str,
    *,
    context: dict[str, Any],
    on_progress: ProgressFn | None = None,
) -> Campaign:
    """Draft copy + images for a "generating" campaign and mark it "ready". On an unexpected error
    the campaign is marked "failed" (with an audit entry) and the error re-raised for the job."""
    progress = on_progress or (lambda *_: None)
    campaign = _load(brand_key, campaign_id)
    try:
        cfg = _brand(brand_key)
        facts = BrandFacts.from_config(cfg)
        kit = kits.kit_for(campaign.action)
        total = 2 + len(kit.image_formats)
        progress("Writing the copy", 0, total)
        draft = draft_campaign(
            kit, facts, gap=context.get("gap") or {}, recommendation=context.get("rec") or {}, competitor=context.get("competitor")
        )
        assets: list[Asset] = []
        seed = _campaign_seed(campaign_id)
        for i, fmt in enumerate(kit.image_formats, start=1):
            progress(f"Generating image {i} of {len(kit.image_formats)} ({fmt})", i, total)
            try:
                assets.append(
                    _generate_asset(
                        campaign_id=campaign_id,
                        prompt=draft.image_prompt,
                        format=fmt,
                        overlay_text=draft.overlay_text,
                        brand_name=facts.name,
                        seed=seed,
                        style=None,
                    )
                )
            except Exception as exc:  # noqa: BLE001 - imagegen shouldn't raise; one bad image mustn't sink the campaign
                log.warning("Image generation failed for %s (%s): %s", campaign_id, fmt, type(exc).__name__)
        _assign_assets(draft.variants, assets)
        # Review-request kits: a printable QR poster for the counter, pointing at the share link.
        for d in draft.deliverables:
            if d.kind == "review_request" and d.extra.get("wa_link"):
                try:
                    poster = _make_qr_poster(
                        campaign_id=campaign_id, url=d.extra["wa_link"], brand_name=facts.name, headline=draft.headline
                    )
                    assets.append(poster)
                    d.extra["qr_asset_id"] = poster.asset_id
                    d.extra["qr_url"] = d.extra["wa_link"]
                except Exception as exc:  # noqa: BLE001 - optional extra
                    log.warning("QR poster failed for %s: %s", campaign_id, type(exc).__name__)
        progress("Saving", total - 1, total)

        def apply(c: Campaign) -> Campaign:
            return replace(
                c,
                headline=draft.headline,
                variants=draft.variants,
                assets=assets,
                deliverables=draft.deliverables,
                drafted_by=draft.drafted_by,
                status="ready",
                job_id=None,
                updated_at=now_iso(),
            )

        done = _mutate(brand_key, campaign_id, apply, allow_generating=True)
        _audit(
            brand_key, "system", "campaign.generate", campaign_id,
            drafted_by=draft.drafted_by, images=len(assets), notes="; ".join(draft.notes) or None,
        )
        progress("Campaign ready", total, total)
        return done
    except Exception as exc:
        try:
            _mutate(
                brand_key, campaign_id,
                lambda c: replace(c, status="failed", job_id=None, updated_at=now_iso()),
                allow_generating=True,
            )
        except (CampaignNotFound, OSError, ValueError):
            pass
        _audit(brand_key, "system", "campaign.generate_failed", campaign_id, error=f"{type(exc).__name__}: {exc}")
        raise


def recover_stale_generating() -> int:
    """At startup: no generation job survives a restart, so any campaign still "generating" is
    marked "ready" (if it has copy) or "failed". Returns how many were fixed."""
    fixed = 0
    for brand_key in store.all_brand_keys():
        try:
            campaigns = store.list_campaigns(brand_key)
        except (OSError, ValueError):
            continue
        for c in campaigns:
            if c.status != "generating":
                continue
            c.status = "ready" if c.variants else "failed"
            c.job_id = None
            c.updated_at = now_iso()
            store.save_campaign(c)
            _audit(brand_key, "system", "campaign.interrupted", c.campaign_id, status=c.status)
            fixed += 1
    return fixed


# --------------------------------------------------------------------------- read


def list_campaigns(brand_key: str) -> list[Campaign]:
    return store.list_campaigns(brand_key)


def get_campaign(brand_key: str, campaign_id: str) -> Campaign:
    return _load(brand_key, campaign_id)


# --------------------------------------------------------------------------- edit


_VARIANT_FIELDS = ("text", "hashtags", "link", "enabled", "asset_id", "alt_text")


def edit_variant(brand_key: str, campaign_id: str, channel: str, patch: dict[str, Any], *, actor: str = "user") -> Campaign:
    """Apply a partial edit to one channel's variant. Unknown asset → ValueError. If the campaign
    was approved and the content changed, the approval is revoked (gate.revalidate)."""
    patch = {k: v for k, v in patch.items() if k in _VARIANT_FIELDS}
    facts_holder: dict[str, BrandFacts] = {}
    try:
        facts_holder["f"] = BrandFacts.from_config(_brand(brand_key))
    except KeyError:
        facts_holder["f"] = BrandFacts(name="", category="")

    def apply(c: Campaign) -> Campaign:
        idx = next((i for i, v in enumerate(c.variants) if v.channel == channel), None)
        if idx is None:
            raise LookupError(f"This campaign has no {channel} version")
        if "asset_id" in patch and patch["asset_id"] is not None and not any(a.asset_id == patch["asset_id"] for a in c.assets):
            raise ValueError(f"Unknown asset {patch['asset_id']!r}")
        variant = replace(c.variants[idx], **patch)
        if "hashtags" in patch:
            variant.hashtags = [t if t.startswith("#") else f"#{t}" for t in (t.strip() for t in patch["hashtags"] or []) if t.strip("#")]
        validate_variant(variant, facts_holder["f"], fix=False)
        variants = list(c.variants)
        variants[idx] = variant
        was_approved = c.approved_at is not None
        updated = gate.revalidate(replace(c, variants=variants, updated_at=now_iso()), now=now_iso())
        if was_approved and updated.approved_at is None:
            _audit(brand_key, actor, "campaign.approval_revoked", c.campaign_id, channel=channel)
        return updated

    updated = _mutate(brand_key, campaign_id, apply)
    _audit(brand_key, actor, "campaign.edit", f"{campaign_id}:{channel}", fields=",".join(sorted(patch)))
    return updated


def edit_deliverable(brand_key: str, campaign_id: str, index: int, patch: dict[str, Any], *, actor: str = "user") -> Campaign:
    """Edit a deliverable's title/body. Deliverables are exported, never auto-posted, so this does
    not revoke approval."""
    patch = {k: v for k, v in patch.items() if k in ("title", "body") and isinstance(v, str)}

    def apply(c: Campaign) -> Campaign:
        if not 0 <= index < len(c.deliverables):
            raise LookupError(f"No deliverable #{index}")
        deliverables = list(c.deliverables)
        deliverables[index] = replace(deliverables[index], **patch)
        return replace(c, deliverables=deliverables, updated_at=now_iso())

    updated = _mutate(brand_key, campaign_id, apply)
    _audit(brand_key, actor, "campaign.edit_deliverable", f"{campaign_id}:{index}", fields=",".join(sorted(patch)))
    return updated


def regenerate_image(
    brand_key: str,
    campaign_id: str,
    *,
    format: ImageFormat,
    prompt: str | None = None,
    style: str | None = None,
    seed: int | None = None,
    actor: str = "user",
) -> Campaign:
    """Generate a new image in `format` (synchronously) and point the channels that use that
    format at it. Old images are kept (the UI can switch back via PATCH asset_id). Swapping a
    variant's image changes its content hash, so an approved campaign needs re-approval."""
    if format not in IMAGE_SIZES:
        raise ValueError(f"Unknown image format {format!r}")
    campaign = _load(brand_key, campaign_id)
    if campaign.status == "generating":
        raise CampaignBusy("The campaign is still being generated — try again in a moment")
    cfg = _brand(brand_key)
    facts = BrandFacts.from_config(cfg)
    previous = next((a for a in reversed(campaign.assets) if a.format == format), None) or (
        campaign.assets[-1] if campaign.assets else None
    )
    base_prompt = (prompt or "").strip() or (previous.prompt if previous else "") or kits.image_prompt(
        kits.kit_for(campaign.action), category=facts.category, cities=facts.cities, audiences=facts.audiences
    )
    overlay = previous.overlay_text if previous and previous.overlay_text else campaign.headline[:48]
    asset = _generate_asset(
        campaign_id=campaign_id,
        prompt=base_prompt,
        format=format,
        overlay_text=overlay,
        brand_name=facts.name,
        seed=seed if seed is not None else random.randint(0, 2**31 - 1),
        style=style,
    )

    def apply(c: Campaign) -> Campaign:
        fmt_of = {a.asset_id: a.format for a in c.assets}
        variants = [
            replace(v, asset_id=asset.asset_id)
            if (v.asset_id and fmt_of.get(v.asset_id) == format) or (v.asset_id is None and kits.CHANNEL_FORMAT.get(v.channel) == format)
            else v
            for v in c.variants
        ]
        updated = replace(c, assets=[*c.assets, asset], variants=variants, updated_at=now_iso())
        return gate.revalidate(updated, now=now_iso())

    updated = _mutate(brand_key, campaign_id, apply)
    _audit(brand_key, actor, "campaign.regenerate_image", campaign_id, format=format, asset_id=asset.asset_id, provider=asset.provider)
    return updated


# --------------------------------------------------------------------------- approve / publish


def approve(brand_key: str, campaign_id: str, *, actor: str = "admin") -> Campaign:
    """Approve the campaign exactly as it stands (gate.approve). GateError if not approvable."""
    updated = _mutate(brand_key, campaign_id, lambda c: gate.approve(c, now=now_iso()))
    enabled = [v.channel for v in updated.variants if v.enabled]
    _audit(brand_key, actor, "campaign.approve", campaign_id, channels=",".join(enabled))
    return updated


def _event(
    campaign: Campaign,
    channel: ChannelId,
    outcome: str,
    *,
    variant: Variant | None,
    result: PublishResult | None = None,
    error: str | None = None,
    note: str | None = None,
) -> DistributionEvent:
    return DistributionEvent(
        event_id=_new_id("evt"),
        campaign_id=campaign.campaign_id,
        recommendation_id=campaign.recommendation_id,
        channel=channel,
        outcome=outcome,  # type: ignore[arg-type]
        at=now_iso(),
        external_url=result.external_url if result else None,
        external_id=result.external_id if result else None,
        error=error if error is not None else (result.error if result else None),
        content_hash=gate.content_hash(variant) if variant else None,
        note=note,
    )


def _asset_file(asset: Asset) -> Path | None:
    root = store.media_root().resolve()
    path = (root / asset.path).resolve()
    return path if path.is_relative_to(root) and path.is_file() else None


_JPEG_CHANNELS = frozenset({"instagram"})

# Channels that post through an account (mirrors channels.base.ACCOUNT_CHANNELS; kept here so this
# module doesn't import the channel package at import time).
_ACCOUNT_CHANNELS = frozenset({"facebook_page", "instagram", "x", "linkedin", "google_business"})

WHATSAPP_NOTE = (
    "WhatsApp has no posting API: this is a wa.me share link with the message filled in. Nothing was sent — "
    "open the link, pick a chat, group or your Channel, and press send (the status image is in the export pack)."
)
EXPORT_NOTE = "Nothing was sent anywhere: download the export pack for the images and copy."


def _not_connected_note(label: str) -> str:
    return (
        f"Not posted: this brand has no {label} account connected (and the server has no fallback credentials). "
        "The copy and image are in the export pack — or connect the account in Details → Connected accounts and publish again."
    )


def _jpeg_copy(png: Path) -> Path:
    """A JPEG sibling of a generated PNG (created once), served at the same URL with .jpg."""
    jpg = png.with_suffix(".jpg")
    if png.suffix.lower() in (".jpg", ".jpeg"):
        return png
    if not jpg.exists() or jpg.stat().st_mtime < png.stat().st_mtime:
        from PIL import Image

        with Image.open(png) as im:
            im.convert("RGB").save(jpg, "JPEG", quality=92)
    return jpg


def _scrub(text: str | None, adapter: Any) -> str | None:
    from app.distribution.channels.base import scrub

    return scrub(text, getattr(adapter, "creds", None))


class _Plan:
    """What publishing one channel would do, decided without contacting any platform."""

    def __init__(self, action: str, *, variant: Variant | None, reason: str | None = None, note: str | None = None,
                 adapter: Any = None, image_path: Path | None = None, image_url: str | None = None) -> None:
        self.action = action  # "publish" | "export" | "blocked"
        self.variant = variant
        self.reason = reason
        self.note = note
        self.adapter = adapter
        self.image_path = image_path
        self.image_url = image_url


def _plan(campaign: Campaign, channel: ChannelId, base_url: str | None, *, convert_images: bool = True) -> _Plan:
    """Gate → adapter status → validation → image. Raises only on adapter bugs (callers catch)."""
    variant = next((v for v in campaign.variants if v.channel == channel), None)
    ok, reason = gate.can_publish(campaign, channel)
    if not ok:
        return _Plan("blocked", variant=variant, reason=reason)
    assert variant is not None
    adapter = _get_adapter(channel, campaign.brand_key)
    status = adapter.status()
    mode = status.mode
    if mode == "disabled":
        return _Plan("blocked", variant=variant, reason=f"The {channel} channel is disabled on this server", adapter=adapter)
    asset = next((a for a in campaign.assets if a.asset_id == variant.asset_id), None)
    image_path = _asset_file(asset) if asset else None
    rel_path = asset.path if asset else None
    if image_path is not None and asset is not None and channel in _JPEG_CHANNELS:
        if convert_images:
            image_path = _jpeg_copy(image_path)  # Meta requires JPEG for Instagram feed posts
        rel_path = str(Path(asset.path).with_suffix(".jpg"))
    image_url = f"{base_url}/media/{rel_path}" if rel_path and base_url else None
    if channel == "whatsapp":
        return _Plan("export", variant=variant, note=WHATSAPP_NOTE, adapter=adapter, image_path=image_path, image_url=image_url)
    if channel in gate.EXPORT_CHANNELS:
        return _Plan("export", variant=variant, note=EXPORT_NOTE, adapter=adapter, image_path=image_path, image_url=image_url)
    if mode != "connected":
        if channel in _ACCOUNT_CHANNELS and getattr(adapter, "has_credentials", lambda: False)():
            # Something is set up but can't be used (expired, missing PUBLIC_BASE_URL, incomplete
            # account…): refuse with the reason rather than quietly "exporting".
            detail = status.detail or "the account can't be used right now"
            return _Plan("blocked", variant=variant, reason=f"Not posted — {detail}", adapter=adapter)
        return _Plan("export", variant=variant, note=_not_connected_note(getattr(adapter, "label", channel)), adapter=adapter,
                     image_path=image_path, image_url=image_url)
    issues = adapter.validate(variant)
    if issues:
        return _Plan("blocked", variant=variant, reason="Fix before publishing: " + " ".join(issues), adapter=adapter)
    return _Plan("publish", variant=variant, adapter=adapter, image_path=image_path, image_url=image_url)


def _attempt(campaign: Campaign, channel: ChannelId, base_url: str | None) -> DistributionEvent:
    """One channel: gate → adapter status/validate → publish. Never raises; never leaks a secret."""
    variant = next((v for v in campaign.variants if v.channel == channel), None)
    adapter: Any = None
    try:
        plan = _plan(campaign, channel, base_url)
        adapter = plan.adapter
        if plan.action == "blocked":
            return _event(campaign, channel, "blocked", variant=plan.variant, error=plan.reason)
        assert plan.variant is not None
        result = adapter.publish(campaign=campaign, variant=plan.variant, image_path=plan.image_path, image_url=plan.image_url)
    except Exception as exc:  # noqa: BLE001 - an adapter bug must still produce a logged, failed attempt
        log.warning("Publishing %s/%s raised %s", campaign.campaign_id, channel, type(exc).__name__)
        return _event(campaign, channel, "failed", variant=variant, error=_scrub(f"{type(exc).__name__}: {exc}", adapter))
    if not result.ok:
        return _event(campaign, channel, "failed", variant=plan.variant, result=result,
                      error=_scrub(result.error or "Publishing failed", adapter))
    if plan.action == "export":
        return _event(campaign, channel, "exported", variant=plan.variant, result=result, note=plan.note)
    if not result.external_url and not result.external_id:
        # A "connected" adapter that returned nothing to show for it didn't really post.
        return _event(campaign, channel, "failed", variant=plan.variant, result=result,
                      error="The platform accepted the request but returned no post id — check the account before retrying.")
    return _event(campaign, channel, "published", variant=plan.variant, result=result)


def preflight(brand_key: str, campaign_id: str, channels: list[ChannelId]) -> list[dict[str, Any]]:
    """Dry run of `publish`: for each channel, what would happen (publish / export / blocked) and
    why, the image URL a platform would fetch — without contacting any platform, logging an event
    or changing the campaign."""
    campaign = _load(brand_key, campaign_id)
    base_url = _public_base_url()
    out: list[dict[str, Any]] = []
    for ch in [c for c in dict.fromkeys(channels) if c in CHANNEL_IDS]:
        adapter: Any = None
        try:
            plan = _plan(campaign, ch, base_url, convert_images=False)
            adapter = plan.adapter
            detail = plan.reason or plan.note or ""
            if plan.action == "publish":
                st = adapter.status()
                detail = f"Would post now as {st.detail}" if st.detail else "Would post now"
            out.append({"channel": ch, "action": plan.action, "detail": detail, "image_url": plan.image_url,
                        "has_image": plan.image_path is not None})
        except Exception as exc:  # noqa: BLE001
            out.append({"channel": ch, "action": "blocked", "detail": _scrub(f"{type(exc).__name__}: {exc}", adapter) or "",
                        "image_url": None, "has_image": False})
    return out


def _status_after(campaign: Campaign) -> str:
    """Status from the attempts that actually reached a platform since the current approval: only
    "published" / "failed" outcomes count ("blocked" sent nothing and "exported" posts nothing, so
    both are excluded — they are still logged, AC-10). All such channels published → "published";
    some → "partially_published"; none → "failed". A channel that failed and was later published
    counts as published. No such attempts → status unchanged."""
    since = campaign.approved_at or ""
    publishing = [
        e for e in campaign.events
        if e.channel not in gate.EXPORT_CHANNELS and e.outcome in ("published", "failed") and e.at >= since
    ]
    if not publishing:
        return campaign.status
    published = {e.channel for e in publishing if e.outcome == "published"}
    last_by_channel: dict[str, str] = {}
    for e in publishing:
        last_by_channel[e.channel] = e.outcome
    pending = {ch for ch, outcome in last_by_channel.items() if outcome != "published" and ch not in published}
    if published and not pending:
        return "published"
    if published:
        return "partially_published"
    return "failed"


def _append_events(brand_key: str, campaign_id: str, events: list[DistributionEvent], *, actor: str) -> Campaign:
    def apply(c: Campaign) -> Campaign:
        updated = replace(c, events=[*c.events, *events], updated_at=now_iso())
        if any(e.outcome in ("published", "failed") for e in events):
            updated.status = _status_after(updated) if updated.approved_at else updated.status  # type: ignore[assignment]
        return updated

    updated = _mutate(brand_key, campaign_id, apply)
    for e in events:
        _audit(
            brand_key, actor, "campaign.publish", f"{campaign_id}:{e.channel}",
            event_id=e.event_id, outcome=e.outcome, external_url=e.external_url, error=e.error,
        )
    if any(e.outcome == "published" for e in events):
        _set_board_column(brand_key, updated.suggestion_key, "done")
    return updated


def publish(
    brand_key: str,
    campaign_id: str,
    channels: list[ChannelId],
    *,
    actor: str = "admin",
    public_base_url: str | None | bool = True,
    refused: dict[str, str] | None = None,
) -> Campaign:
    """Attempt every requested channel; each attempt (incl. gate-blocked ones) becomes a
    DistributionEvent + audit entry. Channels in `refused` (channel → reason, e.g. no admin token)
    are logged as "blocked" without being attempted. Adapters run outside the file lock."""
    campaign = _load(brand_key, campaign_id)
    base_url = _public_base_url() if public_base_url is True else (public_base_url or None)
    requested = [ch for ch in dict.fromkeys(channels) if ch in CHANNEL_IDS]
    refused = refused or {}
    events = [
        _event(campaign, ch, "blocked", variant=next((v for v in campaign.variants if v.channel == ch), None), error=refused[ch])
        if ch in refused
        else _attempt(campaign, ch, base_url)
        for ch in requested
    ]
    return _append_events(brand_key, campaign_id, events, actor=actor)


def record_blocked(brand_key: str, campaign_id: str, channels: list[ChannelId], reason: str, *, actor: str) -> Campaign:
    """Log refused attempts (e.g. no admin token for a real channel) — AC-10 logs blocked ones too."""
    campaign = _load(brand_key, campaign_id)
    events = [
        _event(campaign, ch, "blocked", variant=next((v for v in campaign.variants if v.channel == ch), None), error=reason)
        for ch in dict.fromkeys(channels)
    ]
    return _append_events(brand_key, campaign_id, events, actor=actor)


# --------------------------------------------------------------------------- delete / export


def delete_campaign(brand_key: str, campaign_id: str, *, actor: str = "admin") -> bool:
    with _LOCK:
        existed = store.delete_campaign(brand_key, campaign_id)
    if existed:
        _audit(brand_key, actor, "campaign.delete", campaign_id)
    return existed


def _slug(text: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in text.lower()).strip("-")[:40] or "item"


def export_zip(brand_key: str, campaign_id: str) -> bytes:
    """The export pack: images, per-channel copy (.txt), deliverables (.md, + JSON-LD), events and
    a README. Available in any status — it never sends anything anywhere (PRD §15.7 fallback)."""
    c = _load(brand_key, campaign_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        asset_names: dict[str, str] = {}
        for a in c.assets:
            path = _asset_file(a)
            if path is None:
                continue
            name = f"images/{a.format}-{a.asset_id}{path.suffix or '.png'}"
            zf.write(path, name)
            asset_names[a.asset_id] = name
        for v in c.variants:
            lines = [compose(v), ""]
            if v.alt_text:
                lines.append(f"Alt text: {v.alt_text}")
            if v.asset_id:
                lines.append(f"Image: {asset_names.get(v.asset_id, v.asset_id)}")
            lines.append(f"Enabled: {'yes' if v.enabled else 'no'}")
            if v.issues:
                lines += ["", "Check before posting:", *[f"- {i}" for i in v.issues]]
            zf.writestr(f"copy/{v.channel}.txt", "\n".join(lines).strip() + "\n")
        for i, d in enumerate(c.deliverables, start=1):
            base = f"deliverables/{i:02d}-{d.kind}-{_slug(d.title)}"
            zf.writestr(f"{base}.md", d.body.strip() + "\n")
            if d.extra.get("jsonld"):
                zf.writestr(f"{base}.jsonld.json", d.extra["jsonld"])
        zf.writestr("events.json", json.dumps([asdict(e) for e in c.events], indent=2, ensure_ascii=False))
        readme = [
            f"# Campaign pack: {c.headline}",
            "",
            f"- Brand: {c.brand_key}",
            f"- Action: {kits.kit_for(c.action).label if c.action in kits.KITS else c.action}",
            f"- Recommendation: {c.recommendation_id} (gap {c.gap_id})",
            f"- Status: {c.status}" + (f", approved {c.approved_at}" if c.approved_at else " (not approved)"),
            f"- Copy drafted by: {c.drafted_by or 'n/a'}",
            f"- Exported: {now_iso()}",
            "",
            (
                "Nothing in this pack has been posted anywhere by exporting it. `copy/` holds the text for each "
                "channel (hashtags and link included), `images/` the generated images, `deliverables/` the long-form "
                "pieces (articles, FAQ + JSON-LD, profile copy, scripts, listings, emails), and `events.json` the "
                "publish log so far."
            ),
            "",
            "Content hashes (what approval covers):",
            *[
                f"- {v.channel}: {gate.content_hash(v)}"
                + (" (approved)" if v.approved_hash and v.approved_hash == gate.content_hash(v) else "")
                for v in c.variants
            ],
        ]
        zf.writestr("README.md", "\n".join(readme) + "\n")
    return buf.getvalue()


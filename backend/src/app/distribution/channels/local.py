"""Channels that never call a platform API: WhatsApp (share link), Export pack, Sandbox."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from app.distribution.channels.base import compose_text, length_issues
from app.distribution.types import TEXT_LIMITS, Campaign, ChannelId, ChannelStatus, PublishResult, Variant


class _LocalAdapter:
    channel: ChannelId
    label: str

    def __init__(self, settings: Any = None, *, client: httpx.Client | None = None, **_: Any) -> None:
        self.settings = settings

    def validate(self, variant: Variant) -> list[str]:
        return length_issues(self.label, compose_text(variant), TEXT_LIMITS[self.channel])


class WhatsAppAdapter(_LocalAdapter):
    """WhatsApp Channels has no posting API, and the Business Cloud API only messages opted-in
    contacts with pre-approved templates. So: a wa.me link that opens WhatsApp with the message
    filled in (the user picks a chat, group or their Channel) plus the status-size image in the
    export pack."""

    channel = "whatsapp"
    label = "WhatsApp"

    def status(self) -> ChannelStatus:
        return ChannelStatus(
            self.channel,
            self.label,
            "export_only",
            detail="No posting API for WhatsApp Channels — opens a wa.me share link with the message; the 1080×1920 status image is in the export pack.",
        )

    def publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None = None, image_url: str | None = None
    ) -> PublishResult:
        issues = self.validate(variant)
        if issues:
            return PublishResult(ok=False, error=" ".join(issues))
        return PublishResult(ok=True, external_url="https://wa.me/?text=" + quote(compose_text(variant), safe=""))


class ExportAdapter(_LocalAdapter):
    """The export pack (zip of images + copy) is built by the service; this adapter only says yes."""

    channel = "export"
    label = "Export pack"

    def status(self) -> ChannelStatus:
        return ChannelStatus(
            self.channel, self.label, "connected", detail="Download a zip with the images and copy for any platform."
        )

    def publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None = None, image_url: str | None = None
    ) -> PublishResult:
        return PublishResult(ok=True)


class SandboxAdapter(_LocalAdapter):
    """Simulated publishing for demos and tests — validates, then pretends. Nothing leaves the machine."""

    channel = "sandbox"
    label = "Sandbox (simulated — nothing is posted)"

    def status(self) -> ChannelStatus:
        return ChannelStatus(
            self.channel, self.label, "connected", detail="Simulated channel for demos: validates and logs, posts nothing."
        )

    def publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None = None, image_url: str | None = None
    ) -> PublishResult:
        issues = self.validate(variant)
        if issues:
            return PublishResult(ok=False, error=" ".join(issues))
        return PublishResult(
            ok=True,
            external_url=f"sandbox://{variant.channel}/{campaign.campaign_id}",
            external_id=f"sandbox-{variant.channel}-{campaign.campaign_id}",
        )

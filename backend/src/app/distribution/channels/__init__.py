"""Channel adapters for Campaign Studio (PRD §11.5 / AC-10).

Public API:
    get_adapter(channel) -> ChannelAdapter
    channel_statuses() -> list[ChannelStatus]   # all channels, in CHANNEL_IDS order

Settings are read fresh on each call (like collection/registry.py) so env changes apply without
a restart; tests pass `settings=` (any object with the right attributes) and `client=` (an
httpx.Client on a MockTransport). Setup of real credentials: docs/CHANNEL_SETUP.md.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config.settings import Settings
from app.distribution.channels.base import ChannelAdapter, ChannelError, compose_text, x_weighted_length
from app.distribution.channels.google_business import GoogleBusinessAdapter
from app.distribution.channels.local import ExportAdapter, SandboxAdapter, WhatsAppAdapter
from app.distribution.channels.meta import FacebookPageAdapter, InstagramAdapter
from app.distribution.channels.x import XAdapter
from app.distribution.types import CHANNEL_IDS, ChannelId, ChannelStatus

ADAPTERS: dict[ChannelId, type[Any]] = {
    "facebook_page": FacebookPageAdapter,
    "instagram": InstagramAdapter,
    "x": XAdapter,
    "google_business": GoogleBusinessAdapter,
    "whatsapp": WhatsAppAdapter,
    "export": ExportAdapter,
    "sandbox": SandboxAdapter,
}


def get_adapter(
    channel: ChannelId, *, settings: Any = None, client: httpx.Client | None = None, **options: Any
) -> ChannelAdapter:
    try:
        cls = ADAPTERS[channel]
    except KeyError:
        raise ValueError(f"unknown channel {channel!r}; expected one of {', '.join(CHANNEL_IDS)}") from None
    return cls(settings if settings is not None else Settings(), client=client, **options)


def channel_statuses(*, settings: Any = None) -> list[ChannelStatus]:
    s = settings if settings is not None else Settings()
    return [get_adapter(c, settings=s).status() for c in CHANNEL_IDS]


__all__ = [
    "ADAPTERS",
    "ChannelAdapter",
    "ChannelError",
    "channel_statuses",
    "compose_text",
    "get_adapter",
    "x_weighted_length",
]

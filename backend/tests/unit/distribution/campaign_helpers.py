"""Shared fakes for the Campaign Studio tests (service + API): a stored snapshot with
recommendations, a fake image generator and fake channel adapters. No network, no LLM."""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app import paths
from app.distribution.types import Asset, ChannelStatus, PublishResult

BRAND = "gajanan_vada_pav"  # a built-in pilot brand: its profile exists without any setup


def tiny_png() -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"\x00\xff\x00\x00"  # one red pixel
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


SNAPSHOT = {
    "brand_key": BRAND,
    "brand": "Gajanan Vada Pav",
    "run_id": "run-1",
    "status": "completed",
    "entities": {"self": "Gajanan Vada Pav", "ashok_vada_pav": "Ashok Vada Pav"},
    "gaps": [
        {
            "gap_id": "gap-comp",
            "gap_type": "competitive",
            "evidence_refs": ["o1"],
            "detail": {"competitor_id": "ashok_vada_pav", "beat_rate": 0.8},
            "is_inferred": False,
        },
        {
            "gap_id": "gap-local",
            "gap_type": "presence",
            "evidence_refs": ["o2"],
            "detail": {"scope": "intent", "intent_type": "local_contextual"},
            "is_inferred": False,
        },
    ],
    "recommendations": [
        {"recommendation_id": "rec-comp", "gap_id": "gap-comp", "action": "comparison_page", "action_class": "content",
         "reasoning": "Ashok Vada Pav is ranked ahead."},
        {"recommendation_id": "rec-dir", "gap_id": "gap-local", "action": "submit_to_directory",
         "action_class": "distribution", "reasoning": "Not listed."},
        {"recommendation_id": "rec-review", "gap_id": "gap-local", "action": "seek_review_coverage",
         "action_class": "distribution", "reasoning": "Few reviews."},
        {"recommendation_id": "rec-nogap", "gap_id": "", "action": "faq_page", "action_class": "content"},
    ],
    "raw_observations": [],
}


def store_snapshot(record: dict | None = None) -> None:
    from app.tracking import store as tracking_store

    tracking_store.append_snapshot(dict(record or SNAPSHOT))


class FakeImagegen:
    """Stands in for app.distribution.imagegen.generate_asset / make_qr_poster."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.n = 0

    def _write(self, campaign_id: str, fmt: str, provider: str, kw: dict[str, Any]) -> Asset:
        self.n += 1
        asset_id = f"a{self.n:03d}"
        folder = paths.DATA_DIR / "media" / campaign_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{asset_id}.png").write_bytes(tiny_png())
        return Asset(asset_id=asset_id, format=fmt, path=f"{campaign_id}/{asset_id}.png", provider=provider,
                     prompt=kw.get("prompt", ""), seed=kw.get("seed"), overlay_text=kw.get("overlay_text"))

    def generate_asset(self, **kw: Any) -> Asset:
        self.calls.append(kw)
        return self._write(kw["campaign_id"], kw["format"], "template", kw)

    def make_qr_poster(self, **kw: Any) -> Asset:
        self.calls.append({"qr": True, **kw})
        return self._write(kw["campaign_id"], "story", "qr", {})


@dataclass
class FakeAdapter:
    channel: str
    mode: str = "connected"
    ok: bool = True
    issues: list[str] = field(default_factory=list)
    calls: list[dict[str, Any]] = field(default_factory=list)

    def status(self) -> ChannelStatus:
        return ChannelStatus(channel=self.channel, label=self.channel, mode=self.mode)  # type: ignore[arg-type]

    def validate(self, variant: Any) -> list[str]:
        return list(self.issues)

    def publish(self, *, campaign: Any, variant: Any, image_path: Path | None = None, image_url: str | None = None) -> PublishResult:
        self.calls.append({"variant": variant, "image_path": image_path, "image_url": image_url})
        if not self.ok:
            return PublishResult(ok=False, error=f"{self.channel} said no")
        if self.mode != "connected":
            return PublishResult(ok=True, external_url="https://wa.me/?text=x" if self.channel == "whatsapp" else None)
        return PublishResult(ok=True, external_url=f"https://example.test/{self.channel}/1", external_id="1")


def install_fakes(monkeypatch, *, adapters: dict[str, FakeAdapter] | None = None) -> tuple[FakeImagegen, dict[str, FakeAdapter]]:
    from app.distribution import service

    monkeypatch.setenv("COPY_PROVIDER", "template")
    monkeypatch.setenv("PUBLIC_BASE_URL", "")
    gen = FakeImagegen()
    monkeypatch.setattr(service, "_generate_asset", gen.generate_asset)
    monkeypatch.setattr(service, "_make_qr_poster", gen.make_qr_poster)
    table = {
        "facebook_page": FakeAdapter("facebook_page"),
        "instagram": FakeAdapter("instagram"),
        "x": FakeAdapter("x"),
        "google_business": FakeAdapter("google_business", mode="export_only"),
        "whatsapp": FakeAdapter("whatsapp", mode="export_only"),
        "export": FakeAdapter("export", mode="export_only"),
        "sandbox": FakeAdapter("sandbox"),
    }
    table.update(adapters or {})
    monkeypatch.setattr(service, "_get_adapter", lambda ch: table[ch])
    monkeypatch.setattr(
        service, "channel_statuses", lambda: [a.status() for a in table.values()]
    )
    return gen, table

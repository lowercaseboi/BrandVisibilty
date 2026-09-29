"""File-backed campaign store (PRD §11.5) — an MVP stand-in for the Campaign / Asset / Variant /
DistributionEvent / AuditLogEntry tables (DESIGN ER model).

Layout under `DATA_DIR`:

    campaigns/<brand_key>/<campaign_id>.json   one campaign (variants, assets, deliverables, events)
    media/<campaign_id>/*.png                  its generated images (written by app.distribution.imagegen)
    audit/<brand_key>.jsonl                    append-only audit log, one AuditLogEntry per line

Pure I/O, same conventions as `tracking/store.py`: atomic writes (tempfile + `os.replace`),
`paths.DATA_DIR` read at call time so tests can redirect it, and path components validated so a
crafted id can never escape the data directory.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from dataclasses import asdict, fields
from pathlib import Path
from typing import Any

from app import paths
from app.distribution.types import (
    Asset,
    AuditLogEntry,
    Campaign,
    Deliverable,
    DistributionEvent,
    Variant,
)

_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


def safe_id(value: str, what: str = "id") -> str:
    """Raise ValueError unless `value` is a plain file-name-safe id (no dots, slashes, spaces)."""
    if not isinstance(value, str) or not _SAFE_ID.match(value):
        raise ValueError(f"Invalid {what} {value!r}")
    return value


def _safe_brand(brand_key: str) -> str:
    # Brand keys come from slugify() (a-z0-9_ or "u<hash>"), same rule as tracking/store.
    if not brand_key or "/" in brand_key or "\\" in brand_key or brand_key.startswith("."):
        raise ValueError(f"Invalid brand_key {brand_key!r}")
    return brand_key


def campaigns_dir(brand_key: str) -> Path:
    return paths.DATA_DIR / "campaigns" / _safe_brand(brand_key)


def campaign_path(brand_key: str, campaign_id: str) -> Path:
    return campaigns_dir(brand_key) / f"{safe_id(campaign_id, 'campaign_id')}.json"


def media_root() -> Path:
    return paths.DATA_DIR / "media"


def media_dir(campaign_id: str) -> Path:
    return media_root() / safe_id(campaign_id, "campaign_id")


def audit_path(brand_key: str) -> Path:
    return paths.DATA_DIR / "audit" / f"{_safe_brand(brand_key)}.jsonl"


# --------------------------------------------------------------------------- (de)serialisation


def _pick(cls: type, data: dict[str, Any]) -> dict[str, Any]:
    """Only the dataclass's own fields — unknown keys (from a newer/older version) are ignored."""
    names = {f.name for f in fields(cls)}
    return {k: v for k, v in data.items() if k in names}


def campaign_to_dict(campaign: Campaign) -> dict[str, Any]:
    return asdict(campaign)


def campaign_from_dict(data: dict[str, Any]) -> Campaign:
    base = _pick(Campaign, data)
    base["variants"] = [Variant(**_pick(Variant, v)) for v in data.get("variants") or []]
    base["assets"] = [Asset(**_pick(Asset, a)) for a in data.get("assets") or []]
    base["deliverables"] = [Deliverable(**_pick(Deliverable, d)) for d in data.get("deliverables") or []]
    base["events"] = [DistributionEvent(**_pick(DistributionEvent, e)) for e in data.get("events") or []]
    return Campaign(**base)


def _write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


# --------------------------------------------------------------------------- campaigns


def save_campaign(campaign: Campaign) -> Campaign:
    path = campaign_path(campaign.brand_key, campaign.campaign_id)
    _write_atomic(path, json.dumps(campaign_to_dict(campaign), indent=2, ensure_ascii=False))
    return campaign


def get_campaign(brand_key: str, campaign_id: str) -> Campaign | None:
    """The stored campaign, or None if it doesn't exist (or its id is malformed / file corrupt)."""
    try:
        path = campaign_path(brand_key, campaign_id)
    except ValueError:
        return None
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return campaign_from_dict(data) if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def list_campaigns(brand_key: str) -> list[Campaign]:
    """All of a brand's campaigns, newest first."""
    directory = campaigns_dir(brand_key)
    if not directory.is_dir():
        return []
    out = [c for p in directory.glob("*.json") if (c := get_campaign(brand_key, p.stem)) is not None]
    out.sort(key=lambda c: (c.created_at, c.campaign_id), reverse=True)
    return out


def all_brand_keys() -> list[str]:
    root = paths.DATA_DIR / "campaigns"
    if not root.is_dir():
        return []
    return sorted(p.name for p in root.iterdir() if p.is_dir())


def delete_campaign(brand_key: str, campaign_id: str) -> bool:
    """Remove a campaign and its media. True if the campaign existed. Idempotent."""
    try:
        path = campaign_path(brand_key, campaign_id)
    except ValueError:
        return False
    existed = path.exists()
    path.unlink(missing_ok=True)
    shutil.rmtree(media_dir(campaign_id), ignore_errors=True)
    return existed


def delete_brand_campaigns(brand_key: str) -> None:
    """Remove every campaign of a brand, their media folders and the brand's audit log (called by
    `tracking.store.delete_brand_data` when a brand is deleted). Idempotent."""
    directory = campaigns_dir(brand_key)
    if directory.is_dir():
        for path in directory.glob("*.json"):
            try:
                shutil.rmtree(media_dir(path.stem), ignore_errors=True)
            except ValueError:
                pass
        shutil.rmtree(directory, ignore_errors=True)
    audit_path(brand_key).unlink(missing_ok=True)


# --------------------------------------------------------------------------- audit log


def append_audit(brand_key: str, entry: AuditLogEntry) -> None:
    """Append one entry (never rewritten — the log is append-only)."""
    path = audit_path(brand_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(entry), ensure_ascii=False) + "\n")


def load_audit(brand_key: str) -> list[AuditLogEntry]:
    path = audit_path(brand_key)
    if not path.exists():
        return []
    out: list[AuditLogEntry] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                out.append(AuditLogEntry(**_pick(AuditLogEntry, data)))
            except (json.JSONDecodeError, TypeError):
                continue
    return out

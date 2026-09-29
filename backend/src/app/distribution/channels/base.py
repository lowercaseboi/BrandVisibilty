"""Shared pieces for channel adapters: the protocol, text composition, validation, HTTP plumbing.

Conventions every adapter follows (the publish service relies on them):

- `status()` never touches the network — it only reads settings (it backs `GET /channels`).
- `publish()` never raises for API/network problems: it returns `PublishResult(ok=False,
  error=<human-readable>)`. Errors never contain credentials.
- In `export_only` mode `publish()` contacts no API and returns `ok=True` (external_url is
  None, or a share link for WhatsApp); the service records that attempt as "exported" based on
  `status().mode`.
- Settings are read with `getattr(settings, name, default)` so any object with the right
  attributes works (tests pass a SimpleNamespace); blank strings count as unset.
"""

from __future__ import annotations

import mimetypes
import re
import unicodedata
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import httpx

from app.distribution.types import TEXT_LIMITS, Campaign, ChannelId, ChannelStatus, PublishResult, Variant

SETUP_DOC = "docs/CHANNEL_SETUP.md"


@runtime_checkable
class ChannelAdapter(Protocol):
    channel: ChannelId
    label: str

    def status(self) -> ChannelStatus: ...

    def validate(self, variant: Variant) -> list[str]: ...

    def publish(
        self,
        *,
        campaign: Campaign,
        variant: Variant,
        image_path: Path | None = None,
        image_url: str | None = None,
    ) -> PublishResult: ...


class ChannelError(Exception):
    """A failure with a message that is safe and useful to show the user."""


def setting(settings: Any, name: str, default: Any = None) -> Any:
    value = getattr(settings, name, default)
    if isinstance(value, str) and not value.strip():
        return default
    return value.strip() if isinstance(value, str) else value


# --- text -----------------------------------------------------------------------------------------


def normalize_hashtags(tags: list[str]) -> list[str]:
    """`["perfume", "#Pune Local", "#perfume"]` → `["#perfume", "#PuneLocal"]` (dedupe, no spaces)."""
    out: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        body = re.sub(r"\s+", "", tag).lstrip("#")
        if body and body.lower() not in seen:
            seen.add(body.lower())
            out.append("#" + body)
    return out


def compose_text(variant: Variant, *, hashtags: bool = True, link: bool = True) -> str:
    """The exact text that gets posted: body, then the link (if not already in the body), then
    hashtags, separated by blank lines. Validation measures this same string."""
    parts = [variant.text.strip()]
    if link and variant.link and variant.link not in variant.text:
        parts.append(variant.link.strip())
    if hashtags:
        tags = normalize_hashtags(variant.hashtags)
        if tags:
            parts.append(" ".join(tags))
    return "\n\n".join(p for p in parts if p)


def length_issues(label: str, text: str, limit: int, *, measured: int | None = None, unit: str = "characters") -> list[str]:
    if not text.strip():
        return [f"{label}: the post text is empty."]
    n = len(text) if measured is None else measured
    if n > limit:
        return [f"{label}: too long — {n}/{limit} {unit} (hashtags and link included); cut {n - limit}."]
    return []


def image_mime(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "image/png"


# --- X weighted length (twitter-text v3 rules, simplified) ---------------------------------------

# Code points in these ranges weigh 1 (Latin, Devanagari and most Indic scripts, general
# punctuation); everything else (CJK, emoji…) weighs 2. Every URL counts as 23 (t.co wrapping).
_X_LIGHT_RANGES = ((0, 4351), (8192, 8205), (8208, 8223), (8242, 8247))
_URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
X_URL_LENGTH = 23


def _x_weight(s: str) -> int:
    return sum(1 if any(lo <= ord(ch) <= hi for lo, hi in _X_LIGHT_RANGES) else 2 for ch in s)


def x_weighted_length(text: str) -> int:
    """X's counted length. Simplification: bare domains without scheme/`www.` aren't treated as
    links, and emoji sequences count 2 per code point (conservative — never under-counts emoji)."""
    text = unicodedata.normalize("NFC", text)
    total, pos = 0, 0
    for m in _URL_RE.finditer(text):
        total += _x_weight(text[pos : m.start()]) + X_URL_LENGTH
        pos = m.end()
    return total + _x_weight(text[pos:])


# --- HTTP-backed adapters -------------------------------------------------------------------------


class HttpAdapter:
    """Base for adapters that call a platform API. Subclasses implement `status`, `validate` and
    `_publish` (which may raise ChannelError / httpx errors — this class turns them into results)."""

    channel: ChannelId
    label: str
    timeout = httpx.Timeout(60.0, connect=10.0)

    def __init__(self, settings: Any, *, client: httpx.Client | None = None, **_: Any) -> None:
        self.settings = settings
        self._client = client  # injected in tests (httpx.MockTransport); else one per publish

    @property
    def limit(self) -> int:
        return TEXT_LIMITS[self.channel]

    @contextmanager
    def _http(self) -> Iterator[httpx.Client]:
        if self._client is not None:
            yield self._client
        else:
            with httpx.Client(timeout=self.timeout) as client:
                yield client

    def status(self) -> ChannelStatus:  # pragma: no cover - abstract
        raise NotImplementedError

    def validate(self, variant: Variant) -> list[str]:
        return length_issues(self.label, compose_text(variant), self.limit)

    def _publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None, image_url: str | None
    ) -> PublishResult:  # pragma: no cover - abstract
        raise NotImplementedError

    def publish(
        self,
        *,
        campaign: Campaign,
        variant: Variant,
        image_path: Path | None = None,
        image_url: str | None = None,
    ) -> PublishResult:
        if self.status().mode != "connected":
            return PublishResult(ok=True)  # export_only: nothing sent; the service logs "exported"
        issues = self.validate(variant)
        if issues:
            return PublishResult(ok=False, error=" ".join(issues))
        try:
            return self._publish(campaign=campaign, variant=variant, image_path=image_path, image_url=image_url)
        except ChannelError as exc:
            return PublishResult(ok=False, error=f"{self.label}: {exc}")
        except httpx.TimeoutException:
            return PublishResult(ok=False, error=f"{self.label}: the request timed out — try again.")
        except httpx.HTTPError as exc:
            return PublishResult(ok=False, error=f"{self.label}: network error ({type(exc).__name__}) — check the connection and try again.")
        except OSError as exc:
            return PublishResult(ok=False, error=f"{self.label}: could not read the image file ({exc.strerror or type(exc).__name__}).")
        except (ValueError, KeyError, TypeError) as exc:
            return PublishResult(ok=False, error=f"{self.label}: unexpected response from the platform ({type(exc).__name__}).")


def response_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return None

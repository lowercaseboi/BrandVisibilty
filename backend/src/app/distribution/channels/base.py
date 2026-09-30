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
- Platform credentials come from a `ChannelCredentials` (a brand's connected account, or the
  global .env values as the single-tenant fallback — see app.distribution.accounts). Only
  non-credential knobs (API versions, PUBLIC_BASE_URL, quotas) are read from settings.
"""

from __future__ import annotations

import logging
import mimetypes
import re
import unicodedata
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import httpx

from app.distribution.types import (
    TEXT_LIMITS,
    AccountMethod,
    Campaign,
    ChannelId,
    ChannelStatus,
    PublishResult,
    Variant,
)

SETUP_DOC = "docs/CHANNEL_SETUP.md"


# --- never let a token reach the logs --------------------------------------------------------------


class _RedactUrlQuery(logging.Filter):
    """httpx logs every request URL at INFO ("HTTP Request: GET https://…?access_token=…"). Graph
    API calls and OAuth code exchanges carry secrets in the query string, so drop it."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple) and record.args:
            record.args = tuple(_strip_query(a) for a in record.args)
        return True


def _strip_query(value: Any) -> Any:
    text = str(value) if value.__class__.__name__ == "URL" else value
    if isinstance(text, str) and "://" in text and "?" in text:
        return text.split("?", 1)[0] + "?[redacted]"
    return value


for _name in ("httpx", "httpcore"):
    if not any(isinstance(f, _RedactUrlQuery) for f in logging.getLogger(_name).filters):
        logging.getLogger(_name).addFilter(_RedactUrlQuery())


# --- credentials -----------------------------------------------------------------------------------

# Channels that post through an account (the rest — whatsapp / export / sandbox — need none).
ACCOUNT_CHANNELS: tuple[ChannelId, ...] = ("facebook_page", "instagram", "x", "linkedin", "google_business")

# Credential field → the .env setting it falls back to (single-tenant setups).
ENV_FIELDS: dict[str, dict[str, str]] = {
    "facebook_page": {"page_id": "meta_page_id", "page_token": "meta_page_token"},
    "instagram": {"ig_user_id": "ig_user_id", "page_token": "meta_page_token"},
    "x": {
        "api_key": "x_api_key",
        "api_secret": "x_api_secret",
        "access_token": "x_access_token",
        "access_secret": "x_access_secret",
    },
    "linkedin": {"author_urn": "linkedin_author_urn", "access_token": "linkedin_access_token"},
    "google_business": {
        "account_id": "gbp_account_id",
        "location_id": "gbp_location_id",
        "access_token": "gbp_access_token",
    },
}

# The OAuth app keys each channel's "Connect" flow (and token refresh) needs: (client id, secret).
OAUTH_APP_KEYS: dict[str, tuple[str, str]] = {
    "facebook_page": ("meta_app_id", "meta_app_secret"),
    "instagram": ("meta_app_id", "meta_app_secret"),
    "x": ("x_client_id", "x_client_secret"),
    "linkedin": ("linkedin_client_id", "linkedin_client_secret"),
    "google_business": ("google_client_id", "google_client_secret"),
}

# Refresh a token this long before it actually expires.
EXPIRY_LEEWAY = timedelta(seconds=60)


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


@dataclass
class ChannelCredentials:
    """The credentials one adapter publishes with. `fields` holds decrypted values — never log,
    return or put them in an error (repr hides them)."""

    channel: str
    method: AccountMethod  # "oauth" | "manual" (a brand's account) | "env" (global .env fallback)
    fields: dict[str, str] = field(default_factory=dict, repr=False)
    brand_key: str | None = None
    account_id: str | None = None
    account_name: str | None = None
    expires_at: str | None = None
    problem: str | None = None  # e.g. stored values can't be decrypted

    def get(self, name: str) -> str | None:
        value = self.fields.get(name)
        return value.strip() if isinstance(value, str) and value.strip() else None

    def expired(self, now: datetime | None = None) -> bool:
        exp = parse_time(self.expires_at)
        return exp is not None and (now or datetime.now(UTC)) >= exp - EXPIRY_LEEWAY

    @property
    def from_brand(self) -> bool:
        return self.method in ("oauth", "manual")


def env_credentials(channel: str, settings: Any) -> ChannelCredentials:
    names = ENV_FIELDS.get(channel, {})
    fields = {f: v for f, env in names.items() if (v := setting(settings, env))}
    return ChannelCredentials(channel=channel, method="env", fields=fields)


def oauth_app_configured(channel: str, settings: Any) -> bool:
    """The platform's OAuth client keys are set (X public clients have no secret)."""
    keys = OAUTH_APP_KEYS.get(channel)
    if not keys:
        return False
    cid, secret = keys
    return bool(setting(settings, cid)) and (channel == "x" or bool(setting(settings, secret)))


def can_refresh(creds: ChannelCredentials, settings: Any) -> bool:
    return bool(creds.from_brand and creds.get("refresh_token") and oauth_app_configured(creds.channel, settings))


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

    def __init__(
        self,
        settings: Any,
        *,
        client: httpx.Client | None = None,
        credentials: ChannelCredentials | None = None,
        now: Callable[[], datetime] | None = None,
        **_: Any,
    ) -> None:
        self.settings = settings
        self._client = client  # injected in tests (httpx.MockTransport); else one per publish
        self.creds = credentials if credentials is not None else env_credentials(self.channel, settings)
        self._now: Callable[[], datetime] = now or (lambda: datetime.now(UTC))

    def cred(self, name: str) -> str | None:
        return self.creds.get(name)

    def _unusable(self) -> str | None:
        """Why the credentials can't be used at all (decrypt failure / expired without refresh)."""
        if self.creds.problem:
            return self.creds.problem
        if self.creds.expired(self._now()) and not can_refresh(self.creds, self.settings):
            return "the connected account's token has expired — reconnect it in Details → Connected accounts"
        return None

    def _export_only(self, detail: str) -> ChannelStatus:
        return ChannelStatus(self.channel, self.label, "export_only", detail=detail)

    def _refresh_if_needed(self, client: httpx.Client) -> None:
        if not self.creds.expired(self._now()):
            return
        if not can_refresh(self.creds, self.settings):
            raise ChannelError("the connected account's token has expired — reconnect it in Details → Connected accounts.")
        from app.distribution import oauth  # lazy: oauth imports the account store

        self.creds = oauth.refresh_credentials(self.creds, settings=self.settings, client=client, now=self._now())

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
            if self.creds.expired(self._now()):
                with self._http() as client:
                    self._refresh_if_needed(client)
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

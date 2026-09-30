"""Per-brand connected accounts (Details → Connected accounts): credential store + status.

One JSON file per brand at DATA_DIR/accounts/<brand_key>.json (DATA_DIR read at call time):

    {"version": 1,
     "accounts": {<channel>: {"method": "oauth"|"manual", "account_id", "account_name",
                              "connected_at", "expires_at", "scopes": [...],
                              "ids": {<non-secret field>: value},
                              "secrets": {<secret field>: <Fernet token>}}},
     "pending": {<channel>: {"expires_at", "choices": [{"id", "name", "kind",
                                                      "ids": {...}, "secrets": {...}}]}}}

Secrets (tokens, token secrets, API keys, refresh tokens) are encrypted with Fernet under a key
derived from SECRET_KEY (HKDF-SHA256). Without SECRET_KEY nothing secret is stored — callers get a
SecretKeyMissing with a clear message. Nothing in this module returns or logs a secret: the
API-facing view is `AccountStatus`, and decrypted values only ever travel inside a
`ChannelCredentials` (whose repr hides them) to an adapter.

Resolution (`resolve`): the brand's own account for the channel first; if the brand has none,
the global .env values (keeps single-tenant setups working).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import tempfile
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

import app.paths as paths
from app.distribution.channels.base import (
    ACCOUNT_CHANNELS,
    ChannelCredentials,
    can_refresh,
    env_credentials,
    oauth_app_configured,
    parse_time,
    setting,
)
from app.distribution.types import AccountMethod, AccountStatus, ChannelId

log = logging.getLogger(__name__)

_LOCK = threading.RLock()

SECRET_FIELDS = frozenset({"page_token", "api_key", "api_secret", "access_token", "access_secret", "bearer_token", "refresh_token"})

# What the manual (paste-a-token) form asks for, per channel.
MANUAL_FIELDS: dict[str, list[str]] = {
    "facebook_page": ["page_id", "page_token"],
    "instagram": ["ig_user_id", "page_token"],
    "x": ["api_key", "api_secret", "access_token", "access_secret"],
    "linkedin": ["author_urn", "access_token"],
    "google_business": ["account_id", "location_id", "access_token"],
}

# Order of GET /brands/{k}/accounts (whatsapp last: it needs no account).
STATUS_CHANNELS: tuple[ChannelId, ...] = (*ACCOUNT_CHANNELS, "whatsapp")

PENDING_TTL = timedelta(minutes=30)

WHATSAPP_DETAIL = (
    "Share link only — no account needed. WhatsApp has no posting API, so publishing makes a wa.me link with the "
    "message filled in; you open it, pick the chat, group or Channel and press send yourself."
)
MAX_FIELD_LEN = 4096
_NUMERIC = re.compile(r"^[0-9]{1,40}$")
_AUTHOR_RE = re.compile(r"^urn:li:(person|organization):[A-Za-z0-9_-]+$")
_HKDF_SALT = b"brandlens-accounts-v1"


class AccountError(ValueError):
    """Bad input for an account operation (message safe to show)."""


class SecretKeyMissing(RuntimeError):
    """SECRET_KEY isn't configured, so tokens can't be stored encrypted."""

    def __init__(self) -> None:
        super().__init__(
            "SECRET_KEY is not set on the server, so account tokens can't be stored safely. Set SECRET_KEY "
            "(any long random string) in .env and restart — see docs/CHANNEL_SETUP.md."
        )


# --------------------------------------------------------------------------- crypto


def _settings(settings: Any = None) -> Any:
    if settings is not None:
        return settings
    from app.config.settings import Settings

    return Settings()


def secret_key(settings: Any = None) -> str:
    key = setting(_settings(settings), "secret_key")
    if not key:
        raise SecretKeyMissing()
    return str(key)


def derive_key(secret: str, info: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=_HKDF_SALT, info=info).derive(secret.encode())


def _fernet(settings: Any = None) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(derive_key(secret_key(settings), b"account-credentials")))


def encrypt(value: str, settings: Any = None) -> str:
    return _fernet(settings).encrypt(value.encode()).decode()


def decrypt(token: str, settings: Any = None) -> str:
    return _fernet(settings).decrypt(token.encode()).decode()


# --------------------------------------------------------------------------- file store


def _safe_brand(brand_key: str) -> str:
    if not isinstance(brand_key, str) or not re.match(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", brand_key):
        raise AccountError(f"Invalid brand_key {brand_key!r}")
    return brand_key


def _path(brand_key: str) -> Path:
    return paths.DATA_DIR / "accounts" / f"{_safe_brand(brand_key)}.json"


def _read(brand_key: str) -> dict[str, Any]:
    try:
        data = json.loads(_path(brand_key).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"version": 1, "accounts": {}, "pending": {}}
    except (OSError, ValueError):
        log.warning("Unreadable account file for %s — treating it as empty", brand_key)
        return {"version": 1, "accounts": {}, "pending": {}}
    if not isinstance(data, dict):
        data = {}
    data.setdefault("version", 1)
    data["accounts"] = data.get("accounts") if isinstance(data.get("accounts"), dict) else {}
    data["pending"] = data.get("pending") if isinstance(data.get("pending"), dict) else {}
    return data


def _write(brand_key: str, data: dict[str, Any]) -> None:
    path = _path(brand_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{brand_key}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def delete_brand(brand_key: str) -> None:
    """Remove the brand's account file (brand deletion). Idempotent."""
    with _LOCK:
        try:
            _path(brand_key).unlink(missing_ok=True)
        except AccountError:
            pass


def now_iso(now: datetime | None = None) -> str:
    return (now or datetime.now(UTC)).isoformat(timespec="seconds")


def _split(fields: dict[str, str], settings: Any) -> tuple[dict[str, str], dict[str, str]]:
    ids = {k: v for k, v in fields.items() if k not in SECRET_FIELDS and v}
    secrets_in = {k: v for k, v in fields.items() if k in SECRET_FIELDS and v}
    if secrets_in:
        f = _fernet(settings)  # raises SecretKeyMissing before anything is written
        return ids, {k: f.encrypt(v.encode()).decode() for k, v in secrets_in.items()}
    return ids, {}


def save_account(
    brand_key: str,
    channel: str,
    *,
    fields: dict[str, str],
    method: AccountMethod,
    account_id: str | None = None,
    account_name: str | None = None,
    expires_at: str | None = None,
    scopes: list[str] | None = None,
    settings: Any = None,
    now: datetime | None = None,
) -> None:
    """Store (replace) the brand's account for `channel`. Secret fields are encrypted."""
    if channel not in ACCOUNT_CHANNELS:
        raise AccountError(f"{channel} has no account to connect")
    ids, enc = _split(fields, settings)
    record = {
        "method": method,
        "account_id": account_id,
        "account_name": account_name,
        "connected_at": now_iso(now),
        "expires_at": expires_at,
        "scopes": list(scopes or []),
        "ids": ids,
        "secrets": enc,
    }
    with _LOCK:
        data = _read(brand_key)
        data["accounts"][channel] = record
        data["pending"].pop(channel, None)
        _write(brand_key, data)


def update_tokens(
    brand_key: str, channel: str, *, fields: dict[str, str], expires_at: str | None, settings: Any = None
) -> None:
    """Merge refreshed secret fields into an existing account (token refresh)."""
    ids, enc = _split(fields, settings)
    with _LOCK:
        data = _read(brand_key)
        record = data["accounts"].get(channel)
        if not isinstance(record, dict):
            return
        record.setdefault("ids", {}).update(ids)
        record.setdefault("secrets", {}).update(enc)
        record["expires_at"] = expires_at
        _write(brand_key, data)


def delete_account(brand_key: str, channel: str) -> bool:
    with _LOCK:
        data = _read(brand_key)
        existed = data["accounts"].pop(channel, None) is not None
        pending = data["pending"].pop(channel, None) is not None
        if existed or pending:
            _write(brand_key, data)
        return existed


def _record(brand_key: str, channel: str) -> dict[str, Any] | None:
    rec = _read(brand_key)["accounts"].get(channel)
    return rec if isinstance(rec, dict) else None


def brand_credentials(brand_key: str, channel: str, *, settings: Any = None) -> ChannelCredentials | None:
    """The brand's own credentials for `channel` (decrypted), or None when it has no account."""
    rec = _record(brand_key, channel)
    if rec is None:
        return None
    fields: dict[str, str] = {k: str(v) for k, v in (rec.get("ids") or {}).items() if v}
    problem = None
    secrets_enc = rec.get("secrets") or {}
    if secrets_enc:
        try:
            f = _fernet(settings)
            for k, v in secrets_enc.items():
                fields[k] = f.decrypt(str(v).encode()).decode()
        except SecretKeyMissing:
            problem = "SECRET_KEY is not set, so the stored tokens can't be read — set it and reconnect"
        except (InvalidToken, ValueError):
            problem = "the stored tokens can't be decrypted (SECRET_KEY changed?) — reconnect the account"
    method = rec.get("method") if rec.get("method") in ("oauth", "manual") else "manual"
    return ChannelCredentials(
        channel=channel,
        method=method,
        fields={} if problem else fields,
        brand_key=brand_key,
        account_id=rec.get("account_id"),
        account_name=rec.get("account_name"),
        expires_at=rec.get("expires_at"),
        problem=problem,
    )


def resolve(channel: str, brand_key: str | None, *, settings: Any = None) -> ChannelCredentials:
    """Brand account first, else the global .env credentials."""
    s = _settings(settings)
    if brand_key:
        try:
            creds = brand_credentials(brand_key, channel, settings=s)
        except AccountError:
            creds = None
        if creds is not None:
            return creds
    return env_credentials(channel, s)


# --------------------------------------------------------------------------- manual entry


def _clean_manual(channel: str, raw: dict[str, Any]) -> tuple[dict[str, str], str | None]:
    """Validate the manual form → (fields, account_id). AccountError names the problem, never the value."""
    wanted = MANUAL_FIELDS.get(channel)
    if wanted is None:
        raise AccountError(f"{channel} has no account to connect")
    unknown = sorted(set(raw) - set(wanted))
    if unknown:
        raise AccountError(f"Unknown field(s) for {channel}: {', '.join(unknown)} (expected {', '.join(wanted)})")
    fields: dict[str, str] = {}
    for name in wanted:
        value = raw.get(name)
        if not isinstance(value, str) or not value.strip():
            raise AccountError(f"{name} is required")
        value = value.strip()
        if len(value) > MAX_FIELD_LEN or any(c in value for c in "\r\n\t"):
            raise AccountError(f"{name} doesn't look right (too long or contains line breaks)")
        fields[name] = value
    account_id: str | None = None
    if channel == "facebook_page":
        if not _NUMERIC.match(fields["page_id"]):
            raise AccountError("page_id must be the numeric Page ID")
        account_id = fields["page_id"]
    elif channel == "instagram":
        if not _NUMERIC.match(fields["ig_user_id"]):
            raise AccountError("ig_user_id must be the numeric Instagram business account ID")
        account_id = fields["ig_user_id"]
    elif channel == "linkedin":
        if not _AUTHOR_RE.match(fields["author_urn"]):
            raise AccountError("author_urn must look like urn:li:person:<id> or urn:li:organization:<id>")
        account_id = fields["author_urn"]
    elif channel == "google_business":
        acc = fields["account_id"].strip("/").rsplit("accounts/", 1)[-1]
        loc = fields["location_id"].strip("/").rsplit("locations/", 1)[-1]
        if not (_NUMERIC.match(acc) and _NUMERIC.match(loc)):
            raise AccountError("account_id and location_id must be numeric (accounts/<n>, locations/<n>)")
        fields["account_id"], fields["location_id"] = acc, loc
        account_id = f"accounts/{acc}/locations/{loc}"
    return fields, account_id


def set_manual(brand_key: str, channel: str, raw: dict[str, Any], *, settings: Any = None) -> None:
    fields, account_id = _clean_manual(channel, raw)
    save_account(brand_key, channel, fields=fields, method="manual", account_id=account_id, settings=settings)


# --------------------------------------------------------------------------- pending OAuth choices


def save_pending(brand_key: str, channel: str, choices: list[dict[str, Any]], *, settings: Any = None, now: datetime | None = None) -> None:
    """Store choices ({id, name, kind, fields, account_id?, account_name?, expires_at?, scopes?})
    after an OAuth callback that found more than one Page / org / location."""
    stored = []
    for c in choices:
        ids, enc = _split(dict(c.get("fields") or {}), settings)
        stored.append(
            {
                "id": str(c["id"]),
                "name": str(c.get("name") or c["id"]),
                "kind": str(c.get("kind") or ""),
                "account_id": c.get("account_id") or str(c["id"]),
                "account_name": c.get("account_name") or c.get("name"),
                "expires_at": c.get("expires_at"),
                "scopes": list(c.get("scopes") or []),
                "ids": ids,
                "secrets": enc,
            }
        )
    with _LOCK:
        data = _read(brand_key)
        data["pending"][channel] = {"expires_at": now_iso((now or datetime.now(UTC)) + PENDING_TTL), "choices": stored}
        _write(brand_key, data)


def _live_pending(data: dict[str, Any], channel: str, now: datetime | None) -> list[dict[str, Any]]:
    entry = data["pending"].get(channel)
    if not isinstance(entry, dict):
        return []
    exp = parse_time(entry.get("expires_at"))
    if exp is None or (now or datetime.now(UTC)) >= exp:
        return []
    return [c for c in entry.get("choices") or [] if isinstance(c, dict)]


def pending_choices(brand_key: str, channel: str, *, now: datetime | None = None) -> list[dict[str, str]]:
    """[{id, name, kind}] — never any token."""
    return [{"id": c["id"], "name": c["name"], "kind": c["kind"]} for c in _live_pending(_read(brand_key), channel, now)]


def choose(brand_key: str, channel: str, choice_id: str, *, settings: Any = None, now: datetime | None = None) -> None:
    """Connect the chosen pending option. LookupError if there's no such (unexpired) choice."""
    with _LOCK:
        data = _read(brand_key)
        match = next((c for c in _live_pending(data, channel, now) if c.get("id") == choice_id), None)
        if match is None:
            raise LookupError("That choice isn't available any more — start the connection again")
        data["accounts"][channel] = {
            "method": "oauth",
            "account_id": match.get("account_id"),
            "account_name": match.get("account_name"),
            "connected_at": now_iso(now),
            "expires_at": match.get("expires_at"),
            "scopes": match.get("scopes") or [],
            "ids": match.get("ids") or {},
            "secrets": match.get("secrets") or {},
        }
        data["pending"].pop(channel, None)
        _write(brand_key, data)


# --------------------------------------------------------------------------- statuses

_PLATFORM = {
    "facebook_page": "Meta (META_APP_ID / META_APP_SECRET)",
    "instagram": "Meta (META_APP_ID / META_APP_SECRET)",
    "x": "X (X_CLIENT_ID / X_CLIENT_SECRET)",
    "linkedin": "LinkedIn (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)",
    "google_business": "Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
}

_GBP_APPROVAL = (
    "Needs Google Business Profile API approval: Google grants API access on request — apply first "
    "(docs/CHANNEL_SETUP.md §Google), then connect."
)


def oauth_available(channel: str, settings: Any) -> bool:
    """The Connect button can work: the platform's OAuth app keys, OAUTH_REDIRECT_BASE and SECRET_KEY are set."""
    return (
        oauth_app_configured(channel, settings)
        and bool(setting(settings, "oauth_redirect_base"))
        and bool(setting(settings, "secret_key"))
    )


def _env_complete(creds: ChannelCredentials) -> bool:
    if creds.channel == "x":
        return all(creds.get(f) for f in MANUAL_FIELDS["x"])
    return all(creds.get(f) for f in MANUAL_FIELDS.get(creds.channel, []))


def _ig_note(settings: Any) -> str:
    from app.distribution.channels.meta import InstagramAdapter

    problem = InstagramAdapter(settings, credentials=ChannelCredentials("instagram", "env"))._public_url_problem()
    if not problem:
        return ""
    return f" Instagram also {problem}." if problem.startswith("needs") else f" Instagram: {problem}."


def _align_with_publisher(base: AccountStatus, channel: str, creds: ChannelCredentials, settings: Any) -> None:
    """A "connected" account must also be one the publish path would post with. If the channel's
    adapter would refuse (e.g. Instagram without a public PUBLIC_BASE_URL, an incomplete OAuth
    record, a malformed LinkedIn author), say so: state needs_setup + the adapter's reason."""
    from app.distribution.channels import ADAPTERS

    status = ADAPTERS[channel](settings, credentials=creds).status()
    if status.mode != "connected":
        base.state = "needs_setup"
        base.detail = f"Account saved, but posts can't go out yet: {status.detail}"


def account_status(brand_key: str, channel: ChannelId, *, settings: Any = None, now: datetime | None = None) -> AccountStatus:
    s = _settings(settings)
    if channel == "whatsapp":
        return AccountStatus(channel="whatsapp", state="connected", method=None, detail=WHATSAPP_DETAIL)
    if channel not in ACCOUNT_CHANNELS:
        raise AccountError(f"{channel} has no account to connect")
    oauth_ok = oauth_available(channel, s)
    base = AccountStatus(channel=channel, state="not_connected", oauth_available=oauth_ok, manual_fields=list(MANUAL_FIELDS[channel]))
    ig_note = _ig_note(s) if channel == "instagram" else ""

    creds = brand_credentials(brand_key, channel, settings=s)
    if creds is not None:
        base.method = creds.method
        base.account_id = creds.account_id
        base.account_name = creds.account_name
        base.expires_at = creds.expires_at
        rec = _record(brand_key, channel) or {}
        base.connected_at = rec.get("connected_at")
        if creds.problem:
            base.state, base.detail = "expired", creds.problem[:1].upper() + creds.problem[1:] + "."
        elif creds.expired(now) and not can_refresh(creds, s):
            base.state = "expired"
            base.detail = "The access token has expired — reconnect to keep posting."
        else:
            base.state = "connected"
            base.detail = "Connected with the Connect button." if creds.method == "oauth" else "Connected with manually entered credentials."
            if channel == "google_business":
                base.detail += " Posts only go out once Google has approved API access for the app."
            _align_with_publisher(base, channel, creds, s)
        return base

    env = env_credentials(channel, s)
    if _env_complete(env):
        base.state, base.method = "connected", "env"
        base.detail = "Using the server's .env credentials (shared by every brand). Connect this brand's own account to replace them."
        _align_with_publisher(base, channel, env, s)
        return base
    if channel == "google_business":
        base.state, base.detail = "pending_approval", _GBP_APPROVAL
        return base
    if oauth_ok:
        base.detail = "Not connected." + ig_note
        return base
    base.state = "needs_setup"
    base.detail = f"The Connect button needs {_PLATFORM[channel]}, OAUTH_REDIRECT_BASE and SECRET_KEY on the server — or enter the credentials manually." + ig_note
    return base


def account_statuses(brand_key: str, *, settings: Any = None, now: datetime | None = None) -> list[AccountStatus]:
    s = _settings(settings)
    return [account_status(brand_key, c, settings=s, now=now) for c in STATUS_CHANNELS]

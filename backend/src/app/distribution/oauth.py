"""OAuth "Connect" flows for per-brand accounts (Details → Connected accounts).

    start(brand, channel, return_to)  → authorize URL (signed `state`, PKCE where supported)
    handle_callback(channel, code, state, error) → frontend URL to 302 to
    refresh_credentials(creds)         → new tokens, persisted (X, Google, LinkedIn if it gave one)
    test_account(brand, channel)       → (ok, detail) from one cheap read-only call

`state` = base64url(JSON {b: brand, c: channel, n: nonce, e: expiry (10 min), r: return_to,
p: PKCE verifier ref}) + "." + base64url(HMAC-SHA256 over the first part, key derived from
SECRET_KEY). The nonce is also stored server-side (DATA_DIR/oauth/pending/<nonce>.json, with the
PKCE verifier) and deleted on first use, so a state works once. Tampered, expired or replayed
states are rejected.

Redirect URIs to register with each platform: f"{OAUTH_REDIRECT_BASE}/oauth/<channel>/callback".
Endpoints and scopes: docs/CHANNEL_SETUP.md (with notes on what to re-check in current docs).
Nothing here logs or returns a token; failures surface as short reason codes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import tempfile
import time
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

import app.paths as paths
from app.distribution import accounts
from app.distribution.channels.base import (
    ChannelCredentials,
    ChannelError,
    oauth_app_configured,
    response_json,
    setting,
)

log = logging.getLogger(__name__)

STATE_TTL_SECONDS = 600
OAUTH_CHANNELS = ("facebook_page", "instagram", "x", "linkedin", "google_business")

# --- platform endpoints ---------------------------------------------------------------------------
META_DIALOG = "https://www.facebook.com/{version}/dialog/oauth"
META_GRAPH = "https://graph.facebook.com/{version}"
META_SCOPES = (
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
)
LINKEDIN_AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization"
LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken"
LINKEDIN_USERINFO = "https://api.linkedin.com/v2/userinfo"
LINKEDIN_ORG_ACLS = "https://api.linkedin.com/rest/organizationAcls"
LINKEDIN_ORGS = "https://api.linkedin.com/rest/organizations"
LINKEDIN_MEMBER_SCOPES = ("openid", "profile", "w_member_social")
LINKEDIN_ORG_SCOPES = ("w_organization_social", "r_organization_admin")
X_AUTHORIZE = "https://x.com/i/oauth2/authorize"
X_TOKEN = "https://api.x.com/2/oauth2/token"
X_ME = "https://api.x.com/2/users/me"
X_SCOPES = ("tweet.read", "tweet.write", "users.read", "offline.access", "media.write")
GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage"
GBP_ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
GBP_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1"


class OAuthError(Exception):
    """A failed step, with a short reason code for the redirect (`connect_error=…&reason=…`)."""

    def __init__(self, reason: str, message: str = "") -> None:
        super().__init__(message or reason)
        self.reason = reason


class OAuthNotConfigured(Exception):
    """Can't start: platform app keys / OAUTH_REDIRECT_BASE missing (message safe to show)."""


def http_client() -> httpx.Client:
    """Factory for outbound calls (tests monkeypatch this with a MockTransport client)."""
    return httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0))


def _settings(settings: Any = None) -> Any:
    if settings is not None:
        return settings
    from app.config.settings import Settings

    return Settings()


def _now(now: datetime | None) -> datetime:
    return now or datetime.now(UTC)


def redirect_uri(channel: str, settings: Any) -> str:
    base = setting(settings, "oauth_redirect_base")
    if not base:
        raise OAuthNotConfigured("OAUTH_REDIRECT_BASE is not set on the server (the backend's public URL).")
    return f"{str(base).rstrip('/')}/oauth/{channel}/callback"


# --- return_to ------------------------------------------------------------------------------------

_RETURN_RE = re.compile(r"^/brands/(?P<brand>[A-Za-z0-9_-]+)/[A-Za-z0-9/_-]*$")


def safe_return_to(brand_key: str, return_to: str | None) -> str:
    """A relative app path under /brands/<brand>/ — anything else becomes /brands/<brand>/details."""
    default = f"/brands/{brand_key}/details"
    if not return_to or not isinstance(return_to, str) or len(return_to) > 200:
        return default
    m = _RETURN_RE.match(return_to)
    if not m or m.group("brand") != brand_key or "//" in return_to:
        return default
    return return_to


def frontend_url(settings: Any, return_to: str, params: dict[str, str]) -> str:
    base = str(setting(settings, "frontend_base_url", "http://localhost:5173")).rstrip("/")
    frag = "#accounts" if return_to.rstrip("/").endswith("/details") else ""
    return f"{base}{return_to}?{urlencode(params)}{frag}"


# --- signed state + server-side nonces -----------------------------------------------------------


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _state_key(settings: Any) -> bytes:
    return accounts.derive_key(accounts.secret_key(settings), b"oauth-state")


def sign_state(payload: dict[str, Any], settings: Any) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    mac = hmac.new(_state_key(settings), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(mac)}"


def verify_state(state: str, settings: Any, *, now: datetime | None = None) -> dict[str, Any]:
    """The payload of an authentic, unexpired state. OAuthError("bad_state" | "expired") otherwise."""
    try:
        body, mac = state.split(".", 1)
        expected = hmac.new(_state_key(settings), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(mac)):
            raise OAuthError("bad_state")
        payload = json.loads(_unb64(body))
    except OAuthError:
        raise
    except (ValueError, TypeError, AttributeError, accounts.SecretKeyMissing):
        raise OAuthError("bad_state") from None
    if not isinstance(payload, dict) or not all(k in payload for k in ("b", "c", "n", "e", "r")):
        raise OAuthError("bad_state")
    if _now(now).timestamp() > float(payload["e"]):
        raise OAuthError("expired")
    return payload


_NONCE_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def _nonce_dir() -> Path:
    return paths.DATA_DIR / "oauth" / "pending"


def _store_nonce(nonce: str, record: dict[str, Any]) -> None:
    d = _nonce_dir()
    d.mkdir(parents=True, exist_ok=True)
    # sweep old ones (abandoned flows)
    cutoff = time.time() - 2 * STATE_TTL_SECONDS
    for p in d.glob("*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink(missing_ok=True)
        except OSError:
            pass
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".nonce.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(record, fh)
    os.chmod(tmp, 0o600)
    os.replace(tmp, d / f"{nonce}.json")


def _consume_nonce(nonce: str) -> dict[str, Any]:
    if not isinstance(nonce, str) or not _NONCE_RE.match(nonce):
        raise OAuthError("bad_state")
    path = _nonce_dir() / f"{nonce}.json"
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise OAuthError("expired") from None  # already used, swept, or never issued
    path.unlink(missing_ok=True)
    return record if isinstance(record, dict) else {}


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)[:96]
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge


# --- start ----------------------------------------------------------------------------------------

_PKCE_CHANNELS = frozenset({"x", "google_business"})


def start(brand_key: str, channel: str, return_to: str | None = None, *, settings: Any = None, now: datetime | None = None) -> str:
    """The platform's authorize URL for this brand + channel."""
    s = _settings(settings)
    if channel not in OAUTH_CHANNELS:
        raise OAuthNotConfigured(f"{channel} has no Connect flow")
    if not oauth_app_configured(channel, s):
        raise OAuthNotConfigured(f"The Connect button for {channel} isn't set up on this server — {accounts._PLATFORM[channel]} are missing. Enter the credentials manually instead.")
    uri = redirect_uri(channel, s)
    accounts.secret_key(s)  # SecretKeyMissing early, before anything is stored
    nonce = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair() if channel in _PKCE_CHANNELS else (None, None)
    payload = {
        "b": brand_key,
        "c": channel,
        "n": nonce,
        "e": int(_now(now).timestamp()) + STATE_TTL_SECONDS,
        "r": safe_return_to(brand_key, return_to),
        "p": nonce if verifier else None,
    }
    _store_nonce(nonce, {"brand": brand_key, "channel": channel, "verifier": verifier})
    state = sign_state(payload, s)
    return PROVIDERS[channel].authorize_url(s, channel, uri, state, challenge)


# --- providers ------------------------------------------------------------------------------------


@dataclass
class Choice:
    id: str
    name: str
    kind: str
    fields: dict[str, str]
    account_id: str | None = None
    account_name: str | None = None
    expires_at: str | None = None
    scopes: list[str] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "fields": self.fields,
            "account_id": self.account_id or self.id,
            "account_name": self.account_name or self.name,
            "expires_at": self.expires_at,
            "scopes": self.scopes or [],
        }


def _expiry(expires_in: Any, now: datetime | None) -> str | None:
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError):
        return None
    return accounts.now_iso(_now(now) + timedelta(seconds=seconds)) if seconds > 0 else None


def _json_or_fail(resp: httpx.Response, reason: str) -> dict[str, Any]:
    body = response_json(resp)
    if not resp.is_success or not isinstance(body, dict) or body.get("error"):
        raise OAuthError(reason, f"HTTP {resp.status_code}")
    return body


class _Provider:
    def authorize_url(self, s: Any, channel: str, redirect: str, state: str, challenge: str | None) -> str:
        raise NotImplementedError

    def exchange(
        self, client: httpx.Client, s: Any, channel: str, code: str, redirect: str, verifier: str | None, now: datetime | None
    ) -> tuple[list[Choice], dict[str, list[Choice]]]:
        """(choices for `channel`, extra offers for other channels)."""
        raise NotImplementedError


class MetaProvider(_Provider):
    def _version(self, s: Any) -> str:
        return str(setting(s, "meta_graph_version", "v21.0"))

    def authorize_url(self, s, channel, redirect, state, challenge):
        q = {
            "client_id": setting(s, "meta_app_id"),
            "redirect_uri": redirect,
            "state": state,
            "response_type": "code",
            "scope": ",".join(META_SCOPES),
        }
        return f"{META_DIALOG.format(version=self._version(s))}?{urlencode(q)}"

    def exchange(self, client, s, channel, code, redirect, verifier, now):
        graph = META_GRAPH.format(version=self._version(s))
        app = {"client_id": setting(s, "meta_app_id"), "client_secret": setting(s, "meta_app_secret")}
        short = _json_or_fail(
            client.get(f"{graph}/oauth/access_token", params={**app, "redirect_uri": redirect, "code": code}), "token_exchange"
        )
        long = _json_or_fail(
            client.get(
                f"{graph}/oauth/access_token",
                params={**app, "grant_type": "fb_exchange_token", "fb_exchange_token": short["access_token"]},
            ),
            "token_exchange",
        )
        user_token = long.get("access_token") or short["access_token"]
        pages = _json_or_fail(
            client.get(
                f"{graph}/me/accounts",
                params={"fields": "id,name,access_token,instagram_business_account{id,username}", "limit": "100"},
                headers={"Authorization": f"Bearer {user_token}"},
            ),
            "api_error",
        ).get("data") or []
        page_choices: list[Choice] = []
        ig_choices: list[Choice] = []
        for p in pages:
            if not isinstance(p, dict) or not p.get("id") or not p.get("access_token"):
                continue
            name = str(p.get("name") or p["id"])
            page_choices.append(
                Choice(id=str(p["id"]), name=name, kind="page", fields={"page_id": str(p["id"]), "page_token": p["access_token"]})
            )
            ig = p.get("instagram_business_account")
            if isinstance(ig, dict) and ig.get("id"):
                handle = f"@{ig['username']}" if ig.get("username") else str(ig["id"])
                ig_choices.append(
                    Choice(
                        id=str(ig["id"]),
                        name=f"{handle} (via Page {name})",
                        kind="instagram",
                        fields={"ig_user_id": str(ig["id"]), "page_token": p["access_token"]},
                        account_name=handle,
                    )
                )
        if channel == "instagram":
            if not ig_choices:
                raise OAuthError("no_instagram")
            return ig_choices, {}
        if not page_choices:
            raise OAuthError("no_pages")
        return page_choices, {"instagram": ig_choices} if ig_choices else {}


class LinkedInProvider(_Provider):
    def _scopes(self, s: Any) -> tuple[str, ...]:
        return LINKEDIN_MEMBER_SCOPES + (LINKEDIN_ORG_SCOPES if setting(s, "linkedin_organization_scopes", False) else ())

    def authorize_url(self, s, channel, redirect, state, challenge):
        q = {
            "response_type": "code",
            "client_id": setting(s, "linkedin_client_id"),
            "redirect_uri": redirect,
            "state": state,
            "scope": " ".join(self._scopes(s)),
        }
        return f"{LINKEDIN_AUTHORIZE}?{urlencode(q)}"

    def exchange(self, client, s, channel, code, redirect, verifier, now):
        tok = _json_or_fail(
            client.post(
                LINKEDIN_TOKEN,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect,
                    "client_id": setting(s, "linkedin_client_id"),
                    "client_secret": setting(s, "linkedin_client_secret"),
                },
            ),
            "token_exchange",
        )
        token = tok["access_token"]
        expires = _expiry(tok.get("expires_in"), now)
        scopes = [x for x in re.split(r"[ ,]+", str(tok.get("scope") or "")) if x]
        base_fields = {"access_token": token}
        if tok.get("refresh_token"):
            base_fields["refresh_token"] = str(tok["refresh_token"])
        headers = {"Authorization": f"Bearer {token}"}
        me = _json_or_fail(client.get(LINKEDIN_USERINFO, headers=headers), "api_error")
        if not me.get("sub"):
            raise OAuthError("api_error")
        urn = f"urn:li:person:{me['sub']}"
        name = str(me.get("name") or " ".join(x for x in (me.get("given_name"), me.get("family_name")) if x) or "LinkedIn member")
        choices = [
            Choice(id=urn, name=name, kind="member", fields={**base_fields, "author_urn": urn}, expires_at=expires, scopes=scopes)
        ]
        if "w_organization_social" in scopes or (not scopes and setting(s, "linkedin_organization_scopes", False)):
            choices += self._orgs(client, s, headers, base_fields, expires, scopes)
        return choices, {}

    def _orgs(self, client, s, headers, base_fields, expires, scopes) -> list[Choice]:
        from app.distribution.channels.linkedin import DEFAULT_VERSION

        h = {**headers, "LinkedIn-Version": str(setting(s, "linkedin_api_version", DEFAULT_VERSION)), "X-Restli-Protocol-Version": "2.0.0"}
        try:
            resp = client.get(LINKEDIN_ORG_ACLS, params={"q": "roleAssignee", "role": "ADMINISTRATOR", "state": "APPROVED"}, headers=h)
            elements = (response_json(resp) or {}).get("elements") or [] if resp.is_success else []
        except httpx.HTTPError:
            return []  # member posting still works; orgs are a bonus
        out: list[Choice] = []
        for el in elements:
            org = el.get("organization") if isinstance(el, dict) else None
            if not isinstance(org, str) or not org.startswith("urn:li:organization:"):
                continue
            org_id = org.rsplit(":", 1)[-1]
            name = f"Organization {org_id}"
            try:
                r = client.get(f"{LINKEDIN_ORGS}/{org_id}", headers=h)
                if r.is_success:
                    name = str((response_json(r) or {}).get("localizedName") or name)
            except httpx.HTTPError:
                pass
            out.append(Choice(id=org, name=name, kind="organization", fields={**base_fields, "author_urn": org}, expires_at=expires, scopes=scopes))
        return out


def _basic(cid: str, secret: str | None) -> dict[str, str]:
    if not secret:
        return {}
    return {"Authorization": "Basic " + base64.b64encode(f"{cid}:{secret}".encode()).decode()}


class XProvider(_Provider):
    def authorize_url(self, s, channel, redirect, state, challenge):
        q = {
            "response_type": "code",
            "client_id": setting(s, "x_client_id"),
            "redirect_uri": redirect,
            "scope": " ".join(X_SCOPES),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return f"{X_AUTHORIZE}?{urlencode(q)}"

    def exchange(self, client, s, channel, code, redirect, verifier, now):
        if not verifier:
            raise OAuthError("bad_state")
        cid = setting(s, "x_client_id")
        tok = _json_or_fail(
            client.post(
                X_TOKEN,
                data={"code": code, "grant_type": "authorization_code", "client_id": cid, "redirect_uri": redirect, "code_verifier": verifier},
                headers=_basic(cid, setting(s, "x_client_secret")),
            ),
            "token_exchange",
        )
        fields = {"bearer_token": tok["access_token"]}
        if tok.get("refresh_token"):
            fields["refresh_token"] = str(tok["refresh_token"])
        me = _json_or_fail(client.get(X_ME, headers={"Authorization": f"Bearer {tok['access_token']}"}), "api_error").get("data") or {}
        if not me.get("id"):
            raise OAuthError("api_error")
        handle = f"@{me['username']}" if me.get("username") else str(me.get("name") or me["id"])
        scopes = [x for x in str(tok.get("scope") or "").split() if x]
        return [Choice(id=str(me["id"]), name=handle, kind="user", fields=fields, expires_at=_expiry(tok.get("expires_in"), now), scopes=scopes)], {}


class GoogleProvider(_Provider):
    def authorize_url(self, s, channel, redirect, state, challenge):
        q = {
            "client_id": setting(s, "google_client_id"),
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": GOOGLE_SCOPE,
            "access_type": "offline",
            "prompt": "consent",  # always hand back a refresh token
            "include_granted_scopes": "true",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return f"{GOOGLE_AUTHORIZE}?{urlencode(q)}"

    def exchange(self, client, s, channel, code, redirect, verifier, now):
        if not verifier:
            raise OAuthError("bad_state")
        tok = _json_or_fail(
            client.post(
                GOOGLE_TOKEN,
                data={
                    "code": code,
                    "client_id": setting(s, "google_client_id"),
                    "client_secret": setting(s, "google_client_secret"),
                    "redirect_uri": redirect,
                    "grant_type": "authorization_code",
                    "code_verifier": verifier,
                },
            ),
            "token_exchange",
        )
        token = tok["access_token"]
        fields = {"access_token": token}
        if tok.get("refresh_token"):
            fields["refresh_token"] = str(tok["refresh_token"])
        expires = _expiry(tok.get("expires_in"), now)
        headers = {"Authorization": f"Bearer {token}"}
        accts = _json_or_fail(client.get(GBP_ACCOUNTS, headers=headers), "api_error").get("accounts") or []
        choices: list[Choice] = []
        for a in accts:
            aname = a.get("name") if isinstance(a, dict) else None  # "accounts/123"
            if not isinstance(aname, str) or not aname.startswith("accounts/"):
                continue
            resp = client.get(f"{GBP_INFO}/{aname}/locations", params={"readMask": "name,title", "pageSize": "100"}, headers=headers)
            if not resp.is_success:
                continue
            for loc in (response_json(resp) or {}).get("locations") or []:
                lname = loc.get("name") if isinstance(loc, dict) else None  # "locations/456"
                if not isinstance(lname, str) or not lname.startswith("locations/"):
                    continue
                acc_id, loc_id = aname.split("/", 1)[1], lname.split("/", 1)[1]
                cid = f"{aname}/{lname}"
                title = str(loc.get("title") or lname)
                choices.append(
                    Choice(
                        id=cid,
                        name=f"{title} ({a.get('accountName') or aname})",
                        kind="location",
                        fields={**fields, "account_id": acc_id, "location_id": loc_id},
                        account_name=title,
                        expires_at=expires,
                        scopes=[GOOGLE_SCOPE],
                    )
                )
        if not choices:
            raise OAuthError("no_locations")
        return choices, {}


PROVIDERS: dict[str, _Provider] = {
    "facebook_page": MetaProvider(),
    "instagram": MetaProvider(),
    "linkedin": LinkedInProvider(),
    "x": XProvider(),
    "google_business": GoogleProvider(),
}


# --- callback -------------------------------------------------------------------------------------


def handle_callback(
    channel: str,
    *,
    code: str | None,
    state: str | None,
    error: str | None = None,
    settings: Any = None,
    now: datetime | None = None,
) -> str:
    """Finish a Connect flow; returns the frontend URL to redirect to. Never raises."""
    s = _settings(settings)
    try:
        payload = verify_state(state or "", s, now=now)
    except OAuthError as exc:
        # A bad/expired state has no trustworthy brand → land on the brand list (inside the app, which
        # can show the error), not the landing page.
        return frontend_url(s, "/app", {"connect_error": channel, "reason": exc.reason})
    brand, return_to = str(payload["b"]), str(payload["r"])
    return_to = safe_return_to(brand, return_to)
    try:
        if payload["c"] != channel:
            raise OAuthError("bad_state")
        nonce_rec = _consume_nonce(str(payload["n"]))
        if nonce_rec.get("brand") != brand or nonce_rec.get("channel") != channel:
            raise OAuthError("bad_state")
        if error:
            raise OAuthError("denied")
        if not code:
            raise OAuthError("no_code")
        verifier = nonce_rec.get("verifier") if payload.get("p") else None
        with http_client() as client:
            choices, offers = PROVIDERS[channel].exchange(client, s, channel, code, redirect_uri(channel, s), verifier, now)
        params: dict[str, str]
        if len(choices) == 1:
            c = choices[0]
            accounts.save_account(
                brand, channel, fields=c.fields, method="oauth", account_id=c.account_id or c.id,
                account_name=c.account_name or c.name, expires_at=c.expires_at, scopes=c.scopes, settings=s, now=now,
            )
            params = {"connected": channel}
        else:
            accounts.save_pending(brand, channel, [c.as_dict() for c in choices], settings=s, now=now)
            params = {"connect_choose": channel}
        for other, opts in offers.items():
            if opts and accounts.brand_credentials(brand, other, settings=s) is None:
                accounts.save_pending(brand, other, [c.as_dict() for c in opts], settings=s, now=now)
                params["offer"] = other
        return frontend_url(s, return_to, params)
    except OAuthError as exc:
        reason = exc.reason
    except accounts.SecretKeyMissing:
        reason = "no_secret_key"
    except OAuthNotConfigured:
        reason = "not_configured"
    except httpx.HTTPError as exc:
        reason = "network"
        log.warning("OAuth callback for %s/%s: network error %s", brand, channel, type(exc).__name__)
    except (KeyError, TypeError, ValueError) as exc:
        reason = "api_error"
        log.warning("OAuth callback for %s/%s: unexpected response (%s)", brand, channel, type(exc).__name__)
    log.info("OAuth connect for %s/%s failed: %s", brand, channel, reason)
    return frontend_url(s, return_to, {"connect_error": channel, "reason": reason})


# --- refresh --------------------------------------------------------------------------------------

_TOKEN_FIELD = {"x": "bearer_token", "linkedin": "access_token", "google_business": "access_token"}


def refresh_credentials(
    creds: ChannelCredentials, *, settings: Any = None, client: httpx.Client, now: datetime | None = None
) -> ChannelCredentials:
    """Use the refresh token; persist and return the new credentials. ChannelError on failure."""
    s = _settings(settings)
    channel = creds.channel
    refresh = creds.get("refresh_token")
    if channel not in _TOKEN_FIELD or not refresh:
        raise ChannelError("the token has expired and can't be refreshed — reconnect the account.")
    if channel == "x":
        cid = setting(s, "x_client_id")
        resp = client.post(
            X_TOKEN,
            data={"grant_type": "refresh_token", "refresh_token": refresh, "client_id": cid},
            headers=_basic(cid, setting(s, "x_client_secret")),
        )
    elif channel == "google_business":
        resp = client.post(
            GOOGLE_TOKEN,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": setting(s, "google_client_id"),
                "client_secret": setting(s, "google_client_secret"),
            },
        )
    else:
        resp = client.post(
            LINKEDIN_TOKEN,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": setting(s, "linkedin_client_id"),
                "client_secret": setting(s, "linkedin_client_secret"),
            },
        )
    body = response_json(resp)
    if not resp.is_success or not isinstance(body, dict) or not body.get("access_token"):
        hint = " (the refresh token was revoked or expired)" if resp.status_code in (400, 401) else ""
        raise ChannelError(f"couldn't refresh the access token{hint} — reconnect the account in Details → Connected accounts.")
    new_fields = {_TOKEN_FIELD[channel]: str(body["access_token"])}
    if body.get("refresh_token"):
        new_fields["refresh_token"] = str(body["refresh_token"])  # X rotates refresh tokens
    expires_at = _expiry(body.get("expires_in"), now)
    if creds.brand_key:
        accounts.update_tokens(creds.brand_key, channel, fields=new_fields, expires_at=expires_at, settings=s)
    return replace(creds, fields={**creds.fields, **new_fields}, expires_at=expires_at)


# --- test connection ------------------------------------------------------------------------------


def test_account(brand_key: str, channel: str, *, settings: Any = None, now: datetime | None = None) -> tuple[bool, str]:
    """One cheap read-only call with the brand's effective credentials → (ok, human detail)."""
    from app.distribution.channels import get_adapter

    s = _settings(settings)
    if channel == "whatsapp":
        return True, "No account needed — posts via a share link."
    with http_client() as client:
        adapter: Any = get_adapter(channel, brand_key, settings=s, client=client, **({"now": (lambda: _now(now))} if now else {}))
        if adapter.creds.problem:
            return False, adapter.creds.problem[:1].upper() + adapter.creds.problem[1:] + "."
        needed = accounts.MANUAL_FIELDS.get(channel, [])
        if channel == "x" and adapter.cred("bearer_token"):
            needed = ["bearer_token"]
        if not all(adapter.cred(f) for f in needed):
            return False, "Nothing to test — connect the account first."
        try:
            adapter._refresh_if_needed(client)
            return _probe(channel, adapter, client, s)
        except ChannelError as exc:
            return False, str(exc)
        except httpx.HTTPError as exc:
            return False, f"Network error ({type(exc).__name__}) — check the connection and try again."
        except (KeyError, TypeError, ValueError):
            return False, "Unexpected response from the platform."


_PROBE_HINTS = {401: "the token was rejected — reconnect", 403: "the token lacks a permission this needs", 404: "the account id wasn't found"}


def _fail(platform: str, resp: httpx.Response) -> tuple[bool, str]:
    hint = _PROBE_HINTS.get(resp.status_code, "try again later")
    return False, f"{platform} answered HTTP {resp.status_code}: {hint}."


def _probe(channel: str, adapter: Any, client: httpx.Client, s: Any) -> tuple[bool, str]:
    if channel in ("facebook_page", "instagram"):
        graph = META_GRAPH.format(version=str(setting(s, "meta_graph_version", "v21.0")))
        target = adapter.cred("page_id") if channel == "facebook_page" else adapter.cred("ig_user_id")
        fields = "id,name" if channel == "facebook_page" else "id,username"
        resp = client.get(f"{graph}/{target}", params={"fields": fields}, headers={"Authorization": f"Bearer {adapter.cred('page_token')}"})
        if not resp.is_success:
            return _fail("Meta", resp)
        body = response_json(resp) or {}
        if channel == "facebook_page":
            return True, f"Connected to the Page “{body.get('name') or target}”."
        return True, f"Connected to Instagram @{body.get('username') or target}."
    if channel == "x":
        resp = client.get(X_ME, headers=adapter._auth("GET", X_ME))
        if not resp.is_success:
            return _fail("X", resp)
        data = (response_json(resp) or {}).get("data") or {}
        return True, f"Connected as @{data.get('username') or data.get('id')}."
    if channel == "linkedin":
        resp = client.get(LINKEDIN_USERINFO, headers={"Authorization": f"Bearer {adapter.cred('access_token')}"})
        if resp.status_code == 403:
            return True, "The token is valid (it can't read the profile without the openid scope, which posting doesn't need)."
        if not resp.is_success:
            return _fail("LinkedIn", resp)
        return True, f"Token works — signed in as {(response_json(resp) or {}).get('name') or 'the member'}."
    if channel == "google_business":
        account, location, token = adapter._ids()
        resp = client.get(f"{GBP_INFO}/locations/{location}", params={"readMask": "name,title"}, headers={"Authorization": f"Bearer {token}"})
        if not resp.is_success:
            if resp.status_code in (403, 429):
                return False, f"Google answered HTTP {resp.status_code}: API access isn't approved (or enabled) for this project yet."
            return _fail("Google", resp)
        return True, f"Connected to the location “{(response_json(resp) or {}).get('title') or location}”."
    return False, f"{channel} has no account to test."

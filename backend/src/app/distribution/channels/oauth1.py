"""OAuth 1.0a request signing (HMAC-SHA1), RFC 5849 — self-contained, no extra dependency.

Used by the X adapter for user-context requests. Only query parameters and
application/x-www-form-urlencoded body parameters are part of the signature; JSON and
multipart bodies (which is all we send) are not (RFC 5849 §3.4.1.3.1).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from collections.abc import Iterable
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit


def pct(value: str) -> str:
    """RFC 3986 percent-encoding: everything except unreserved characters (A-Z a-z 0-9 - . _ ~)."""
    return quote(str(value), safe="~")


def base_url(url: str) -> str:
    parts = urlsplit(url)
    scheme, host = parts.scheme.lower(), (parts.hostname or "").lower()
    port = parts.port
    netloc = host if port is None or (scheme, port) in {("http", 80), ("https", 443)} else f"{host}:{port}"
    return urlunsplit((scheme, netloc, parts.path or "/", "", ""))


def signature_base_string(method: str, url: str, params: Iterable[tuple[str, str]]) -> str:
    encoded = sorted((pct(k), pct(v)) for k, v in params)
    param_string = "&".join(f"{k}={v}" for k, v in encoded)
    return "&".join((method.upper(), pct(base_url(url)), pct(param_string)))


def sign(method: str, url: str, params: Iterable[tuple[str, str]], consumer_secret: str, token_secret: str) -> str:
    key = f"{pct(consumer_secret)}&{pct(token_secret)}".encode()
    digest = hmac.new(key, signature_base_string(method, url, params).encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def authorization_header(
    method: str,
    url: str,
    *,
    consumer_key: str,
    consumer_secret: str,
    token: str,
    token_secret: str,
    form_params: Iterable[tuple[str, str]] = (),
    nonce: str | None = None,
    timestamp: int | None = None,
) -> str:
    """The `Authorization: OAuth ...` header value for one request. Query parameters are read
    from `url`; pass urlencoded form fields as `form_params` (never JSON/multipart fields)."""
    oauth = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(timestamp if timestamp is not None else int(time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    query = parse_qsl(urlsplit(url).query, keep_blank_values=True)
    all_params = [*oauth.items(), *query, *form_params]
    oauth["oauth_signature"] = sign(method, url, all_params, consumer_secret, token_secret)
    return "OAuth " + ", ".join(f'{pct(k)}="{pct(v)}"' for k, v in sorted(oauth.items()))

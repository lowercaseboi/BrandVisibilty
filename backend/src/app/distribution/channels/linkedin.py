"""LinkedIn adapter (Posts API, versioned REST). Setup: docs/CHANNEL_SETUP.md §LinkedIn.

Credentials: the brand's connected account (OAuth: OpenID + w_member_social, optionally
w_organization_social) or LINKEDIN_AUTHOR_URN + LINKEDIN_ACCESS_TOKEN from .env. The author is
`urn:li:person:<id>` (a member) or `urn:li:organization:<id>` (a company Page the member admins).

Every call sends `LinkedIn-Version: <LINKEDIN_API_VERSION>` (YYYYMM, default 202609; LinkedIn
supports each monthly version for at least a year) and `X-Restli-Protocol-Version: 2.0.0`.

Flow:
- image (optional): POST /rest/images?action=initializeUpload {initializeUploadRequest: {owner}}
  → value.uploadUrl + value.image (urn:li:image:…); PUT the bytes to uploadUrl.
- POST /rest/posts {author, commentary, visibility: PUBLIC, distribution, lifecycleState:
  PUBLISHED, content.media.id = image urn} → 201 with the post URN in the `x-restli-id` header;
  permalink https://www.linkedin.com/feed/update/<urn>.

`commentary` uses LinkedIn's "little" text format, where ( ) [ ] { } < > @ # * _ ~ | \\ are
reserved: they're backslash-escaped, and hashtags become `{hashtag|\\#|tag}` templates.
Access tokens last ~60 days; refresh tokens are only issued to approved partner apps, so an
expired account shows "expired" and must be reconnected (refresh is used when one exists).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from app.distribution.channels.base import (
    SETUP_DOC,
    ChannelError,
    HttpAdapter,
    compose_text,
    image_mime,
    length_issues,
    normalize_hashtags,
    response_json,
    setting,
)
from app.distribution.types import Campaign, ChannelStatus, PublishResult, Variant

API_BASE = "https://api.linkedin.com"
POSTS_URL = f"{API_BASE}/rest/posts"
IMAGES_INIT_URL = f"{API_BASE}/rest/images?action=initializeUpload"
USERINFO_URL = f"{API_BASE}/v2/userinfo"
DEFAULT_VERSION = "202609"
AUTHOR_RE = re.compile(r"^urn:li:(person|organization):[A-Za-z0-9_-]+$")

_RESERVED = re.compile(r"([\\|{}@\[\]()<>#*_~])")

_HINTS = {
    401: "the access token is invalid, expired or revoked — {reconnect}.",
    403: "missing permission — the token needs w_member_social (or w_organization_social for a company Page, and the member must be a Page admin).",
    422: "LinkedIn rejected the post content — check the text and image.",
    426: "the LinkedIn-Version header is no longer supported — set LINKEDIN_API_VERSION to a recent YYYYMM.",
    429: "rate limit reached — wait a while and retry.",
}


def escape_little(text: str) -> str:
    """Escape LinkedIn "little" format reserved characters so text posts verbatim."""
    return _RESERVED.sub(r"\\\1", text)


def linkedin_error(resp: httpx.Response) -> str:
    body = response_json(resp)
    msg = body.get("message") if isinstance(body, dict) else None
    hint = _HINTS.get(resp.status_code)
    return f"API error {resp.status_code}" + (f": {msg}" if msg else ".") + (f" Hint: {hint}" if hint else "")


def post_url(urn: str) -> str:
    return f"https://www.linkedin.com/feed/update/{quote(urn, safe=':')}"


class LinkedInAdapter(HttpAdapter):
    channel = "linkedin"
    label = "LinkedIn"
    env_fix = "generate a new LINKEDIN_ACCESS_TOKEN"

    def _version(self) -> str:
        return str(setting(self.settings, "linkedin_api_version", DEFAULT_VERSION))

    def headers(self, token: str | None = None) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token or self.cred('access_token')}",
            "LinkedIn-Version": self._version(),
            "X-Restli-Protocol-Version": "2.0.0",
        }

    def status(self) -> ChannelStatus:
        author, token = self.cred("author_urn"), self.cred("access_token")
        if not (author and token):
            if self.creds.from_brand:
                detail = "The connected account is missing its author or token — reconnect it; export pack until then."
            else:
                missing = " and ".join(n for n, v in (("LINKEDIN_AUTHOR_URN", author), ("LINKEDIN_ACCESS_TOKEN", token)) if not v)
                detail = f"Connect a LinkedIn account in Details (or set {missing}, see {SETUP_DOC}); export pack until then."
            return self._export_only(detail)
        if not AUTHOR_RE.match(author):
            return self._export_only("The author must be urn:li:person:<id> or urn:li:organization:<id>.")
        problem = self._unusable()
        if problem:
            return self._export_only(problem[:1].upper() + problem[1:] + ".")
        kind = "Company Page" if ":organization:" in author else "Member"
        name = self.creds.account_name if self.creds.from_brand else None
        return ChannelStatus(self.channel, self.label, "connected", detail=f"{kind}: {name}" if name else f"{kind} {author}")

    def commentary(self, variant: Variant) -> str:
        body = escape_little(compose_text(variant, hashtags=False))
        tags = [t.lstrip("#") for t in normalize_hashtags(variant.hashtags)]
        if tags:
            body += "\n\n" + " ".join("{hashtag|\\#|" + escape_little(t) + "}" for t in tags)
        return body

    def validate(self, variant: Variant) -> list[str]:
        return length_issues(self.label, compose_text(variant), self.limit)

    def _publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None, image_url: str | None
    ) -> PublishResult:
        author = self.cred("author_urn") or ""
        payload: dict[str, Any] = {
            "author": author,
            "commentary": self.commentary(variant),
            "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }
        with self._http() as client:
            if image_path is not None:
                media: dict[str, Any] = {"id": self._upload(client, author, image_path)}
                if variant.alt_text:
                    media["altText"] = variant.alt_text[:4086]
                payload["content"] = {"media": media}
            resp = client.post(POSTS_URL, json=payload, headers=self.headers())
            if not resp.is_success:
                raise ChannelError(linkedin_error(resp))
            urn = resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id")
            if not urn:
                raise ChannelError("the post was accepted but LinkedIn returned no post id.")
        return PublishResult(ok=True, external_url=post_url(urn), external_id=urn)

    def _upload(self, client: httpx.Client, owner: str, image_path: Path) -> str:
        resp = client.post(IMAGES_INIT_URL, json={"initializeUploadRequest": {"owner": owner}}, headers=self.headers())
        if not resp.is_success:
            raise ChannelError("image upload failed — " + linkedin_error(resp))
        value = (response_json(resp) or {}).get("value") or {}
        upload_url, image_urn = value.get("uploadUrl"), value.get("image")
        if not upload_url or not image_urn:
            raise ChannelError("image upload returned no upload URL.")
        put = client.put(
            upload_url,
            content=image_path.read_bytes(),
            headers={"Authorization": f"Bearer {self.cred('access_token')}", "Content-Type": image_mime(image_path)},
        )
        if not put.is_success:
            raise ChannelError(f"image upload failed (HTTP {put.status_code}).")
        return str(image_urn)

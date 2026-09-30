"""Meta Graph API adapters: Facebook Page and Instagram (Business/Creator account linked to it).

Both use a Page access token: the brand's connected account (Facebook Login → the Page's own
token, which doesn't expire), else META_PAGE_TOKEN from .env. Setup: docs/CHANNEL_SETUP.md.

Facebook Page: POST /{page_id}/photos (multipart `source` = image bytes, or `url` = public image
URL) with `caption`, or POST /{page_id}/feed (`message`, `link`) for text-only posts; the
permalink comes from GET /{post_id}?fields=permalink_url.

Instagram (Content Publishing API, image posts): POST /{ig_user_id}/media {image_url, caption}
creates a container → poll GET /{container_id}?fields=status_code until FINISHED (bounded) →
POST /{ig_user_id}/media_publish {creation_id} → GET /{media_id}?fields=permalink.
Instagram fetches the image itself, so it must be at a public URL (PUBLIC_BASE_URL/media/...).
Meta's docs list JPEG as the only supported image format for feed posts.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

from app.distribution.channels.base import (
    SETUP_DOC,
    ChannelError,
    HttpAdapter,
    compose_text,
    image_mime,
    length_issues,
    normalize_hashtags,
    public_url_problem,
    response_json,
    setting,
)
from app.distribution.types import Campaign, ChannelStatus, PublishResult, Variant

GRAPH_BASE = "https://graph.facebook.com"
# Graph API version when META_GRAPH_VERSION isn't set. Each version lives ~2 years: v25.0 was
# released 2026-02-18 and expires 2028-07-29 (developers.facebook.com/docs/graph-api/changelog/versions).
DEFAULT_GRAPH_VERSION = "v25.0"

_GRAPH_HINTS = {
    190: "the access token was rejected (invalid, expired or revoked) — {reconnect}.",
    102: "the session is no longer valid — {reconnect}.",
    10: "missing permission — the token needs pages_manage_posts / instagram_content_publish.",
    200: "missing permission — the token needs pages_manage_posts / instagram_content_publish.",
    4: "rate limit reached — wait a while and retry.",
    17: "rate limit reached — wait a while and retry.",
    32: "rate limit reached — wait a while and retry.",
    613: "rate limit reached — wait a while and retry.",
    9004: "Instagram could not download the image — make sure PUBLIC_BASE_URL is publicly reachable and serves a JPEG.",
}


def graph_json(resp: httpx.Response) -> dict[str, Any]:
    """Parse a Graph API response or raise ChannelError with Meta's own message (+ a hint)."""
    body = response_json(resp)
    if resp.is_success and isinstance(body, dict) and "error" not in body:
        return body
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        code = err.get("code")
        msg = err.get("error_user_msg") or err.get("message") or "unknown error"
        hint = _GRAPH_HINTS.get(code) if isinstance(code, int) else None
        if hint is None and isinstance(code, int) and 200 <= code < 300:
            hint = _GRAPH_HINTS[200]
        return _raise(f"Graph API error {code}: {msg}" + (f" Hint: {hint}" if hint else ""))
    if resp.status_code == 401:
        return _raise("Graph API returned HTTP 401 — the token was rejected; {reconnect}.")
    return _raise(f"Graph API returned HTTP {resp.status_code}.")


def _raise(msg: str) -> dict[str, Any]:
    raise ChannelError(msg)


class _MetaAdapter(HttpAdapter):
    env_fix = "generate a new long-lived Page token and set META_PAGE_TOKEN"
    def _base(self) -> str:
        version = setting(self.settings, "meta_graph_version", DEFAULT_GRAPH_VERSION)
        return f"{GRAPH_BASE}/{version}"

    def _token(self) -> str | None:
        return self.cred("page_token")

    def _missing(self, names: tuple[tuple[str, str, str | None], ...]) -> str:
        """"Set META_PAGE_ID and …" for .env setups; "Connect … (missing page token)" for brand accounts."""
        missing = [(env, human) for env, human, v in names if not v]
        if self.creds.from_brand:
            return f"The connected account is missing its {' and '.join(h for _, h in missing)} — reconnect it; export pack until then."
        return f"Set {' and '.join(e for e, _ in missing)} to post (see {SETUP_DOC}) or connect an account in Details; export pack until then."


class FacebookPageAdapter(_MetaAdapter):
    channel = "facebook_page"
    label = "Facebook Page"

    def _page_id(self) -> str | None:
        return self.cred("page_id")

    def status(self) -> ChannelStatus:
        page_id, token = self._page_id(), self._token()
        if not (page_id and token):
            return self._export_only(
                self._missing((("META_PAGE_ID", "page id", page_id), ("META_PAGE_TOKEN", "page token", token)))
            )
        problem = self._unusable()
        if problem:
            return self._export_only(problem[:1].upper() + problem[1:] + ".")
        name = self.creds.account_name if self.creds.from_brand else None
        return ChannelStatus(self.channel, self.label, "connected", detail=f"Page: {name}" if name else f"Page ID {page_id}")

    def _publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None, image_url: str | None
    ) -> PublishResult:
        page_id, token, base = self._page_id(), self._token(), self._base()
        with self._http() as client:
            if image_path is not None:
                data = {"caption": compose_text(variant), "access_token": token}
                files = {"source": (image_path.name, image_path.read_bytes(), image_mime(image_path))}
                body = graph_json(client.post(f"{base}/{page_id}/photos", data=data, files=files))
            elif image_url:
                data = {"url": image_url, "caption": compose_text(variant), "access_token": token}
                body = graph_json(client.post(f"{base}/{page_id}/photos", data=data))
            else:
                data = {"message": compose_text(variant, link=False), "access_token": token}
                if variant.link:
                    data["link"] = variant.link
                body = graph_json(client.post(f"{base}/{page_id}/feed", data=data))
            post_id = str(body.get("post_id") or body["id"])
            url = self._permalink(client, base, post_id, token)
        return PublishResult(ok=True, external_url=url, external_id=post_id)

    @staticmethod
    def _permalink(client: httpx.Client, base: str, post_id: str, token: str | None) -> str:
        fallback = f"https://www.facebook.com/{post_id}"
        try:
            body = graph_json(client.get(f"{base}/{post_id}", params={"fields": "permalink_url", "access_token": token}))
        except (ChannelError, httpx.HTTPError):
            return fallback  # the post exists; only the nicer URL lookup failed
        return str(body.get("permalink_url") or fallback)


class InstagramAdapter(_MetaAdapter):
    channel = "instagram"
    label = "Instagram"
    max_hashtags = 30

    def __init__(
        self,
        settings: Any,
        *,
        client: httpx.Client | None = None,
        poll_attempts: int = 10,
        poll_interval: float = 3.0,
        sleep: Callable[[float], None] = time.sleep,
        **kw: Any,
    ) -> None:
        super().__init__(settings, client=client, **kw)
        self.poll_attempts = poll_attempts
        self.poll_interval = poll_interval
        self._sleep = sleep

    def _ig_user_id(self) -> str | None:
        return self.cred("ig_user_id")

    def _public_base_url(self) -> str | None:
        return setting(self.settings, "public_base_url")

    def _public_url_problem(self) -> str | None:
        problem = public_url_problem(self._public_base_url())
        return problem.replace("the platform", "Instagram") if problem else None

    def status(self) -> ChannelStatus:
        ig, token = self._ig_user_id(), self._token()
        if not (ig and token):
            return self._export_only(
                self._missing((("IG_USER_ID", "Instagram account id", ig), ("META_PAGE_TOKEN", "page token", token)))
            )
        problem = self._unusable() or self._public_url_problem()
        if problem:
            return self._export_only(problem[:1].upper() + problem[1:] + ".")
        name = self.creds.account_name if self.creds.from_brand else None
        return ChannelStatus(self.channel, self.label, "connected", detail=f"Instagram: {name}" if name else f"IG account {ig}")

    def validate(self, variant: Variant) -> list[str]:
        issues = length_issues(self.label, compose_text(variant), self.limit)
        if len(normalize_hashtags(variant.hashtags)) > self.max_hashtags:
            issues.append(f"{self.label}: at most {self.max_hashtags} hashtags are allowed.")
        if not variant.asset_id:
            issues.append(f"{self.label}: posts need an image — attach one.")
        problem = self._public_url_problem()
        if problem:
            issues.append(f"{self.label}: {problem}.")
        return issues

    def _publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None, image_url: str | None
    ) -> PublishResult:
        if not image_url:
            raise ChannelError("needs a public image URL (PUBLIC_BASE_URL/media/...) — Instagram fetches the image itself.")
        ig, token, base = self._ig_user_id(), self._token(), self._base()
        with self._http() as client:
            data = {"image_url": image_url, "caption": compose_text(variant), "access_token": token}
            container_id = str(graph_json(client.post(f"{base}/{ig}/media", data=data))["id"])
            self._wait_until_finished(client, base, container_id, token)
            body = graph_json(
                client.post(f"{base}/{ig}/media_publish", data={"creation_id": container_id, "access_token": token})
            )
            media_id = str(body["id"])
            url: str | None = None
            try:
                url = graph_json(client.get(f"{base}/{media_id}", params={"fields": "permalink", "access_token": token})).get(
                    "permalink"
                )
            except (ChannelError, httpx.HTTPError):
                pass  # published; permalink lookup is best-effort
        return PublishResult(ok=True, external_url=url, external_id=media_id)

    def _wait_until_finished(self, client: httpx.Client, base: str, container_id: str, token: str | None) -> None:
        for attempt in range(self.poll_attempts):
            body = graph_json(
                client.get(f"{base}/{container_id}", params={"fields": "status_code,status", "access_token": token})
            )
            code = body.get("status_code")
            if code in ("FINISHED", "PUBLISHED"):
                return
            if code in ("ERROR", "EXPIRED"):
                detail = body.get("status") or code
                raise ChannelError(
                    f"Instagram rejected the media container ({detail}). Check the image is a JPEG at a public URL, "
                    "with an aspect ratio between 4:5 and 1.91:1."
                )
            if attempt < self.poll_attempts - 1:
                self._sleep(self.poll_interval)
        raise ChannelError(
            f"the image was still processing after {self.poll_attempts} checks — nothing was posted; try again."
        )

"""X (Twitter) adapter: user-context auth, v2 media upload, v2 create post.

Two ways to authenticate, both user context:
- OAuth 2.0 (a brand connected with the "Connect" button): `Authorization: Bearer <user token>`.
  Tokens last about 2 hours; with `offline.access` a refresh token comes along and the adapter
  refreshes before publishing (app.distribution.oauth.refresh_credentials), saving the new pair.
- OAuth 1.0a (manual keys, or X_* in .env): api key/secret + access token/secret, signed per
  request (oauth1.py).

Flow: POST https://api.x.com/2/media/upload (multipart: media, media_category=tweet_image,
media_type) → data.id; then POST https://api.x.com/2/tweets {"text", "media": {"media_ids"}}.

Why v2 upload and not v1.1: X announced the deprecation of upload.twitter.com/1.1/media/upload.json
in 2025 and the v2 endpoint accepts OAuth 1.0a user-context tokens, so it's the one that keeps
working (verify in current docs; the response parser also accepts the v1.1 `media_id_string`
shape in case the upload URL has to be switched back).

The free tier caps posts per month, so successful posts are counted locally in
DATA_DIR/channels/x_usage.json ({"YYYY-MM": n}) and `status().quota_remaining` =
X_MONTHLY_POST_LIMIT − posts this calendar month (UTC). The count only knows about posts made
through this app.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

import app.paths as paths
from app.distribution.channels import oauth1
from app.distribution.channels.base import (
    SETUP_DOC,
    ChannelError,
    HttpAdapter,
    compose_text,
    image_mime,
    length_issues,
    response_json,
    setting,
    x_weighted_length,
)
from app.distribution.types import Campaign, ChannelStatus, PublishResult, Variant

MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload"
TWEETS_URL = "https://api.x.com/2/tweets"
USERS_ME_URL = "https://api.x.com/2/users/me"
_OAUTH1_FIELDS = ("api_key", "api_secret", "access_token", "access_secret")

_usage_lock = threading.Lock()


def _usage_path() -> Path:
    return paths.DATA_DIR / "channels" / "x_usage.json"


def _read_usage() -> dict[str, int]:
    try:
        data = json.loads(_usage_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, int)} if isinstance(data, dict) else {}


def _write_usage(data: dict[str, int]) -> None:
    path = _usage_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".x_usage.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def x_error(resp: httpx.Response) -> str:
    body = response_json(resp)
    detail = None
    if isinstance(body, dict):
        errors = body.get("errors")
        if isinstance(errors, list) and errors and isinstance(errors[0], dict):
            detail = errors[0].get("message") or errors[0].get("detail")
        detail = body.get("detail") or detail or body.get("title")
    msg = f"X API error {resp.status_code}" + (f": {detail}" if detail else ".")
    hints = {
        401: "the credentials were rejected — reconnect the account (or check the X API keys and access token/secret).",
        403: "if this isn't a duplicate post, the app may be Read-only — set it to Read and Write, then regenerate the access token and secret.",
        429: "rate or monthly post limit reached on X's side — wait and retry.",
    }
    hint = hints.get(resp.status_code)
    return msg + (f" Hint: {hint}" if hint else "")


class XAdapter(HttpAdapter):
    channel = "x"
    label = "X (Twitter)"

    def __init__(
        self,
        settings: Any,
        *,
        client: httpx.Client | None = None,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        **kw: Any,
    ) -> None:
        super().__init__(settings, client=client, now=now, **kw)

    # --- quota -----------------------------------------------------------------------------------

    def _month(self) -> str:
        return self._now().strftime("%Y-%m")

    def monthly_limit(self) -> int:
        return int(setting(self.settings, "x_monthly_post_limit", 500))

    def posts_this_month(self) -> int:
        return _read_usage().get(self._month(), 0)

    def quota_remaining(self) -> int:
        return max(0, self.monthly_limit() - self.posts_this_month())

    def _record_post(self) -> None:
        with _usage_lock:
            data = _read_usage()
            month = self._month()
            data[month] = data.get(month, 0) + 1
            _write_usage(data)

    # --- adapter ---------------------------------------------------------------------------------

    def uses_oauth2(self) -> bool:
        return bool(self.cred("bearer_token"))

    def status(self) -> ChannelStatus:
        if not self.uses_oauth2():
            missing = [f for f in _OAUTH1_FIELDS if not self.cred(f)]
            if missing:
                if self.creds.from_brand:
                    detail = f"The connected account is missing {', '.join(missing)} — reconnect it; export pack until then."
                else:
                    envs = ", ".join("X_" + f.upper() for f in missing)
                    detail = f"Set {envs} to post (see {SETUP_DOC}) or connect an account in Details; export pack until then."
                return self._export_only(detail)
        problem = self._unusable()
        if problem:
            return self._export_only(problem[:1].upper() + problem[1:] + ".")
        left = self.quota_remaining()
        who = f"{self.creds.account_name} · " if self.creds.from_brand and self.creds.account_name else ""
        return ChannelStatus(
            self.channel,
            self.label,
            "connected",
            detail=f"{who}{left} of {self.monthly_limit()} posts left this month (counted by this app)",
            quota_remaining=left,
        )

    def validate(self, variant: Variant) -> list[str]:
        text = compose_text(variant)
        return length_issues(
            self.label, text, self.limit, measured=x_weighted_length(text), unit="characters as X counts them (links = 23)"
        )

    def _auth(self, method: str, url: str) -> dict[str, str]:
        if self.uses_oauth2():
            return {"Authorization": f"Bearer {self.cred('bearer_token')}"}
        header = oauth1.authorization_header(
            method,
            url,
            consumer_key=self.cred("api_key") or "",
            consumer_secret=self.cred("api_secret") or "",
            token=self.cred("access_token") or "",
            token_secret=self.cred("access_secret") or "",
        )
        return {"Authorization": header}

    def _publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None, image_url: str | None
    ) -> PublishResult:
        if self.quota_remaining() <= 0:
            raise ChannelError(
                f"monthly post limit reached ({self.monthly_limit()} posts) — resets on the 1st; raise X_MONTHLY_POST_LIMIT on a paid tier."
            )
        payload: dict[str, Any] = {"text": compose_text(variant)}
        with self._http() as client:
            if image_path is not None:
                payload["media"] = {"media_ids": [self._upload(client, image_path)]}
            resp = client.post(TWEETS_URL, json=payload, headers=self._auth("POST", TWEETS_URL))
            if not resp.is_success:
                raise ChannelError(x_error(resp))
            body = response_json(resp)
            post_id = str(body["data"]["id"])
        self._record_post()
        return PublishResult(ok=True, external_url=f"https://x.com/i/web/status/{post_id}", external_id=post_id)

    def _upload(self, client: httpx.Client, image_path: Path) -> str:
        mime = image_mime(image_path)
        resp = client.post(
            MEDIA_UPLOAD_URL,
            data={"media_category": "tweet_image", "media_type": mime},
            files={"media": (image_path.name, image_path.read_bytes(), mime)},
            headers=self._auth("POST", MEDIA_UPLOAD_URL),
        )
        if not resp.is_success:
            raise ChannelError("image upload failed — " + x_error(resp))
        body = response_json(resp)
        data = body.get("data") if isinstance(body, dict) else None
        media_id = (data or {}).get("id") or (body or {}).get("media_id_string")
        if not media_id:
            raise ChannelError("image upload returned no media id.")
        return str(media_id)

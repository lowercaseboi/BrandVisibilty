"""Google Business Profile adapter (localPosts, Business Profile API v4).

Export-only until GBP_ACCOUNT_ID, GBP_LOCATION_ID and GBP_ACCESS_TOKEN are all set — API access
has to be requested from Google first (docs/CHANNEL_SETUP.md). When set:
POST https://mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/localPosts with
{languageCode, summary, topicType: STANDARD, media: [{mediaFormat: PHOTO, sourceUrl}],
callToAction: {actionType: LEARN_MORE, url}}. The link goes in the CTA button, not the text;
hashtags are left out (they do nothing on GBP).

Credentials: the brand's connected account (OAuth "Connect" stores a refresh token, so the
hourly access token is refreshed before each publish), else GBP_ACCOUNT_ID / GBP_LOCATION_ID /
GBP_ACCESS_TOKEN from .env (a plain access token that expires after about an hour).
"""

from __future__ import annotations

from pathlib import Path

from app.distribution.channels.base import (
    SETUP_DOC,
    ChannelError,
    HttpAdapter,
    compose_text,
    length_issues,
    public_url_problem,
    response_json,
    setting,
)
from app.distribution.types import Campaign, ChannelStatus, PublishResult, Variant

GBP_BASE = "https://mybusiness.googleapis.com/v4"

_HINTS = {
    401: "the access token is invalid, expired or revoked (they last about an hour) — {reconnect}.",
    403: "API access not granted or the API isn't enabled for this Google Cloud project (see CHANNEL_SETUP.md §Google).",
    404: "check GBP_ACCOUNT_ID and GBP_LOCATION_ID.",
    429: "quota exceeded — unapproved projects have a quota of 0.",
}


def _strip_prefix(value: str, prefix: str) -> str:
    value = value.strip().strip("/")
    return value.rsplit(prefix, 1)[-1] if prefix in value else value


class GoogleBusinessAdapter(HttpAdapter):
    channel = "google_business"
    label = "Google Business Profile"
    env_fix = "get a fresh GBP_ACCESS_TOKEN (they last about an hour)"

    def _ids(self) -> tuple[str | None, str | None, str | None]:
        account = self.cred("account_id")
        location = self.cred("location_id")
        return (
            _strip_prefix(account, "accounts/") if account else None,
            _strip_prefix(location, "locations/") if location else None,
            self.cred("access_token"),
        )

    def status(self) -> ChannelStatus:
        account, location, token = self._ids()
        if account and location and token:
            problem = self._unusable()
            if problem:
                return self._export_only(problem[:1].upper() + problem[1:] + ".")
            name = self.creds.account_name if self.creds.from_brand else None
            return ChannelStatus(self.channel, self.label, "connected", detail=f"Location: {name}" if name else f"Location {location}")
        return ChannelStatus(
            self.channel,
            self.label,
            "export_only",
            detail=f"Needs Google Business Profile API access (apply: see {SETUP_DOC.rsplit('/', 1)[-1]})",
        )

    def _summary(self, variant: Variant) -> str:
        return compose_text(variant, hashtags=False, link=False)

    def validate(self, variant: Variant) -> list[str]:
        return length_issues(self.label, self._summary(variant), self.limit)

    def _publish(
        self, *, campaign: Campaign, variant: Variant, image_path: Path | None, image_url: str | None
    ) -> PublishResult:
        account, location, token = self._ids()
        body: dict[str, object] = {
            "languageCode": setting(self.settings, "gbp_language_code", "en"),
            "summary": self._summary(variant),
            "topicType": "STANDARD",
        }
        if image_url and public_url_problem(image_url) is None:  # Google fetches the image itself
            body["media"] = [{"mediaFormat": "PHOTO", "sourceUrl": image_url}]
        if variant.link:
            body["callToAction"] = {"actionType": "LEARN_MORE", "url": variant.link}
        url = f"{GBP_BASE}/accounts/{account}/locations/{location}/localPosts"
        with self._http() as client:
            resp = client.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
        data = response_json(resp)
        if not resp.is_success:
            err = data.get("error") if isinstance(data, dict) else None
            msg = err.get("message") if isinstance(err, dict) else None
            hint = _HINTS.get(resp.status_code)
            raise ChannelError(
                f"API error {resp.status_code}" + (f": {msg}" if msg else ".") + (f" Hint: {hint}" if hint else "")
            )
        if not isinstance(data, dict):
            raise ChannelError("unexpected response from the API.")
        if data.get("state") == "REJECTED":
            raise ChannelError("Google rejected the post (content policy) — edit the text and try again.")
        return PublishResult(ok=True, external_url=data.get("searchUrl"), external_id=data.get("name"))

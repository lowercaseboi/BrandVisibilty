"""Cloudflare Workers AI image generation (FLUX.1 schnell by default; free daily quota).

`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}` with a Bearer API
token and JSON `{"prompt", "steps", "seed"}`. FLUX schnell answers
`{"success": true, "result": {"image": "<base64 JPEG>"}}` (1024×1024); some other Workers AI image
models (e.g. Stable Diffusion XL) answer with raw `image/png` bytes — both are handled. Models other
than FLUX schnell also get `width`/`height` near the target aspect ratio.
"""

from __future__ import annotations

import base64
import binascii

import httpx

from app.distribution.imagegen.base import (
    DEFAULT_TIMEOUT_S,
    ProviderError,
    ProviderUnavailable,
    describe_http_error,
    make_client,
)

API_BASE = "https://api.cloudflare.com/client/v4"
DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell"
SCHNELL_STEPS = 6  # schnell allows 1-8; 6 is a good quality/latency trade-off


def _model_dims(size: tuple[int, int], longest: int = 1024) -> tuple[int, int]:
    w, h = size
    scale = longest / max(w, h)
    return max(256, round(w * scale / 64) * 64), max(256, round(h * scale / 64) * 64)


class CloudflareProvider:
    name = "cloudflare"

    def __init__(
        self,
        account_id: str | None,
        api_token: str | None,
        model: str | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.account_id = account_id
        self.api_token = api_token
        self.model = model or DEFAULT_MODEL
        self.transport = transport
        self.timeout = timeout

    def generate(
        self,
        prompt: str,
        size: tuple[int, int],
        seed: int | None,
        *,
        brand_name: str = "",
        style: str | None = None,
    ) -> bytes:
        if not (self.account_id and self.api_token):
            raise ProviderUnavailable("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set")
        url = f"{API_BASE}/accounts/{self.account_id}/ai/run/{self.model}"
        body: dict = {"prompt": prompt[:2048], "steps": SCHNELL_STEPS}
        if seed is not None:
            body["seed"] = seed
        if "schnell" not in self.model:
            body["width"], body["height"] = _model_dims(size)
            body["num_steps"] = body.pop("steps")
        headers = {"Authorization": f"Bearer {self.api_token}"}
        try:
            with make_client(self.transport, self.timeout) as client:
                resp = client.post(url, json=body, headers=headers)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")
                if content_type.startswith("image/"):
                    if not resp.content:
                        raise ProviderError("cloudflare returned an empty image")
                    return resp.content
                payload = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ProviderError(f"cloudflare {describe_http_error(exc)}") from None
        except httpx.HTTPError as exc:
            raise ProviderError(f"cloudflare transport error: {type(exc).__name__}") from None
        except ValueError:
            raise ProviderError("cloudflare returned non-JSON") from None

        if payload.get("success") is False:
            errors = payload.get("errors") or []
            msg = "; ".join(str(e.get("message", e)) if isinstance(e, dict) else str(e) for e in errors)
            raise ProviderError(f"cloudflare error: {msg[:200] or 'unknown'}")
        result = payload.get("result")
        image = result.get("image") if isinstance(result, dict) else None
        if not isinstance(image, str) or not image:
            raise ProviderError("cloudflare returned no image")
        try:
            return base64.b64decode(image, validate=False)
        except (binascii.Error, ValueError):
            raise ProviderError("cloudflare image payload is not base64") from None

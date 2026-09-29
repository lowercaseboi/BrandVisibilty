"""Gemini image generation over the REST API (uses the existing GEMINI_API_KEY).

Two request shapes, picked from the configured model name:

* Gemini image models ("gemini-*-image*", the default): `POST
  https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with
  `generationConfig.responseModalities=["TEXT","IMAGE"]` and `imageConfig.aspectRatio`; the image
  comes back as a base64 `inlineData` part.
* Imagen models ("imagen-*"): `POST .../v1beta/models/{model}:predict` with
  `instances[0].prompt` and `parameters.aspectRatio`; the image is
  `predictions[0].bytesBase64Encoded`.

The key travels in the `x-goog-api-key` header (never in the URL, so it can't leak into logs).
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

API_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.1-flash-image-preview"

GEMINI_RATIOS = ("1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9")
IMAGEN_RATIOS = ("1:1", "3:4", "4:3", "9:16", "16:9")


def closest_ratio(size: tuple[int, int], allowed: tuple[str, ...]) -> str:
    target = size[0] / size[1]

    def distance(ratio: str) -> float:
        w, h = (int(x) for x in ratio.split(":"))
        return abs(w / h - target)

    return min(allowed, key=distance)


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        api_key: str | None,
        model: str | None = None,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.api_key = api_key
        self.model = (model or DEFAULT_MODEL).removeprefix("models/")
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
        if not self.api_key:
            raise ProviderUnavailable("GEMINI_API_KEY is not set")
        imagen = self.model.startswith("imagen")
        if imagen:
            url = f"{API_BASE}/models/{self.model}:predict"
            body: dict = {
                "instances": [{"prompt": prompt}],
                "parameters": {"sampleCount": 1, "aspectRatio": closest_ratio(size, IMAGEN_RATIOS)},
            }
        else:
            url = f"{API_BASE}/models/{self.model}:generateContent"
            config: dict = {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": {"aspectRatio": closest_ratio(size, GEMINI_RATIOS)},
            }
            if seed is not None:
                config["seed"] = seed
            body = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": config,
            }
        headers = {"x-goog-api-key": self.api_key, "Content-Type": "application/json"}
        try:
            with make_client(self.transport, self.timeout) as client:
                resp = client.post(url, json=body, headers=headers)
                resp.raise_for_status()
                payload = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ProviderError(f"gemini {describe_http_error(exc)}") from None
        except httpx.HTTPError as exc:
            raise ProviderError(f"gemini transport error: {type(exc).__name__}") from None
        except ValueError:
            raise ProviderError("gemini returned non-JSON") from None
        return _extract_predict(payload) if imagen else _extract_generate_content(payload)


def _decode(data: object) -> bytes:
    if not isinstance(data, str) or not data:
        raise ProviderError("gemini: empty image payload")
    try:
        return base64.b64decode(data, validate=False)
    except (binascii.Error, ValueError):
        raise ProviderError("gemini: image payload is not base64") from None


def _extract_generate_content(payload: dict) -> bytes:
    candidates = payload.get("candidates") or []
    for cand in candidates:
        for part in (cand.get("content") or {}).get("parts") or []:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and str(inline.get("mimeType") or inline.get("mime_type") or "image").startswith("image"):
                return _decode(inline.get("data"))
    reason = ""
    if candidates:
        reason = str(candidates[0].get("finishReason") or "")
    elif payload.get("promptFeedback"):
        reason = str(payload["promptFeedback"].get("blockReason") or "blocked")
    raise ProviderError(f"gemini returned no image{': ' + reason if reason else ''}")


def _extract_predict(payload: dict) -> bytes:
    for pred in payload.get("predictions") or []:
        if pred.get("bytesBase64Encoded"):
            return _decode(pred["bytesBase64Encoded"])
    raise ProviderError("imagen returned no image")

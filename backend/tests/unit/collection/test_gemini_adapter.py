"""GeminiAdapter request construction and the API-key-leak regression (DESIGN_v1 §1.3, PRD §12).

The key used to travel as a URL query parameter (`params={"key": ...}`), which meant it
appeared verbatim in `httpx.HTTPStatusError`'s message (built from the request URL) and
was printed to stdout on every retry during a real rate-limited run. It now travels as
the `x-goog-api-key` header. `test_api_key_never_appears_in_the_request_url` is a
permanent regression test for that incident.
"""

from __future__ import annotations

import json

import httpx

from app.collection.providers.gemini import GeminiAdapter
from app.collection.types import SamplingParams

MODEL = "gemini-3.6-flash"
SECRET_KEY = "AIzaSy-not-a-real-key-0123456789"


def _capturing_adapter():
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "ok"}]}, "finishReason": "STOP"}],
                "modelVersion": "gemini-3.6-flash-001",
            },
        )

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    adapter = GeminiAdapter(api_key=SECRET_KEY, model=MODEL, client=client)
    return adapter, captured


def test_api_key_never_appears_in_the_request_url():
    adapter, captured = _capturing_adapter()
    adapter.query("hi", SamplingParams())
    request = captured[0]
    assert SECRET_KEY not in str(request.url)
    assert "key" not in request.url.params
    assert request.headers.get("x-goog-api-key") == SECRET_KEY


def test_temperature_omitted_when_none():
    adapter, captured = _capturing_adapter()
    adapter.query("hi", SamplingParams(temperature=None))
    body = json.loads(captured[0].content)
    assert "generationConfig" not in body


def test_temperature_included_when_set():
    adapter, captured = _capturing_adapter()
    adapter.query("hi", SamplingParams(temperature=0.7))
    body = json.loads(captured[0].content)
    assert body["generationConfig"]["temperature"] == 0.7


def test_system_prompt_placed_under_system_instruction():
    adapter, captured = _capturing_adapter()
    adapter.query("hi", SamplingParams(system_prompt="be terse"))
    body = json.loads(captured[0].content)
    assert body["systemInstruction"]["parts"][0]["text"] == "be terse"


def test_no_model_default_requires_explicit_model():
    try:
        GeminiAdapter(api_key="k", model="")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for empty model")

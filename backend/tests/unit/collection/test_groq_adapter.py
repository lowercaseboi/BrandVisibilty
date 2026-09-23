"""GroqAdapter request construction and quota_state (DESIGN_v1 §1.3, §3.4)."""

from __future__ import annotations

import json

import httpx

from app.collection.providers.groq import GroqAdapter
from app.collection.types import SamplingParams

MODEL = "openai/gpt-oss-20b"


def _adapter_capturing(status=200, json_body=None, headers=None):
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(status, json=json_body, headers=headers or {})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    adapter = GroqAdapter(api_key="test-key", model=MODEL, client=client)
    return adapter, captured


def _ok_body(content="hello"):
    return {
        "model": "llama-3.3-70b-versatile",
        "choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3},
    }


def test_bearer_header_used_not_query_param():
    adapter, captured = _adapter_capturing(200, _ok_body())
    adapter.query("hi", SamplingParams())
    assert captured[0].headers["authorization"] == "Bearer test-key"
    assert "key" not in captured[0].url.params


def test_temperature_omitted_when_none():
    adapter, captured = _adapter_capturing(200, _ok_body())
    adapter.query("hi", SamplingParams(temperature=None))
    body = json.loads(captured[0].content)
    assert "temperature" not in body


def test_system_prompt_becomes_leading_message():
    adapter, captured = _adapter_capturing(200, _ok_body())
    adapter.query("hi", SamplingParams(system_prompt="be terse"))
    body = json.loads(captured[0].content)
    assert body["messages"][0] == {"role": "system", "content": "be terse"}
    assert body["messages"][1] == {"role": "user", "content": "hi"}


def test_no_tools_key_present():
    adapter, captured = _adapter_capturing(200, _ok_body())
    adapter.query("hi", SamplingParams())
    body = json.loads(captured[0].content)
    assert "tools" not in body


def test_healthy_response_parses_content_and_usage():
    adapter, _ = _adapter_capturing(200, _ok_body("hello there"))
    result = adapter.query("hi", SamplingParams())
    assert result.payload == "hello there"
    assert result.model_version == "llama-3.3-70b-versatile"
    assert result.token_usage == {"prompt_tokens": 5, "completion_tokens": 3}


def test_quota_state_reflects_last_seen_headers():
    adapter, _ = _adapter_capturing(
        200,
        _ok_body(),
        headers={
            "x-ratelimit-limit-requests": "1000",
            "x-ratelimit-remaining-requests": "997",
            "x-ratelimit-reset-requests": "2m59s",
        },
    )
    adapter.query("hi", SamplingParams())
    state = adapter.quota_state()
    assert state.remaining_today == 997
    assert state.daily_limit == 1000
    assert not state.exhausted


def test_quota_state_before_any_call_is_unknown():
    adapter, _ = _adapter_capturing(200, _ok_body())
    state = adapter.quota_state()
    assert state.remaining_today is None

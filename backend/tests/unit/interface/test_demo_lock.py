"""Demo lock: with ADMIN_TOKEN set, actions that spend API credit or destroy shared data need the
token, while browsing and practice (synthetic) runs stay open. The real app over a temp DATA_DIR."""

from __future__ import annotations

import importlib
import sys

import pytest
from fastapi.testclient import TestClient

TOKEN = "s3cret-admin"
PILOT = "gajanan_vada_pav"
_KEY_VARS = (
    "GEMINI_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY",
    "OLLAMA_BASE_URL", "CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL", "MISTRAL_API_KEY", "GITHUB_MODELS_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN",
)


def _client(tmp_path, monkeypatch, token: str) -> TestClient:
    from app import paths

    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    for var in _KEY_VARS:
        monkeypatch.setenv(var, "")
    monkeypatch.setenv("ADMIN_TOKEN", token)
    sys.modules.pop("app.interface.main", None)
    main = importlib.import_module("app.interface.main")
    return TestClient(main.app)


@pytest.fixture
def locked(tmp_path, monkeypatch):
    try:
        yield _client(tmp_path, monkeypatch, TOKEN)
    finally:
        sys.modules.pop("app.interface.main", None)


@pytest.fixture
def open_(tmp_path, monkeypatch):
    try:
        yield _client(tmp_path, monkeypatch, "")
    finally:
        sys.modules.pop("app.interface.main", None)


def test_health_reports_the_lock(locked: TestClient) -> None:
    assert locked.get("/health").json() == {"status": "ok", "admin_locked": True}


def test_practice_runs_stay_open_but_live_runs_need_the_token(locked: TestClient, monkeypatch) -> None:
    assert locked.post(f"/brands/{PILOT}/runs", json={"providers": "synthetic", "samples": 1}).status_code == 202
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    r = locked.post(f"/brands/{PILOT}/runs", json={"providers": "groq", "samples": 1})
    assert r.status_code == 401
    # "auto" resolves to the configured live providers, so it is gated too.
    assert locked.post(f"/brands/{PILOT}/runs", json={"providers": "auto", "samples": 1}).status_code == 401


def test_destructive_edits_need_the_token(locked: TestClient) -> None:
    assert locked.delete(f"/brands/{PILOT}").status_code == 401
    assert locked.delete(f"/brands/{PILOT}", headers={"X-Admin-Token": TOKEN}).status_code == 403  # sample brand
    q = locked.get(f"/brands/{PILOT}/questions").json()["questions"]
    body = {"questions": [{"text": x["text"], "intent_type": x["intent_type"]} for x in q]}
    assert locked.put(f"/brands/{PILOT}/questions", json=body).status_code == 401
    assert locked.delete(f"/brands/{PILOT}/questions").status_code == 401
    assert locked.delete(f"/brands/{PILOT}/questions", headers={"X-Admin-Token": TOKEN}).status_code == 200


def test_without_a_token_nothing_is_locked(open_: TestClient) -> None:
    assert open_.get("/health").json()["admin_locked"] is False
    assert open_.delete(f"/brands/{PILOT}/questions").status_code == 200


def test_usage_endpoint(locked: TestClient) -> None:
    r = locked.get("/providers/usage")
    assert r.status_code == 200 and r.json() == []

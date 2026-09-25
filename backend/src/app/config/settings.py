"""App settings via env vars / .env (SecretProvider indirection, DESIGN_v1 §1.1).

Never log or expose these values (CLAUDE.md / PRD §12).

Resolution order (highest precedence first): real environment variables (Docker,
shell exports), then repo-root `.env.local`, repo-root `.env`, `backend/.env.local`,
`backend/.env`. Paths are resolved from this file's location, so it works whether
the process is started from the repo root, from `backend/` or from anywhere else.
Missing files are silently skipped.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[3]  # .../backend
_REPO_ROOT = _BACKEND_DIR.parent


def _env_files() -> tuple[Path, ...]:
    # pydantic-settings loads these in order with *later* files overriding earlier ones,
    # so list lowest precedence first. Also check cwd-relative files for unusual layouts
    # (e.g. a Docker image that copies only backend/ somewhere else).
    candidates = [
        Path.cwd() / ".env",
        Path.cwd() / ".env.local",
        _BACKEND_DIR / ".env",
        _BACKEND_DIR / ".env.local",
        _REPO_ROOT / ".env",
        _REPO_ROOT / ".env.local",
    ]
    seen: list[Path] = []
    for path in candidates:
        if path not in seen:
            seen.append(path)
    return tuple(seen)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Google Gemini
    gemini_api_key: str | None = None
    # "gemini-2.x" models are retired for new API keys. "gemini-3.6-flash" works but its free
    # tier is only 20 requests/day/model — less than one run. "gemini-3.1-flash-lite" is GA
    # and has a separate, larger free-tier quota (checked live against /v1beta/models).
    gemini_model: str = "gemini-3.1-flash-lite"

    # OpenAI (or anything that speaks its chat-completions API via OPENAI_BASE_URL)
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    # Groq (OpenAI-compatible, fixed base URL)
    groq_api_key: str | None = None
    # llama-3.3-70b-versatile was retired by Groq; gpt-oss-120b is its general-chat replacement.
    groq_model: str = "openai/gpt-oss-120b"

    # OpenRouter (OpenAI-compatible, fixed base URL)
    openrouter_api_key: str | None = None
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"

    # Anthropic Claude (Messages API)
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-haiku-4-5-20251001"

    # Ollama (local; no key). Configured only when OLLAMA_BASE_URL is set explicitly.
    ollama_base_url: str | None = None
    ollama_model: str = "llama3.2"

    # Any other OpenAI-compatible endpoint (LM Studio, vLLM, Together, Azure proxy, ...)
    custom_llm_base_url: str | None = None
    custom_llm_api_key: str | None = None
    custom_llm_model: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _blank_means_unset(cls, data: object) -> object:
        # `.env.example` ships with `KEY=` lines; a blank value must mean "not configured"
        # (and fall back to the default model), not "configured with an empty string".
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if not (isinstance(v, str) and not v.strip())}
        return data


OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434"

settings = Settings()

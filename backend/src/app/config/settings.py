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
    # Groq's free tier for gpt-oss-120b is 30 req/min, 8K tokens/min, 200K tokens/day, and
    # gpt-oss's hidden reasoning tokens count too. A full answer is 200-3,000 tokens (measured:
    # median ~1,800). The old 1,024 cap cut ~90% of answers off mid-list, losing the places named
    # last, so the cap now only guards against runaways and the per-minute budget is met by
    # pacing instead: ~4 answers a minute, so a standard run takes ~15 minutes and the daily budget
    # covers about two. GROQ_REASONING_EFFORT applies to gpt-oss models only (low / medium /
    # high; blank = Groq's default, medium).
    groq_max_tokens: int = 4096
    groq_reasoning_effort: str | None = "low"
    groq_rpm: int = 30
    # Qwen on Groq ("qwen" provider): same GROQ_API_KEY, a second model family on its own per-model
    # quota. Opt-in (set QWEN_MODEL=qwen/qwen3.8-27b): Groq's free tier caps Qwen at 1,000 *output*
    # tokens per minute, about one answer a minute, so a standard run takes close to an hour.
    qwen_model: str | None = None

    # OpenRouter (OpenAI-compatible, fixed base URL)
    openrouter_api_key: str | None = None
    # The ":free" list changes often (llama-3.3-70b-instruct:free was withdrawn in 2026); check
    # https://openrouter.ai/models?q=:free. Free models: 20 requests/min, 50/day without credit.
    openrouter_model: str = "google/gemma-4-31b-it:free"

    # Mistral (OpenAI-compatible). Free "Experiment" plan, phone verification, ~1 request/second.
    mistral_api_key: str | None = None
    mistral_model: str = "mistral-small-latest"

    # GitHub Models (OpenAI-compatible; a GitHub personal access token with the models:read
    # scope). Free, rate-limited per model (gpt-4.1-mini: about 150 requests/day).
    github_models_token: str | None = None
    github_models_model: str = "openai/gpt-4.1-mini"

    # Cloudflare Workers AI text models ("cloudflare" provider) reuse CLOUDFLARE_ACCOUNT_ID +
    # CLOUDFLARE_API_TOKEN below (the image keys). Free: 10,000 neurons/day, roughly a few hundred answers.
    cloudflare_text_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"

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

    # --- Campaign Studio / distribution (PRD §11.5, AC-10) ---------------------------------
    # ADMIN_TOKEN gates approve / publish / delete (header X-Admin-Token). Unset → only the
    # sandbox / export / whatsapp channels (which send nothing externally) can be used.
    admin_token: str | None = None
    # Key material for encrypting per-brand platform tokens (Fernet key derived via HKDF) and
    # signing OAuth `state`. Any long random string; changing it makes stored tokens unreadable.
    secret_key: str | None = None
    # Public origin that serves /media/... (Render URL, or a cloudflared tunnel locally).
    # Instagram needs the image at a public URL; unset → IG publishing fails with a clear error.
    public_base_url: str | None = None
    # Image providers in fallback order; "template" is the offline renderer (always works).
    image_providers: str = "gemini,cloudflare,template"
    # Gemini image-capable model (uses GEMINI_API_KEY).
    gemini_image_model: str = "gemini-3.1-flash-image-preview"
    # Cloudflare Workers AI (FLUX schnell, free daily quota).
    cloudflare_account_id: str | None = None
    cloudflare_api_token: str | None = None
    cloudflare_image_model: str = "@cf/black-forest-labs/flux-1-schnell"
    # Meta: Facebook Page + Instagram Business (Graph API).
    meta_page_id: str | None = None
    meta_page_token: str | None = None
    ig_user_id: str | None = None
    meta_graph_version: str = "v25.0"  # see channels/meta.py DEFAULT_GRAPH_VERSION
    # X (user-context OAuth 1.0a). Free tier allows few posts/month; the adapter counts them.
    x_api_key: str | None = None
    x_api_secret: str | None = None
    x_access_token: str | None = None
    x_access_secret: str | None = None
    x_monthly_post_limit: int = 500
    # Google Business Profile (export-only until Google approves API access).
    gbp_account_id: str | None = None
    gbp_location_id: str | None = None
    gbp_access_token: str | None = None
    # LinkedIn (Posts API). Single-tenant .env fallback; per-brand accounts are connected in the UI.
    linkedin_author_urn: str | None = None  # urn:li:person:<id> or urn:li:organization:<id>
    linkedin_access_token: str | None = None
    linkedin_api_version: str = "202609"  # LinkedIn-Version header (YYYYMM; each lasts >= 1 year)
    # Ask LinkedIn for w_organization_social + r_organization_admin too (needs the Community
    # Management API product approved for the app); off → post as the member only.
    linkedin_organization_scopes: bool = False

    # --- Per-brand "Connect" buttons (OAuth apps; docs/CHANNEL_SETUP.md §Per-brand accounts) ---
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    x_client_id: str | None = None
    x_client_secret: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    # Public base URL of THIS backend, as the browser reaches it; redirect URIs are
    # f"{OAUTH_REDIRECT_BASE}/oauth/<channel>/callback". Behind docker nginx: http://host:8080/api.
    oauth_redirect_base: str | None = None
    # Where the OAuth callback sends the browser back to (the React app).
    frontend_base_url: str = "http://localhost:5173"
    # Campaign copy drafting: "auto" = first configured of gemini / groq, else template;
    # or force "gemini" | "groq" | "template".
    copy_provider: str = "auto"

    @model_validator(mode="before")
    @classmethod
    def _blank_means_unset(cls, data: object) -> object:
        # `.env.example` ships with `KEY=` lines; a blank value must mean "not configured"
        # (and fall back to the default model), not "configured with an empty string".
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if not (isinstance(v, str) and not v.strip())}
        return data


OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434"

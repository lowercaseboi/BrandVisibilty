"""HTTP API — `uvicorn app.interface.main:app` (docs/CONTRACT.md §7)."""

from __future__ import annotations

import contextlib
import hmac
import logging
import os
import re
from collections.abc import Iterator
from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from app.brands import registry as brands_registry
from app.collection import registry as provider_registry
from app.interface.jobs import JobManager, JobNotRunning, UnknownProvider
from app.interface.schemas import (
    AccountChoiceOut,
    AccountChooseRequest,
    AccountStatusOut,
    AccountTestResponse,
    BoardState,
    BrandDeleteResponse,
    BrandProfile,
    BrandSummary,
    CampaignDeleteResponse,
    CampaignOut,
    ChannelStatusOut,
    CreateBrandRequest,
    CreateCampaignRequest,
    CreateCampaignResponse,
    DeliverablePatch,
    HealthResponse,
    Job,
    ManualAccountRequest,
    OAuthStartRequest,
    OAuthStartResponse,
    ObservationsResponse,
    ProviderInfoOut,
    PreflightOut,
    PublishRequest,
    QuestionSet,
    RegenerateImageRequest,
    RunRequest,
    SaveQuestionsRequest,
    SkipRequest,
    Snapshot,
    TrendVerdict,
    UpdateBrandRequest,
    VariantPatch,
)
from app.interface.snapshots import (
    normalize_snapshot,
    trend_verdict,
    with_trend_verdict,
)
from app.tracking import store

DESCRIPTION = """
Measures how visible a brand is inside AI assistants (Gemini, GPT, Claude, Llama via Groq/OpenRouter,
local Ollama models, ...) and turns that into traceable, prioritised recommendations.

**How a run works**

1. A brand's setup (category, cities, audiences, competitors) is expanded into a frozen, content-hashed
   query set. Only the **unprompted** queries (the ones that don't name the brand) are used for scoring.
2. Each query is sent to every selected provider several times (sampling), with retry/backoff; a failing
   provider marks the run *partial* instead of killing it.
3. Brand and competitor mentions are detected deterministically, then a pure scorer computes
   **Coverage**, **Prominence**, **Share of Voice** and a 0-100 **composite score** with a bootstrap CI.
4. Deterministic gap detection finds where the brand is missing or outranked, and every
   recommendation is linked to the `gap_id` that justifies it.

**Bring your own model**: provider keys are read only from server env vars and are never returned by
this API. `synthetic` and `replay` providers let the platform run fully offline.

Typical flow: `GET /brands` → `POST /brands/{brand_key}/runs` → poll `GET /jobs/{job_id}` →
`GET /brands/{brand_key}/snapshots/latest`.
"""

TAGS = [
    {"name": "meta", "description": "Service health."},
    {"name": "providers", "description": "LLM providers available to this server (keys are never exposed)."},
    {"name": "brands", "description": "Pilot and user-created brands."},
    {
        "name": "questions",
        "description": "The questions each AI model is asked for a brand. Customers can review, disable and add "
        "questions; ones that name the brand are asked but not scored.",
    },
    {"name": "snapshots", "description": "Scored visibility snapshots, one per completed run."},
    {"name": "runs", "description": "Start a tracking run in the background and follow its progress."},
    {
        "name": "board",
        "description": "The recommendation board (PRD §11.4): which column each suggestion sits in "
        "(suggested, saved for later, in progress, done, rejected).",
    },
    {
        "name": "campaigns",
        "description": "Campaign Studio (PRD §11.5, AC-10): turn a recommendation into channel-ready copy and "
        "images, edit, approve, then publish or export. Approve / publish / delete need the `X-Admin-Token` "
        "header when the server sets ADMIN_TOKEN; without ADMIN_TOKEN only the sandbox, export and WhatsApp "
        "channels can be used. Every publish attempt, including refused ones, is logged.",
    },
    {
        "name": "accounts",
        "description": "Per-brand connected social accounts (Details → Connected accounts): OAuth Connect buttons "
        "with a manual-token fallback. Tokens are stored encrypted (SECRET_KEY) and never returned. Changing "
        "an account needs X-Admin-Token when ADMIN_TOKEN is set. A brand without its own account falls back "
        "to the server's .env credentials.",
    },
]

app = FastAPI(
    title="AI Visibility & Brand Intelligence API",
    version="0.1.0",
    description=DESCRIPTION,
    openapi_tags=TAGS,
)

# Always-allowed local dev origins (Vite dev server / docker-compose's nginx).
_LOCAL_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
]


def parse_cors_origins(raw: str | None) -> list[str]:
    """Parse `CORS_ORIGINS` ("https://a.com, https://b.com,,") into exact origins.

    Pure/deterministic: trims whitespace around each entry and drops empty ones
    (from blank input, stray commas, or a trailing comma). `None`/"" -> [].
    """
    if not raw:
        return []
    origins: list[str] = []
    for part in raw.split(","):
        origin = part.strip()
        if origin and origin not in origins:
            origins.append(origin)
    return origins


def parse_cors_origin_regex(raw: str | None) -> str | None:
    """Parse `CORS_ORIGIN_REGEX` (e.g. r"https://.*\\.vercel\\.app" for preview
    deploys) into the pattern CORSMiddleware expects, or None when unset/blank."""
    if raw is None:
        return None
    pattern = raw.strip()
    return pattern or None


app.add_middleware(
    CORSMiddleware,
    allow_origins=_LOCAL_CORS_ORIGINS + parse_cors_origins(os.environ.get("CORS_ORIGINS")),
    allow_origin_regex=parse_cors_origin_regex(os.environ.get("CORS_ORIGIN_REGEX")),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_fn():
    # Imported lazily: the pipeline pulls in providers/HTTP clients that the read-only
    # endpoints don't need.
    from app.pipeline.runner import run_pipeline

    return run_pipeline


jobs = JobManager(_run_fn)
jobs.recover_from_restart()  # mark any job left "queued"/"running" by a previous process as interrupted


# --------------------------------------------------------------------------- helpers


def _brand_summary(cfg: Any, data_keys: set[str]) -> BrandSummary:
    return BrandSummary(
        brand_key=cfg.brand_key,
        brand=cfg.params.brand,
        has_data=cfg.brand_key in data_keys,
        is_pilot=bool(cfg.is_pilot),
        question_count=_question_sets().get_questions(cfg)["scored_count"],
    )


def _normalized_snapshots(brand_key: str) -> list[dict[str, Any]]:
    """Light history (no raw observations are read) — see app.tracking.store."""
    return [normalize_snapshot(r) for r in store.load_snapshots(brand_key)]


def _warn_legacy_snapshot_layout() -> None:
    """One line at startup if any history still inlines raw observations (pre-split
    layout). Such data still works, just slower; the fix is a one-time command."""
    try:
        legacy = store.legacy_inline_brands()
    except OSError:
        return
    if legacy:
        logging.getLogger("app.tracking").warning(
            "Snapshot history for %s uses the old inline-observations layout; run "
            "`uv run python scripts/migrate_split_observations.py` (backend/) to split it.",
            ", ".join(legacy),
        )


_warn_legacy_snapshot_layout()


# --------------------------------------------------------------------------- meta


@app.get("/health", tags=["meta"], response_model=HealthResponse)
def health() -> dict[str, str]:
    return {"status": "ok"}


# --------------------------------------------------------------------------- providers


@app.get("/providers", tags=["providers"], response_model=list[ProviderInfoOut])
def list_providers() -> list[dict[str, Any]]:
    """Every supported provider, whether it is configured on this server, and the model it will use."""
    return [asdict(p) for p in provider_registry.available_providers()]


# --------------------------------------------------------------------------- brands


@app.get("/brands", tags=["brands"], response_model=list[BrandSummary])
def list_brands() -> list[BrandSummary]:
    """Pilot + user-created brands, plus any brand that only has stored (legacy) snapshots."""
    data_keys = store.brand_keys_with_data()
    summaries = [_brand_summary(cfg, data_keys) for cfg in brands_registry.list_brands()]
    known = {s.brand_key for s in summaries}
    for key in sorted(data_keys - known):
        records = store.load_snapshots(key)
        name = (records[-1].get("brand") if records else None) or key
        summaries.append(BrandSummary(brand_key=key, brand=name, has_data=True, is_pilot=False))
    return summaries


@app.post("/brands", tags=["brands"], response_model=BrandSummary, status_code=status.HTTP_201_CREATED)
def create_brand(body: CreateBrandRequest) -> BrandSummary:
    """Create a brand from its setup (PRD §13.2). Returns 422 with the reason if the spec is invalid."""
    try:
        cfg = brands_registry.create_brand(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _brand_summary(cfg, store.brand_keys_with_data())


@app.delete("/brands/{brand_key}", tags=["brands"], response_model=BrandDeleteResponse)
def delete_brand(brand_key: str) -> dict[str, Any]:
    """Delete a user-created brand and all its stored runs/snapshots (and any saved custom
    question list). The built-in sample brands can't be deleted (403)."""
    try:
        brands_registry.delete_brand(brand_key)
    except brands_registry.PilotBrandDeleteError as exc:
        raise HTTPException(status_code=403, detail=f"Sample brand '{exc}' cannot be deleted") from exc
    except KeyError:
        # Not a registered brand spec — fall back to a legacy data-only brand (PRD §9.2
        # note: stored snapshots with no surviving setup still count as "the user's data").
        if brand_key not in store.brand_keys_with_data():
            raise HTTPException(status_code=404, detail=f"Unknown brand '{brand_key}'") from None
        store.delete_brand_data(brand_key)
    return {"brand_key": brand_key, "deleted": True}


def _brand_profile(cfg: Any) -> dict[str, Any]:
    self_aliases = list(cfg.self_aliases)
    if self_aliases and self_aliases[0] == cfg.name:
        self_aliases = self_aliases[1:]  # the name itself isn't an "extra" alias
    return {
        "brand_key": cfg.brand_key,
        "brand": cfg.name,
        "is_pilot": bool(cfg.is_pilot),
        "category": cfg.params.category,
        "cities": list(cfg.params.cities),
        "competitors": list(cfg.params.competitors),
        "aliases": self_aliases,
        "audiences": list(cfg.params.audiences),
        "jobs_to_be_done": list(cfg.params.jobs_to_be_done),
    }


@app.get("/brands/{brand_key}", tags=["brands"], response_model=BrandProfile)
def get_brand_profile(brand_key: str) -> dict[str, Any]:
    """A brand's full saved setup (PRD §13.2): category, cities, competitors, aliases,
    audiences and jobs. Pilot brands return their built-in profile too. 404 for an unknown
    brand, including a "legacy" one that only has stored snapshots and no surviving setup."""
    return _brand_profile(_brand_or_404(brand_key))


@app.put("/brands/{brand_key}", tags=["brands"], response_model=BrandProfile)
def update_brand_profile(brand_key: str, body: UpdateBrandRequest) -> dict[str, Any]:
    """Edit a user-created brand's setup. Validated exactly like brand creation (422 with a
    plain-English reason if invalid). The sample (pilot) brands are read-only (403); an
    unknown brand 404s. `brand_key` never changes even if the display name does, so saved
    questions, snapshot history and the recommendation board all keep pointing at the same
    brand. Changing `competitors` or `aliases` starts a new trend baseline: the next run's
    comparability_key differs, so the trend chart won't silently mix pre- and post-edit
    scores (see `app.tracking.snapshot.comparability_key`)."""
    try:
        cfg = brands_registry.update_brand(brand_key, body.model_dump())
    except brands_registry.PilotBrandUpdateError as exc:
        raise HTTPException(status_code=403, detail=f"Sample brand '{exc}' cannot be edited") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown brand '{brand_key}'") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _brand_profile(cfg)


# --------------------------------------------------------------------------- questions


def _question_sets():
    # Imported lazily, like the pipeline: it pulls in the query generator and mention detector.
    from app.querysets import custom

    return custom


def _brand_or_404(brand_key: str) -> Any:
    try:
        return brands_registry.get_brand(brand_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown brand '{brand_key}'") from exc


@app.get("/brands/{brand_key}/questions", tags=["questions"], response_model=QuestionSet)
def get_questions(brand_key: str) -> dict[str, Any]:
    """The questions a run asks: the saved list, or the suggested template questions."""
    return _question_sets().get_questions(_brand_or_404(brand_key))


@app.put("/brands/{brand_key}/questions", tags=["questions"], response_model=QuestionSet)
def save_questions(brand_key: str, body: SaveQuestionsRequest) -> dict[str, Any]:
    """Replace the brand's question list. 422 with a plain-English reason if it is invalid.
    Changing the questions starts a new comparability baseline for the trend chart."""
    brand = _brand_or_404(brand_key)
    try:
        return _question_sets().save_questions(brand, [q.model_dump() for q in body.questions])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.delete("/brands/{brand_key}/questions", tags=["questions"], response_model=QuestionSet)
def reset_questions(brand_key: str) -> dict[str, Any]:
    """Go back to the suggested template questions."""
    return _question_sets().reset_questions(_brand_or_404(brand_key))


# --------------------------------------------------------------------------- snapshots


@app.get(
    "/brands/{brand_key}/snapshots/latest", tags=["snapshots"], response_model=Snapshot, response_model_exclude_unset=True
)
def latest_snapshot(brand_key: str) -> dict[str, Any]:
    """Most recent snapshot (without raw observations). 404 if the brand has no data yet."""
    snapshots = _normalized_snapshots(brand_key)
    if not snapshots:
        raise HTTPException(status_code=404, detail=f"No snapshots for brand '{brand_key}'")
    # `trend_verdict` (AC-8) is additive: the history's verdict as of this run.
    return with_trend_verdict(snapshots)[-1]


@app.get(
    "/brands/{brand_key}/snapshots", tags=["snapshots"], response_model=list[Snapshot], response_model_exclude_unset=True
)
def list_snapshots(brand_key: str) -> list[dict[str, Any]]:
    """All snapshots, oldest first, without raw observations (for trend charts). The newest one
    also carries `trend_verdict` (AC-8, see `GET /brands/{brand_key}/trend`)."""
    return with_trend_verdict(_normalized_snapshots(brand_key))


@app.get("/brands/{brand_key}/trend", tags=["snapshots"], response_model=TrendVerdict)
def get_trend(brand_key: str) -> dict[str, Any]:
    """Is the score really moving? (PRD §11.6 / AC-8.) Uses only the latest comparable segment:
    2–3 runs compare the last two by CI overlap; 4+ runs use a Theil–Sen slope whose bootstrap CI
    must exclude 0 before a direction is claimed. `insufficient_data` when there are < 2 runs."""
    return trend_verdict(_normalized_snapshots(brand_key))


@app.get(
    "/brands/{brand_key}/runs",
    tags=["snapshots"],
    include_in_schema=False,
    response_model=list[Snapshot],
    response_model_exclude_unset=True,
)
def list_runs_alias(brand_key: str) -> list[dict[str, Any]]:
    # Alias kept for frontend/src/api/client.ts `getRuns`.
    return with_trend_verdict(_normalized_snapshots(brand_key))


@app.get(
    "/brands/{brand_key}/snapshots/{run_id}/observations",
    tags=["snapshots"],
    response_model=ObservationsResponse,
    response_model_exclude_unset=True,
)
def snapshot_observations(brand_key: str, run_id: str) -> dict[str, Any]:
    """Raw provider responses and detected mentions for one run — the evidence behind every gap."""
    # Reads just this run's observations file (or a legacy line's inline copy; legacy
    # records are matched by their derived run_id too).
    record = store.get_snapshot(brand_key, run_id, include_raw=True)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No snapshot '{run_id}' for brand '{brand_key}'")
    snap = normalize_snapshot(record, include_raw=True)
    return {
        "brand_key": brand_key,
        "run_id": snap["run_id"],
        "entities": snap["entities"],
        "raw_observations": snap["raw_observations"],
    }


# --------------------------------------------------------------------------- runs / jobs


@app.post("/brands/{brand_key}/runs", tags=["runs"], response_model=Job, status_code=status.HTTP_202_ACCEPTED)
def start_run(brand_key: str, body: RunRequest | None = None) -> dict[str, Any]:
    """Queue a tracking run. Poll `GET /jobs/{job_id}` for progress; runs execute one at a time."""
    body = body or RunRequest()
    _brand_or_404(brand_key)
    try:
        provider_registry.resolve_provider_ids(body.providers)
    except ValueError as exc:
        # Registry messages name the missing env var, never its value.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return jobs.submit(brand_key, providers=body.providers, samples=body.samples, round=body.round)


@app.get("/jobs/{job_id}", tags=["runs"], response_model=Job)
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job '{job_id}'")
    return job


@app.post("/jobs/{job_id}/cancel", tags=["runs"], response_model=Job)
def cancel_job(job_id: str) -> dict[str, Any]:
    """Drop a queued job, or stop a running one at its next provider call (nothing is saved)."""
    job = jobs.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job '{job_id}'")
    if job["status"] in ("completed", "partial", "failed"):
        raise HTTPException(status_code=409, detail=f"Job already finished ({job['status']})")
    return job


@app.post("/jobs/{job_id}/skip", tags=["runs"], response_model=Job)
def skip_job(job_id: str, body: SkipRequest | None = None) -> dict[str, Any]:
    """Stop waiting on one AI provider (`provider_id`), or on all of them (`null`), and finish the
    run with the answers collected so far. A provider stuck on a rate limit is interrupted
    mid-wait. 409 unless the job is running (cancel a queued job instead); 422 if the job
    doesn't use that provider."""
    body = body or SkipRequest()
    try:
        job = jobs.skip(job_id, body.provider_id)
    except JobNotRunning as exc:
        hint = " — cancel it instead" if str(exc) == "queued" else ""
        raise HTTPException(status_code=409, detail=f"Job is not running ({exc}){hint}") from exc
    except UnknownProvider as exc:
        raise HTTPException(status_code=422, detail=f"This run does not use provider '{exc}'") from exc
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job '{job_id}'")
    return job


@app.get("/jobs", tags=["runs"], response_model=list[Job])
def list_jobs(brand_key: str | None = Query(default=None)) -> list[dict[str, Any]]:
    """Jobs submitted since the server started (in-memory), optionally filtered by brand."""
    return jobs.list(brand_key)


# --------------------------------------------------------------------------- recommendation board


def _board_store():
    # Imported lazily, like the pipeline/question-set modules: it binds `app.tracking.store`
    # by name at import time, so importing it only when needed keeps tests that fake out
    # `app.tracking.store` (rather than monkeypatching its attributes) from permanently
    # poisoning that binding for the rest of the test session.
    from app.tracking import board

    return board


def _brand_known(brand_key: str) -> bool:
    """True for a registered brand (pilot or user-created) or a legacy brand that only has
    stored snapshots — everything `GET /brands` would list."""
    try:
        brands_registry.get_brand(brand_key)
        return True
    except KeyError:
        return brand_key in store.brand_keys_with_data()


@app.get("/brands/{brand_key}/board", tags=["board"], response_model=BoardState)
def get_board(brand_key: str) -> dict[str, Any]:
    """The brand's recommendation board: which column each suggestion sits in. `cards` is
    `{}` when nothing has been saved yet. 404 for an unknown brand. Allowed for the sample
    (pilot) brands too — the board holds the user's own decisions, not the brand's config."""
    if not _brand_known(brand_key):
        raise HTTPException(status_code=404, detail=f"Unknown brand '{brand_key}'")
    return _board_store().load_board(brand_key)


@app.put("/brands/{brand_key}/board", tags=["board"], response_model=BoardState)
def save_board(brand_key: str, body: BoardState) -> dict[str, Any]:
    """Replace the brand's board (drag-and-drop moves, approve/reject/save-for-later).
    422 if the body's `brand_key` doesn't match the path, an unknown column, too many cards,
    or a too-long card key; 404 for an unknown brand."""
    if body.brand_key != brand_key:
        raise HTTPException(
            status_code=422, detail=f"Body brand_key {body.brand_key!r} does not match path {brand_key!r}"
        )
    if not _brand_known(brand_key):
        raise HTTPException(status_code=404, detail=f"Unknown brand '{brand_key}'")
    cards = {key: card.model_dump() for key, card in body.cards.items()}
    try:
        return _board_store().save_board(brand_key, cards)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# --------------------------------------------------------------------------- campaigns (Campaign Studio)


def _campaigns():
    # Lazy for the same reason as `_board_store`: the service imports the brand registry and the
    # tracking store/board inside its functions, and the image/channel packages only when used.
    from app.distribution import service

    return service


def _recover_campaigns() -> None:
    try:
        _campaigns().recover_stale_generating()
    except (OSError, ValueError):
        logging.getLogger("app.distribution").exception("Could not recover stale campaign jobs")


_recover_campaigns()


def _admin_token() -> str | None:
    from app.config.settings import Settings

    token = Settings().admin_token
    return token.strip() if token and token.strip() else None


ADMIN_HEADER_DOC = "Must equal the server's ADMIN_TOKEN (when one is set)"


def _check_admin(header: str | None) -> tuple[bool, str | None]:
    """(token_configured, actor). Raises 401 when a token is configured and the header is wrong."""
    token = _admin_token()
    if token is None:
        return False, "user"
    if header is None or not hmac.compare_digest(header.encode(), token.encode()):
        return True, None
    return True, "admin"


@contextlib.contextmanager
def _campaign_errors() -> Iterator[None]:
    service = _campaigns()
    from app.distribution.gate import GateError

    try:
        yield
    except service.CampaignBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except GateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except service.CampaignNotFound as exc:
        raise HTTPException(status_code=404, detail=f"Unknown campaign '{exc}'") from exc
    except service.RecommendationNotFound as exc:
        raise HTTPException(status_code=404, detail=f"No stored snapshot has recommendation '{exc}'") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown brand or item {exc}") from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _known_brand_or_404(brand_key: str) -> None:
    if not _brand_known(brand_key):
        raise HTTPException(status_code=404, detail=f"Unknown brand '{brand_key}'")


@app.get("/channels", tags=["campaigns"], response_model=list[ChannelStatusOut])
def list_channels() -> list[dict[str, Any]]:
    """Every channel adapter and whether it can publish now (connected), only export, or is disabled.
    Reads settings only — never calls a platform. Credentials are never returned."""
    return [asdict(s) for s in _campaigns().channel_statuses()]


@app.get("/brands/{brand_key}/channels", tags=["campaigns"], response_model=list[ChannelStatusOut])
def list_brand_channels(brand_key: str) -> list[dict[str, Any]]:
    """Like GET /channels, but with this brand's connected accounts (falling back to the server's
    .env credentials for channels the brand hasn't connected). Never calls a platform."""
    _known_brand_or_404(brand_key)
    return [asdict(s) for s in _campaigns().channel_statuses(brand_key)]


# --------------------------------------------------------------------------- connected accounts


def _accounts():
    from app.distribution import accounts

    return accounts


def _oauth():
    from app.distribution import oauth

    return oauth


def _require_admin(header: str | None) -> str:
    configured, actor = _check_admin(header)
    if configured and actor is None:
        raise HTTPException(status_code=401, detail="Missing or wrong X-Admin-Token")
    return actor or "user"


def _account_channel_or_404(channel: str, *, allow_whatsapp: bool = False) -> None:
    allowed = _accounts().STATUS_CHANNELS if allow_whatsapp else _accounts().ACCOUNT_CHANNELS
    if channel not in allowed:
        raise HTTPException(status_code=404, detail=f"No account to connect for channel '{channel}'")


@contextlib.contextmanager
def _account_errors() -> Iterator[None]:
    accounts, oauth = _accounts(), _oauth()
    try:
        yield
    except accounts.SecretKeyMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    except oauth.OAuthNotConfigured as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except accounts.AccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


def _account_audit(brand_key: str, actor: str, action: str, channel: str, **context: Any) -> None:
    _campaigns()._audit(brand_key, actor, action, f"account:{channel}", **context)


@app.get("/brands/{brand_key}/accounts", tags=["accounts"], response_model=list[AccountStatusOut])
def list_accounts(brand_key: str) -> list[dict[str, Any]]:
    """The brand's account on each channel (facebook_page, instagram, x, linkedin, google_business,
    whatsapp): state, how it's connected, whether the Connect button works, and the manual form's
    fields. Never returns a token."""
    _known_brand_or_404(brand_key)
    return [asdict(a) for a in _accounts().account_statuses(brand_key)]


@app.put("/brands/{brand_key}/accounts/{channel}", tags=["accounts"], response_model=AccountStatusOut)
def put_account(
    brand_key: str,
    channel: str,
    body: ManualAccountRequest,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Connect manually: all of the channel's `manual_fields` (422 names a missing/invalid field,
    never its value). Replaces any existing account for the channel. 503 without SECRET_KEY."""
    actor = _require_admin(x_admin_token)
    _known_brand_or_404(brand_key)
    _account_channel_or_404(channel)
    with _account_errors():
        _accounts().set_manual(brand_key, channel, body.fields)
    _account_audit(brand_key, actor, "account.connect", channel, method="manual")
    return asdict(_accounts().account_status(brand_key, channel))


@app.delete("/brands/{brand_key}/accounts/{channel}", tags=["accounts"], response_model=AccountStatusOut)
def delete_account(
    brand_key: str,
    channel: str,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Disconnect: forget the brand's stored credentials for the channel (the platform-side app
    authorisation stays until the user removes it there). Returns the new status."""
    actor = _require_admin(x_admin_token)
    _known_brand_or_404(brand_key)
    _account_channel_or_404(channel)
    with _account_errors():
        existed = _accounts().delete_account(brand_key, channel)
    if existed:
        _account_audit(brand_key, actor, "account.disconnect", channel)
    return asdict(_accounts().account_status(brand_key, channel))


@app.post("/brands/{brand_key}/accounts/{channel}/test", tags=["accounts"], response_model=AccountTestResponse)
def test_account(
    brand_key: str,
    channel: str,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """One cheap read-only call to the platform with the brand's effective credentials (e.g. the
    Page's name, the X user). Refreshes an expired token first when possible."""
    _require_admin(x_admin_token)
    _known_brand_or_404(brand_key)
    _account_channel_or_404(channel, allow_whatsapp=True)
    ok, detail = _oauth().test_account(brand_key, channel)
    return {"ok": ok, "detail": detail}


@app.post("/brands/{brand_key}/accounts/{channel}/oauth/start", tags=["accounts"], response_model=OAuthStartResponse)
def oauth_start(
    brand_key: str,
    channel: str,
    body: OAuthStartRequest | None = None,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Begin the Connect flow: send the browser to `authorize_url`. The platform comes back to
    GET /oauth/{channel}/callback, which redirects to the app. 409 when the platform's OAuth app
    isn't configured on the server, 503 without SECRET_KEY."""
    _require_admin(x_admin_token)
    _known_brand_or_404(brand_key)
    _account_channel_or_404(channel)
    with _account_errors():
        url = _oauth().start(brand_key, channel, body.return_to if body else None)
    return {"authorize_url": url}


@app.get(
    "/oauth/{channel}/callback",
    tags=["accounts"],
    response_class=RedirectResponse,
    status_code=302,
    responses={302: {"description": "Back to the app: ?connected= | ?connect_choose= | ?connect_error=&reason="}},
)
def oauth_callback(
    channel: str,
    code: str | None = Query(default=None, max_length=4096),
    state: str | None = Query(default=None, max_length=4096),
    error: str | None = Query(default=None, max_length=200),
) -> RedirectResponse:
    """Where the platform sends the browser after consent (no admin token — the signed, single-use
    `state` protects it). Redirects to FRONTEND_BASE_URL + return_to with `connected=<channel>`,
    `connect_choose=<channel>` (several Pages/orgs/locations: pick one) or
    `connect_error=<channel>&reason=<code>`; also `offer=instagram` when a connected Facebook Page
    has a linked Instagram account ready to choose. `#accounts` is added for the details page."""
    target = _oauth().handle_callback(channel, code=code, state=state, error=error)
    return RedirectResponse(target, status_code=302)


@app.get("/brands/{brand_key}/accounts/{channel}/choices", tags=["accounts"], response_model=list[AccountChoiceOut])
def account_choices(brand_key: str, channel: str) -> list[dict[str, str]]:
    """The options found by the last Connect (Pages, LinkedIn member/organisations, GBP locations,
    Instagram accounts) waiting for a pick; empty when none or expired (30 min)."""
    _known_brand_or_404(brand_key)
    _account_channel_or_404(channel)
    with _account_errors():
        return _accounts().pending_choices(brand_key, channel)


@app.post("/brands/{brand_key}/accounts/{channel}/choose", tags=["accounts"], response_model=AccountStatusOut)
def account_choose(
    brand_key: str,
    channel: str,
    body: AccountChooseRequest,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Connect the chosen option (404 when it isn't pending any more)."""
    actor = _require_admin(x_admin_token)
    _known_brand_or_404(brand_key)
    _account_channel_or_404(channel)
    with _account_errors():
        _accounts().choose(brand_key, channel, body.id)
    _account_audit(brand_key, actor, "account.connect", channel, method="oauth")
    return asdict(_accounts().account_status(brand_key, channel))


@app.get("/brands/{brand_key}/campaigns", tags=["campaigns"], response_model=list[CampaignOut])
def list_campaigns(brand_key: str) -> list[dict[str, Any]]:
    """The brand's campaigns, newest first."""
    _known_brand_or_404(brand_key)
    with _campaign_errors():
        return [asdict(c) for c in _campaigns().list_campaigns(brand_key)]


@app.post(
    "/brands/{brand_key}/campaigns",
    tags=["campaigns"],
    response_model=CreateCampaignResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_campaign(brand_key: str, body: CreateCampaignRequest) -> dict[str, Any]:
    """Start a campaign for a stored recommendation (it keeps the recommendation's gap_id, AC-7). The
    campaign comes back "generating" with its job (kind "campaign"): poll `GET /jobs/{job_id}`, then
    refetch the campaign. The recommendation's board card moves to "in progress"."""
    with _campaign_errors():
        campaign, job = _campaigns().create_campaign(brand_key, body.recommendation_id, jobs=jobs)
    return {"campaign": asdict(campaign), "job": job}


@app.get("/brands/{brand_key}/campaigns/{campaign_id}", tags=["campaigns"], response_model=CampaignOut)
def get_campaign(brand_key: str, campaign_id: str) -> dict[str, Any]:
    with _campaign_errors():
        return asdict(_campaigns().get_campaign(brand_key, campaign_id))


@app.patch("/brands/{brand_key}/campaigns/{campaign_id}/variants/{channel}", tags=["campaigns"], response_model=CampaignOut)
def patch_variant(brand_key: str, campaign_id: str, channel: str, body: VariantPatch) -> dict[str, Any]:
    """Edit one channel's copy (only the fields sent). Editing an approved campaign's content revokes
    the approval (status back to "ready"). 409 while the campaign is still generating."""
    patch = body.model_dump(exclude_unset=True)
    for key in ("text", "hashtags", "enabled"):  # null means "leave as is" for these
        if patch.get(key, 0) is None:
            patch.pop(key)
    with _campaign_errors():
        return asdict(_campaigns().edit_variant(brand_key, campaign_id, channel, patch))


@app.post("/brands/{brand_key}/campaigns/{campaign_id}/deliverables/{index}", tags=["campaigns"], response_model=CampaignOut)
def update_deliverable(brand_key: str, campaign_id: str, index: int, body: DeliverablePatch) -> dict[str, Any]:
    """Edit a deliverable's title/body (export-only content, so approval is not affected)."""
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    with _campaign_errors():
        return asdict(_campaigns().edit_deliverable(brand_key, campaign_id, index, patch))


@app.post("/brands/{brand_key}/campaigns/{campaign_id}/regenerate-image", tags=["campaigns"], response_model=CampaignOut)
def regenerate_image(brand_key: str, campaign_id: str, body: RegenerateImageRequest) -> dict[str, Any]:
    """Generate a new image for one format (synchronous, ~5-40s with a hosted model) and switch the
    channels using that format to it. Older images stay available. Revokes approval if it changes
    an approved variant."""
    with _campaign_errors():
        return asdict(
            _campaigns().regenerate_image(
                brand_key, campaign_id, format=body.format, prompt=body.prompt, style=body.style, seed=body.seed
            )
        )


@app.post("/brands/{brand_key}/campaigns/{campaign_id}/approve", tags=["campaigns"], response_model=CampaignOut)
def approve_campaign(
    brand_key: str,
    campaign_id: str,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Approve the campaign exactly as it is now: each enabled variant's content hash is recorded, and
    only that content can be published. Needs X-Admin-Token when ADMIN_TOKEN is set (401 otherwise)."""
    _configured, actor = _check_admin(x_admin_token)
    if actor is None:
        raise HTTPException(status_code=401, detail="Missing or wrong X-Admin-Token")
    with _campaign_errors():
        return asdict(_campaigns().approve(brand_key, campaign_id, actor=actor))


@app.post("/brands/{brand_key}/campaigns/{campaign_id}/publish", tags=["campaigns"], response_model=CampaignOut)
def publish_campaign(
    brand_key: str,
    campaign_id: str,
    body: PublishRequest,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Publish (or export) to the given channels. Each attempt is logged as an event, whatever the
    outcome (AC-10): "published" (the platform returned the post; `external_url` links to it),
    "exported" (nothing sent: export pack, WhatsApp share link, or a channel with no account at all —
    `note` says which), "failed" (the platform refused; "reconnect" when the token was rejected), or
    "blocked" (not approved, edited since approval, validation, missing admin token, or an account
    that is saved but can't post — e.g. expired, or Instagram without a public PUBLIC_BASE_URL).
    POST …/preflight shows what would happen without sending anything.

    With ADMIN_TOKEN set, X-Admin-Token is required (401). Without ADMIN_TOKEN only sandbox, export
    and whatsapp are allowed: other channels in the request are logged "blocked" and the rest is
    published (200); if no requested channel is allowed → 403 (the refused attempts are still logged).
    Campaign status counts only published/failed attempts since approval."""
    from app.distribution.gate import LOCAL_CHANNELS

    service = _campaigns()
    configured, actor = _check_admin(x_admin_token)
    channels = list(dict.fromkeys(body.channels))
    with _campaign_errors():
        if configured and actor is None:
            service.record_blocked(brand_key, campaign_id, channels, "Missing or wrong X-Admin-Token", actor="anonymous")
            raise HTTPException(status_code=401, detail="Missing or wrong X-Admin-Token")
        refused: dict[str, str] = {}
        if not configured:
            msg = "Set ADMIN_TOKEN to publish to real channels"
            refused = {c: msg for c in channels if c not in LOCAL_CHANNELS}
            if len(refused) == len(channels):  # nothing allowed at all → 403 (attempts still logged)
                service.record_blocked(brand_key, campaign_id, channels, msg, actor=actor or "user")
                raise HTTPException(status_code=403, detail=msg)
        # Mixed request: allowed channels go out, refused ones are logged "blocked" (200).
        return asdict(service.publish(brand_key, campaign_id, channels, actor=actor or "user", refused=refused))


@app.post("/brands/{brand_key}/campaigns/{campaign_id}/preflight", tags=["campaigns"], response_model=list[PreflightOut])
def preflight_campaign(brand_key: str, campaign_id: str, body: PublishRequest) -> list[dict[str, Any]]:
    """Dry run of POST …/publish: for each channel, whether it would post now (with the brand's
    account), only export (WhatsApp share link / export pack / no account) or be refused — and why.
    Contacts no platform, logs no event and changes nothing, so it needs no admin token. Without
    ADMIN_TOKEN on the server, real channels are reported "blocked" (publish would refuse them)."""
    from app.distribution.gate import LOCAL_CHANNELS

    with _campaign_errors():
        plans = _campaigns().preflight(brand_key, campaign_id, list(body.channels))
    if _admin_token() is None:
        for p in plans:
            if p["channel"] not in LOCAL_CHANNELS and p["action"] != "blocked":
                p["action"], p["detail"] = "blocked", "Set ADMIN_TOKEN on the server to publish to real channels"
    return plans


@app.get(
    "/brands/{brand_key}/campaigns/{campaign_id}/export.zip",
    tags=["campaigns"],
    response_class=Response,
    responses={200: {"content": {"application/zip": {}}, "description": "Images, copy per channel, deliverables, README"}},
)
def export_campaign(brand_key: str, campaign_id: str) -> Response:
    """Download the export pack (works in any status; sends nothing anywhere)."""
    with _campaign_errors():
        data = _campaigns().export_zip(brand_key, campaign_id)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{campaign_id}.zip"'},
    )


@app.delete("/brands/{brand_key}/campaigns/{campaign_id}", tags=["campaigns"], response_model=CampaignDeleteResponse)
def delete_campaign(
    brand_key: str,
    campaign_id: str,
    x_admin_token: str | None = Header(default=None, description=ADMIN_HEADER_DOC),
) -> dict[str, Any]:
    """Delete a campaign and its images (its audit-log entries stay). Needs X-Admin-Token when
    ADMIN_TOKEN is set."""
    _configured, actor = _check_admin(x_admin_token)
    if actor is None:
        raise HTTPException(status_code=401, detail="Missing or wrong X-Admin-Token")
    with _campaign_errors():
        if not _campaigns().delete_campaign(brand_key, campaign_id, actor=actor):
            raise HTTPException(status_code=404, detail=f"Unknown campaign '{campaign_id}'")
    return {"campaign_id": campaign_id, "deleted": True}


_MEDIA_DIR_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_MEDIA_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.(png|jpg|jpeg)$")
_MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}


@app.get(
    "/media/{campaign_id}/{filename}",
    tags=["campaigns"],
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}, "image/jpeg": {}}, "description": "A generated image"}},
)
def get_media(campaign_id: str, filename: str) -> FileResponse:
    """A generated campaign image (PNG, or its JPEG copy for Instagram). Public on purpose: Instagram
    fetches images from PUBLIC_BASE_URL/media/... Only plain file names inside the media root."""
    from app.distribution import store as campaign_store

    match = _MEDIA_FILE_RE.match(filename)
    if not _MEDIA_DIR_RE.match(campaign_id) or not match:
        raise HTTPException(status_code=404, detail="Not found")
    root = campaign_store.media_root().resolve()
    path = (root / campaign_id / filename).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type=_MEDIA_TYPES[match.group(1).lower()])

"""HTTP API — `uvicorn app.interface.main:app` (docs/CONTRACT.md §7)."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from app.brands import registry as brands_registry
from app.collection import registry as provider_registry
from app.interface.jobs import JobManager, JobNotRunning, UnknownProvider
from app.interface.schemas import (
    BrandSummary,
    CreateBrandRequest,
    HealthResponse,
    Job,
    ProviderInfoOut,
    QuestionSet,
    RunRequest,
    SaveQuestionsRequest,
    SkipRequest,
)
from app.interface.snapshots import normalize_snapshot
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
]

app = FastAPI(
    title="AI Visibility & Brand Intelligence API",
    version="0.1.0",
    description=DESCRIPTION,
    openapi_tags=TAGS,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ],
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


# --------------------------------------------------------------------------- helpers


def _brand_summary(cfg: Any, data_keys: set[str]) -> BrandSummary:
    return BrandSummary(
        brand_key=cfg.brand_key,
        brand=cfg.params.brand,
        has_data=cfg.brand_key in data_keys,
        is_pilot=bool(cfg.is_pilot),
        question_count=_question_sets().get_questions(cfg)["scored_count"],
    )


def _normalized_snapshots(brand_key: str, *, include_raw: bool = False) -> list[dict[str, Any]]:
    return [normalize_snapshot(r, include_raw=include_raw) for r in store.load_snapshots(brand_key)]


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


@app.get("/brands/{brand_key}/snapshots/latest", tags=["snapshots"])
def latest_snapshot(brand_key: str) -> dict[str, Any]:
    """Most recent snapshot (without raw observations). 404 if the brand has no data yet."""
    records = store.load_snapshots(brand_key)
    if not records:
        raise HTTPException(status_code=404, detail=f"No snapshots for brand '{brand_key}'")
    return normalize_snapshot(records[-1])


@app.get("/brands/{brand_key}/snapshots", tags=["snapshots"])
def list_snapshots(brand_key: str) -> list[dict[str, Any]]:
    """All snapshots, oldest first, without raw observations (for trend charts)."""
    return _normalized_snapshots(brand_key)


@app.get("/brands/{brand_key}/runs", tags=["snapshots"], include_in_schema=False)
def list_runs_alias(brand_key: str) -> list[dict[str, Any]]:
    # Alias kept for frontend/src/api/client.ts `getRuns`.
    return _normalized_snapshots(brand_key)


@app.get("/brands/{brand_key}/snapshots/{run_id}/observations", tags=["snapshots"])
def snapshot_observations(brand_key: str, run_id: str) -> dict[str, Any]:
    """Raw provider responses and detected mentions for one run — the evidence behind every gap."""
    record = store.get_snapshot(brand_key, run_id)
    if record is not None:
        snap = normalize_snapshot(record, include_raw=True)
    else:
        # Legacy records have a derived run_id the store doesn't know about.
        snap = next((s for s in _normalized_snapshots(brand_key, include_raw=True) if s["run_id"] == run_id), None)
    if snap is None:
        raise HTTPException(status_code=404, detail=f"No snapshot '{run_id}' for brand '{brand_key}'")
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

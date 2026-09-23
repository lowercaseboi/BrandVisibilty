"""Read-only tracking API (DESIGN_v1 §1.2 L0 Interface layer).

Serves tracking snapshots already computed and written to disk by
`scripts/run_tracking_loop.py` — no recomputation, no writes, no LLM calls.

Run locally (from `backend/`):
    uv run uvicorn app.interface.main:app --reload --app-dir src
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.interface.routes import brands, tracking

REPO_ROOT = Path(__file__).resolve().parents[3]


def create_app(tracking_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="AI Visibility Tracking API")
    app.state.tracking_root = tracking_root or (REPO_ROOT / settings.tracking_root)

    # Dev-only: Vite's dev server port isn't fixed/known, and this is a GET-only,
    # cookie-free API, so a wildcard origin with credentials off is safe. Tighten to an
    # explicit origin before any real deployment.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    app.include_router(brands.router)
    app.include_router(tracking.router)
    return app


app = create_app()

# AI Visibility & Brand Intelligence Platform

**Does ChatGPT, Gemini or Claude recommend your brand when a customer asks?** This platform measures it. It asks
LLMs the questions real customers ask, such as *"best vada pav in Mumbai"* or *"good opticians near Dadar"*, and
detects which brands the answers mention and in what position. From that it computes visibility scores with
confidence intervals, finds the specific gaps, and turns each gap into a traceable, prioritised recommendation.

Final-year B.E. project (AI & Data Science), built by a team of 4. The pilot brands are Gajanan Vada Pav,
V.A. Mayekar Opticians and a local perfume brand.

```
Brand config ──► Query set ──► LLM providers ──► Mention detection ──► Scorer ──► Gap detector ──► Recommendations
 (AC-1)          (frozen,      (any you have     (deterministic,       (pure,     (deterministic)    (each has a gap_id,
                 ~30 queries)   a key for)        alias-based)          + 95% CI)                     AC-7)
                                                                                      │
                                              JSONL tracking history ◄────────────────┘ ──► REST API ──► React dashboard
```

## What it does

- **Bring your own model.** Supports Gemini, OpenAI, Groq, OpenRouter, Anthropic Claude, Ollama, and any
  OpenAI-compatible endpoint. With `providers=auto`, every provider that has a key is queried. With no keys at all,
  the pipeline runs on a clearly labelled **synthetic** offline provider, so the demo always works.
- **Frozen query sets.** Templates generate up to 30 distinct queries per brand (no repeats). Up to 20 are unprompted: category
  discovery, problem-first, alternative-seeking, attribute-constrained, local and recommendation-seeking. Up to 10
  are prompted: identity, fit, cost and head-to-head. The query set is hashed so runs stay comparable over time.
- **Editable questions.** Customers can see exactly what the AIs are asked, switch suggested questions off and add
  their own. Questions that name the brand are asked and shown as evidence, but are not scored.
- **Metrics, computed over the unprompted subset only:**
  - **Coverage** is the share of answers that mention the brand.
  - **Prominence** is how early the brand appears when it is mentioned.
  - **Share of Voice** is the brand's share of all brand mentions, competitors included.
  - **Composite** = 0.4·Coverage + 0.3·Prominence + 0.3·SoV, with a **cluster-bootstrap 95% CI** that resamples
    queries, not individual calls.
- **Deterministic gap detection.** Gaps are typed as presence, prominence, competitive, source or representation.
  Every gap links back to the raw LLM answers that prove it.
- **Recommendations.** Priority is based on the counterfactual composite gain, with confidence and an effort label.
  Every recommendation carries a non-null `gap_id`, so none are untraceable.
- **Tracking history.** Every run appends a snapshot. The dashboard shows the score trend, the per-provider coverage,
  and an evidence view with the brand and competitor mentions highlighted.
- **Robust collection.** Retries with backoff (honouring `Retry-After`) handle 429, 5xx and timeouts. A failing
  provider marks the run `partial` instead of killing it.
  - A provider stuck on a rate limit is skipped automatically after 2 minutes without an answer.
  - While a run is going you can skip one AI, finish now with the answers collected so far, or cancel.

## Quick start

You need only Docker.

```bash
git clone https://github.com/lowercaseboi/BrandVisibilty.git && cd BrandVisibilty
cp .env.example .env.local     # optional: paste ANY one provider key
make up                        # = docker compose up --build -d
```

- UI: http://localhost:8080
- API docs (Swagger): http://localhost:8000/docs

The first start seeds synthetic demo data for the 3 pilot brands. Open a brand, click **Run analysis**, and watch
the job progress.

**[RUNNING.md](RUNNING.md)** has the full guide: provider keys, the `make` shortcuts, the terminal reports, local
development without Docker, and Windows/OneDrive notes.

## Stack

| Layer    | Tech |
|----------|------|
| Backend  | Python 3.11, FastAPI, pydantic-settings, httpx, managed with [uv](https://docs.astral.sh/uv/) |
| Frontend | React 19, Vite, TypeScript. Charts are inline SVG, with no UI kit. |
| Runtime  | Docker Compose (backend + nginx-served frontend), with a named volume for data |
| Planned  | PostgreSQL (ER model in DESIGN_v1), Celery + Redis orchestration |

## Repository layout

```
backend/
  src/app/
    querysets/        query templates, draft generation, freezing
    collection/       provider adapters (providers/), registry, retry/backoff
    analysis/         mention detector, scorer (pure), gap detector (deterministic)
    recommendation/   recommendation engine; optional LLM drafter (off by default)
    brands/           pilot brands + user-created brands (DATA_DIR/brands.json)
    pipeline/         run_pipeline(): shared by the CLI and the API
    tracking/         snapshot builder + JSONL store (DATA_DIR/tracking/)
    interface/        FastAPI app, in-memory job runner, response schemas
    config/           settings: env vars / .env.local, keys never logged
  scripts/            run_tracking_loop.py (CLI runs), report.py (terminal report)
  tests/              unit tests; tests/integration hits live Gemini only if a key is set
frontend/src/         pages (brands, dashboard, evidence, providers), components, API client
docs/CONTRACT.md      module / API / snapshot contract the backend and frontend share
docker-compose.yml, Makefile, .env.example
```

## Documentation

| Doc | What it covers |
|-----|----------------|
| [PRD_v3.md](PRD_v3.md) | Requirements, scope and acceptance criteria (the *what*) |
| [DESIGN_v1.md](DESIGN_v1.md) | Architecture, ER model and query/scoring methodology (the *how*) |
| [docs/CONTRACT.md](docs/CONTRACT.md) | Current module signatures, snapshot schema and HTTP API |
| [RUNNING.md](RUNNING.md) | How to run, configure providers and use the CLI |
| [frontend/README.md](frontend/README.md) | Frontend dev, checks and routes |

## Tests

```bash
make test        # = cd backend && uv run pytest -q
cd frontend && npm run build && npm run lint
```

`tests/integration/test_gemini_smoke.py` calls the real Gemini API. It is skipped unless you opt in with
`RUN_LIVE_TESTS=1 make test` and have `GEMINI_API_KEY` set. It can fail on Google-side 429/503 errors that have
nothing to do with the code.

## MVP status

**Built:** everything in *What it does* above, including the REST API, the dashboard, the CLI and Docker.

**Designed, not yet built** (see DESIGN_v1): PostgreSQL persistence, Celery/Redis orchestration (an in-process job
thread stands in for it for now), web-source collection, Dev.to distribution, an admin quota view, the AC-12 detector
validation study, and LLM drafting of recommendation prose.

## Security

Provider keys live only in `.env.local`, which is gitignored, or in real environment variables. They are sent only in
request headers, never in URLs. They are never logged or returned by the API, and the Providers page and
`make providers` show only whether a provider is configured. To contribute, copy `.env.example`. Never commit a
filled-in env file.

The API has **no authentication**. Anyone who can reach port 8000 can create brands, start runs and edit questions.
That is fine on localhost or a trusted network for the demo. Do not expose it publicly without adding auth.

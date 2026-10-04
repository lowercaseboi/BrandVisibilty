# AI Visibility & Brand Intelligence Platform

**Does ChatGPT, Gemini or Claude recommend your brand when a customer asks?** This platform measures it, finds the
specific reasons it doesn't, and turns each reason into a ready-to-publish social post or GBP update.

Final-year B.E. project (AI & Data Science), built by a team of 4. The pilot brands are Gajanan Vada Pav,
V.A. Mayekar Opticians and a local perfume brand.

```
Brand config ──► Query set ──► LLM providers ──► Mention detection ──► Scorer ──► Gap detector ──► Recommendations
 (AC-1)          (frozen,      (any you have     (deterministic,       (pure,     (deterministic)    (each has a gap_id,
                 ~30 queries)   a key for)        alias-based)          + 95% CI)                     AC-7)
                                                                                      │
                                              JSONL tracking history ◄────────────────┘
                                                          │
                                                          ▼
                                    REST API ──► React dashboard ──► Campaign Studio ──► approve ──► publish/export
```

## What it does

Open a brand and you land on its **hub**, four modules deep:

| Module | Answers |
|--------|---------|
| **Details** | Who is this brand — name, category, city, competitors, the questions it's tracked on — and its connected social accounts (Facebook Page, Instagram, X, LinkedIn, Google Business). |
| **Analysis** | *How visible am I?* Composite score (0–100) with a confidence interval, Coverage / Prominence / Share of Voice, per-provider breakdown, and a live evidence view — one real AI answer with brand and competitor names highlighted. |
| **Gaps & evidence** | *Why?* Every detected gap, each linked back to the raw answers that prove it. Three types fire today — presence, prominence and competitive. Source and representation detection is implemented and tested but needs the web/social collection layer, which isn't built (see *Known limitations*). |
| **Recommendation engine (board)** | *What should I do?* A kanban of prioritised suggestions, each traceable to a `gap_id` — drag a card to track it, or turn it into a campaign. |

From a recommendation, **Campaign Studio** drafts channel-specific copy and a generated image, you review and
**approve** it (locking its content hash), then **publish** — to Meta (Facebook Page + Instagram), X, a Google
Business Profile export, a WhatsApp share link, or a local sandbox — or just export a zip of the assets and copy.
Every attempt is logged, published or blocked, so nothing external ever happens silently.

Other things worth knowing:
- **English, हिंदी and मराठी**, with light and dark themes. Shop names can be written in any script.
- **Bring your own model.** Gemini, OpenAI, Groq, OpenRouter, Anthropic Claude, Ollama, or any OpenAI-compatible
  endpoint. `providers=auto` queries every provider that has a key. No keys at all → the pipeline runs on a clearly
  labelled **synthetic** offline provider, so the demo always works.
- **Frozen query sets.** Templates generate up to 30 distinct queries per brand. Up to 20 are unprompted (category
  discovery, problem-first, alternative-seeking, attribute-constrained, local, recommendation-seeking); up to 10 are
  prompted (identity, fit, cost, head-to-head). The set is hashed so runs stay comparable over time. Customers can
  view, edit, disable or add questions.
- **Metrics, computed over the unprompted subset only** (PRD §10.1): Coverage (share of answers mentioning the
  brand), Prominence (how early it appears when mentioned), Share of Voice (its share of all brand mentions), and
  Composite = 0.4·Coverage + 0.3·Prominence + 0.3·SoV with a cluster-bootstrap 95% CI that resamples queries, not
  individual calls.
- **Recommendations** are prioritised by counterfactual composite-score gain, with a confidence estimate and an
  effort label, and validated before they ever reach the board (an unknown action, a class mismatch, or a missing
  `gap_id` is rejected — AC-7).
- **Claim-checked copy.** Before a campaign can be approved, its copy is checked for numbers, prices, dates and
  superlatives that aren't backed by the brand's own profile. Unsupported claims are surfaced for review rather
  than published silently.
- **Trend statistics, not a wiggle.** A trend verdict is computed only inside a constant comparability key — the
  same questions, sampling config, model versions *and* tracked alias table. Two or three runs are compared by
  confidence-interval overlap ("change detected" only when the intervals don't overlap); four or more use a
  Theil–Sen slope with a bootstrap CI, and a direction is claimed only when that CI excludes zero. Otherwise the
  honest answer is "no clear trend".
- **Tracking history.** Every run appends a snapshot; raw provider answers are stored separately from the light
  snapshot line (`docs/CONTRACT.md`). The dashboard shows the score trend and a per-run evidence view.
- **A guard test, not a convention.** The purity rule the analysis layer depends on — Scorer, GapDetector,
  MentionDetector, Trend and the validation metrics are pure functions with no I/O and no LLM calls — is enforced
  by an AST test that walks every module in `app/analysis/` and fails on any non-stdlib import or I/O call. It ships
  with a deliberately-impure fixture so the checker itself is proven to catch violations.
- **Detector validation (AC-12 tooling).** Deterministic is not the same as accurate, so the mention detector is
  measured rather than trusted: `scripts/validate_detector.py` exports a blind labelling sheet for two independent
  annotators and scores it into precision/recall/F1 plus Cohen's kappa (see [docs/DETECTOR_VALIDATION.md](docs/DETECTOR_VALIDATION.md)).
- **Robust collection.** Retries with backoff (honouring `Retry-After`) handle 429s, 5xx and timeouts. A provider
  stuck on a rate limit is skipped after 2 minutes without an answer; a failing provider marks the run `partial`
  instead of killing it. While a run is going you can skip one AI, finish early with the answers collected so far,
  or cancel.

## Architecture

```
backend/src/app/
  querysets/        query templates, draft generation, freezing
  collection/       LLM provider adapters (providers/) + retry/backoff; sources/ is an empty stub (no web/social
                     collection yet — see Known limitations)
  analysis/         mention detector, scorer (pure function, no I/O — DESIGN §1.6/§4), gap detector (deterministic)
  recommendation/   engine (counterfactual priority + validation gate) + an optional LLM drafter for prose only
                     (gap detection stays deterministic — DESIGN §5.1)
  pipeline/         run_pipeline(): shared by the CLI and the API
  tracking/         snapshot builder + JSONL store (DATA_DIR/tracking/), board state
  brands/           pilot brands + user-created brands (DATA_DIR/brands.json)
  distribution/     Campaign Studio: copywriter (+ claim check), imagegen/ (Pillow/qrcode, offline-first with
                     Gemini/Cloudflare image providers), channels/ (Meta, X, Google Business Profile, local sandbox)
  interface/        FastAPI app, single-worker job runner (state persisted to disk), response schemas
  config/           settings: env vars / .env.local, keys never logged
  paths.py          leaf module owning DATA_DIR, so no layer has to reach through the store to find it
  db/, orchestration/, models/   PostgreSQL + Celery/Redis scaffolding for a planned v2 (see Known limitations)
frontend/src/
  pages/brand/       the hub + its four modules (DetailsModule, AnalysisModule, GapsModule, BoardModule) and
                       CampaignStudio
  components/        accounts, board, brandinfo, campaign, dashboard, evidence, hub, landing, module, questions
  styles/            tokens.css (the design system: OKLCH palettes, WCAG-checked, light/dark/system themes),
                     primitives.css, then one stylesheet per surface
  settings/          theme + reduced-motion providers
  i18n/              en / hi / mr, checked for missing keys by `npm run lint`
docs/CONTRACT.md      module / API / snapshot contract the backend and frontend share
docs/CHANNEL_SETUP.md how to connect Meta, X and Google Business Profile to Campaign Studio
docs/DETECTOR_VALIDATION.md   AC-12 tooling: export a blind labelling sheet, compute precision/recall/Cohen's kappa
```

| Doc | What it covers |
|-----|----------------|
| [PRD_v3.md](PRD_v3.md) | Requirements, scope and acceptance criteria (the *what*) |
| [DESIGN_v1.md](DESIGN_v1.md) | Architecture, ER model and query/scoring methodology (the *how*) |
| [docs/CONTRACT.md](docs/CONTRACT.md) | Current module signatures, snapshot schema and HTTP API |
| [docs/CHANNEL_SETUP.md](docs/CHANNEL_SETUP.md) | Connecting Campaign Studio to Meta, X and Google Business Profile |
| [docs/DETECTOR_VALIDATION.md](docs/DETECTOR_VALIDATION.md) | AC-12: labelling the mention detector against human judgement |
| [RUNNING.md](RUNNING.md) | Full run guide: provider keys, `make` shortcuts, terminal reports, local dev, storage migration |
| [DEPLOY.md](DEPLOY.md) | Hosting a live demo (Render + Vercel) |
| [frontend/README.md](frontend/README.md) | Frontend dev, checks and routes |

## Quick start

**Docker (recommended) — you only need Docker:**

```bash
git clone https://github.com/lowercaseboi/BrandVisibilty.git && cd BrandVisibilty
cp .env.example .env.local     # optional: paste ANY one provider key
make up                        # = docker compose up --build -d
```

- UI: http://localhost:8080 — API docs (Swagger): http://localhost:8000/docs

The first start seeds synthetic demo data for the 3 pilot brands and, if it finds a pre-split snapshot history from
an older image, upgrades it automatically (`scripts/migrate_split_observations.py`, safe to run repeatedly). Open a
brand, click **Run analysis**, and watch the job progress. The backend container runs as a non-root user.

**Local, without Docker** (needs [uv](https://docs.astral.sh/uv/) and Node 22):

```bash
cd backend && uv sync && uv run python scripts/run_tracking_loop.py --brand all --providers synthetic
make dev-backend      # terminal 1 → API on :8000
make dev-frontend     # terminal 2 → UI on http://localhost:5173
```

**[RUNNING.md](RUNNING.md)** has the full guide, including every `make` shortcut, terminal reports, and
Windows/OneDrive notes.

## Configuration

Everything below goes in `.env.local` at the repo root (copy `.env.example`; it's git-ignored, so a filled-in copy
never gets committed). Leave everything blank to run fully offline on synthetic data.

| Group | Variables | Notes |
|-------|-----------|-------|
| **LLM providers** | `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, `CUSTOM_LLM_BASE_URL`/`CUSTOM_LLM_API_KEY`/`CUSTOM_LLM_MODEL` | Any one enables `providers=auto`; see the table in [RUNNING.md](RUNNING.md#bring-your-own-model). |
| **Image generation** | `IMAGE_PROVIDERS` (default `gemini,cloudflare,template`), `GEMINI_IMAGE_MODEL`, `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` | `template` (offline, Pillow-rendered) always works and is the final fallback. |
| **Channels** | `META_PAGE_ID`/`META_PAGE_TOKEN`/`IG_USER_ID`, `X_API_KEY`/`X_API_SECRET`/`X_ACCESS_TOKEN`/`X_ACCESS_SECRET`, `GBP_ACCOUNT_ID`/`GBP_LOCATION_ID`/`GBP_ACCESS_TOKEN`, `COPY_PROVIDER` | Unconfigured channels still work as **export-only**. Full setup: [docs/CHANNEL_SETUP.md](docs/CHANNEL_SETUP.md). |
| **Campaign Studio gate** | `ADMIN_TOKEN`, `SECRET_KEY`, `PUBLIC_BASE_URL` | `ADMIN_TOKEN` gates approve/publish/delete (header `X-Admin-Token`); unset → only sandbox/export/WhatsApp work. `SECRET_KEY` encrypts stored platform tokens. `PUBLIC_BASE_URL` is the public origin serving `/media/...` — behind this repo's `docker-compose.yml`, that's `http://<host>:8080/api`. |
| **Storage** | `DATA_DIR` (default `backend/data` locally, `/data` in Docker) | See *Storage & migration* below. |
| **CORS** (deployed only) | `CORS_ORIGINS`, `CORS_ORIGIN_REGEX` | Not needed for localhost; see [DEPLOY.md](DEPLOY.md). |

## Storage & migration

Each run appends a light snapshot line to `DATA_DIR/tracking/<brand_key>.jsonl` (scores, gaps, recommendations,
counts); the run's raw provider answers live separately, one file per run, at
`DATA_DIR/tracking/<brand_key>/<run_id>.observations.jsonl`. Docker's entrypoint runs
`scripts/migrate_split_observations.py` on every start to upgrade any older, pre-split history — it's idempotent and
a no-op once a volume is current, so it never slows down or blocks a normal boot. Outside Docker, or to preview the
change first, see the manual commands in [RUNNING.md](RUNNING.md#upgrading-old-snapshot-history-one-time).

## Tests

```bash
make test                          # backend: cd backend && uv run pytest -q
cd backend && uv run pytest --cov=app.recommendation   # engine coverage
cd frontend && npx tsc -b && npm run lint && npx vitest run && npx vite build
```

`backend/tests/integration/test_gemini_smoke.py` calls the real Gemini API and is skipped unless you opt in with
`RUN_LIVE_TESTS=1 make test` with `GEMINI_API_KEY` set. `npm run lint` also checks for missing hi/mr translation
keys against the English source (`frontend/scripts/check-i18n.mjs`).

## Acceptance criteria status

Read against [PRD_v3.md §16](PRD_v3.md#16-acceptance-criteria).

| AC | Requirement | Status |
|----|-------------|--------|
| AC-1 | Brand analysis input | **Met** — validated create/update, clear errors on invalid/empty input. |
| AC-2 | Multi-source data collection | **Partial** — every LLM provider stores its response with provider, model, timestamp and query context; `collection/sources/` (web/social) is an empty stub, not implemented. |
| AC-3 | Sampled collection | **Met** — Coverage etc. computed as a rate over the unprompted subset only; the prompted subset (brand-naming questions) is stored and shown as evidence but never scored. |
| AC-4 | Raw observation storage | **Met** — observations are stored per run, separate from the derived snapshot, and retrievable via `GET /brands/{key}/snapshots/{run_id}/observations`. |
| AC-5 | Visibility scoring | **Met** — composite per §10.6, pure function, CI and component breakdown always returned, traceable to mention-level evidence. |
| AC-6 | Gap identification | **Met for the types that can fire** — deterministic detector, all five types implemented and tested, each with supporting evidence. Presence, prominence and competitive run in production; source and representation depend on the unbuilt web/social layer (AC-2). |
| AC-7 | Recommendation reasoning | **Met** — every recommendation carries a non-null `gap_id`; the validation gate rejects an unknown action, a class mismatch or a missing `gap_id`; priority is a counterfactual score-impact simulation. |
| AC-8 | Visibility tracking | **Partial** — runs on demand (UI/API/CLI) with a cluster-bootstrap/Theil–Sen trend verdict; there is no scheduler, so "runs on schedule" is not implemented. |
| AC-9 | Failure handling | **Met** — retry with backoff honouring `Retry-After`, per-provider skip after repeated failures or a stalled rate limit, run saved `partial`, failures visible in job status and logs. |
| AC-10 | Distribution approval gate | **Met (adapted channel set)** — publish/approve is gated by `ADMIN_TOKEN`, every attempt is logged whatever the outcome (published/exported/failed/blocked). The v1 channel is Meta + X + a Google Business Profile export + WhatsApp-share + a local sandbox, in place of the PRD's Dev.to. |
| AC-11 | Cost/quota visibility | **Pending** — `GET /providers` and `GET /channels` show configured vs. not; there's no admin view of per-provider usage or remaining quota/credit. |
| AC-12 | Detector reliability | **Partial** — the full tooling exists and is tested (`docs/DETECTOR_VALIDATION.md`: blind-labelling export/import, precision/recall/F1, Cohen's kappa with Landis–Koch bands, two-annotator consensus with adjudication routing), but no real human-labelled round has been run yet, so no numbers are published. |

## Known limitations

- **PostgreSQL + Celery/Redis are scaffolding, not wired in.** `db/`, `orchestration/`, `models/` and the
  corresponding dependencies (`sqlalchemy`, `alembic`, `psycopg`, `celery`, `redis`) exist for the ER model in
  DESIGN_v1 but the app runs entirely on JSONL files and an in-process job thread today.
- **One backend worker only.** Analysis and campaign jobs live in an in-process queue; running more than one
  uvicorn worker would give each its own queue and job table (see [DEPLOY.md](DEPLOY.md#run-exactly-one-backend-worker)).
- **No authentication** beyond `ADMIN_TOKEN` gating Campaign Studio's write actions. Anyone who can reach the API
  can create brands, start runs and edit questions — fine on localhost or a trusted network, not for a public
  deployment without adding auth in front of it.
- **No scheduled runs, no web/social source collection, no admin quota view** — see the AC table above.
- **AC-12 needs a real labelling round** before its precision/recall/kappa numbers mean anything.
- Instagram publishing needs `PUBLIC_BASE_URL` to be reachable *from Meta's servers*, not just from your machine —
  see the note in `docker-compose.yml` and [docs/CHANNEL_SETUP.md](docs/CHANNEL_SETUP.md).

## Security

Provider keys and channel credentials live only in `.env.local` (git-ignored) or real environment variables. They
are sent only in request headers, never in URLs, and are never logged or returned by the API — the Providers page,
`GET /channels` and `make providers` show only whether something is configured. To contribute, copy `.env.example`.
Never commit a filled-in env file; if a key does leak, revoke it at the provider immediately.

The API itself has no authentication; `ADMIN_TOKEN` only gates Campaign Studio's approve/publish/delete actions.
That's fine on localhost or a trusted network for the demo — do not expose it publicly without adding auth in
front of it.

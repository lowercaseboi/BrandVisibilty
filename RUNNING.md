# Running the platform

For an overview of what the project does, see [README.md](README.md).

## Option 1: Docker (recommended on any PC)

You only need Docker. Python, Node, uv and an IDE aren't required.

```bash
git clone https://github.com/lowercaseboi/BrandVisibilty.git && cd BrandVisibilty
cp .env.example .env.local        # optional: add ANY one provider key (see below)
make up                           # same as: docker compose up --build -d
```

Then open:
- UI: **http://localhost:8080**
- API docs (Swagger): **http://localhost:8000/docs**

On the first start, the backend seeds **synthetic offline demo data** for the 3 pilot brands, 3 rounds each, so the
dashboard is never empty. The UI labels this data as synthetic. Real runs appear alongside it. To skip seeding,
start with `SEED_DEMO=0 make up`. This has to be a shell variable; setting it in `.env.local` has no effect.

### Repo inside OneDrive (Windows)
OneDrive turns synced files into cloud placeholders, and `docker compose build` fails on them with
`invalid file request <path>`. Either clone outside OneDrive (e.g. `C:\dev`), or mirror to a local folder and
build from there (PowerShell, from the repo root; re-run after every code change):
```powershell
robocopy . "$env:USERPROFILE\brandlens-build" /MIR /XD node_modules .venv dist .git __pycache__ /XF *.pyc
docker compose --project-directory "$env:USERPROFILE\brandlens-build" up --build -d
```

### Bring your own model
Put any key you have in `.env.local`. That file is gitignored, so it never gets committed. Then restart with `make up`.

| Provider            | Variables                                                 |
|---------------------|-----------------------------------------------------------|
| Google Gemini       | `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default `gemini-3.1-flash-lite`) |
| OpenAI              | `OPENAI_API_KEY` (optional `OPENAI_MODEL`, `OPENAI_BASE_URL`) |
| Groq                | `GROQ_API_KEY` (optional `GROQ_MODEL`, default `openai/gpt-oss-120b`) |
| OpenRouter          | `OPENROUTER_API_KEY` (optional `OPENROUTER_MODEL`, default `meta-llama/llama-3.3-70b-instruct:free`) |
| Anthropic Claude    | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, default `claude-haiku-4-5-20251001`) |
| Ollama (local)      | `OLLAMA_BASE_URL=http://host.docker.internal:11434`, `OLLAMA_MODEL` |
| Any OpenAI-compatible endpoint | `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_LLM_MODEL` |

With `providers=auto` (the default), the pipeline queries **every** configured provider. With no keys, it falls back to
synthetic data. `make providers` shows what's configured; keys are never printed.

Free tiers rate-limit quickly. Calls that hit 429, 5xx or a timeout are retried with backoff, honouring `Retry-After`.
A provider that fails 3 calls in a row is skipped for the rest of the run, and the run is saved as `partial`.
Never commit a filled-in env file. If a key does leak, revoke it at the provider.

### Run the pipeline and view results from the terminal
```bash
make run                                              # all brands, auto providers
make run BRAND=gajanan_vada_pav PROVIDERS=gemini SAMPLES=3
make run BRAND=gajanan_vada_pav ARGS=--record         # also saves responses for offline replay

make report BRAND=gajanan_vada_pav                    # metrics + CI, gaps, recommendations
make evidence BRAND=gajanan_vada_pav                  # raw answers with mentions highlighted
make history BRAND=gajanan_vada_pav                   # score trend across runs
make report                                           # one line per brand
```
You can also start a run from the UI (brand page → **Run analysis**, with a **Cancel** button while it runs) or through
the API (`POST /brands/{key}/runs`, then `GET /jobs/{id}` or `POST /jobs/{id}/cancel`). A cancelled run saves nothing.

While a run is going, the Run panel shows one row per AI with its own progress and state (running, **waiting 40s —
rate limited**, skipped, done). If one AI is stuck on a rate limit, press **Skip** on its row: the run finishes with the
other AIs and is saved as `partial`. **Finish now with answers so far** skips every AI and scores what was already
collected. An AI with no successful answer for 2 minutes is skipped automatically. API: `POST /jobs/{id}/skip` with
`{"provider_id": "groq"}` or `{"provider_id": null}`.

### How a run works (and what "0/60" means)
A run asks each selected AI every **scored question** a few times, then scores the answers.
The counter in the Run panel counts API calls: **questions × answers per question × providers**. With 20 questions (the pilots have 17–18),
Standard depth (3) and one provider, that is 60 calls.

- **Depth: Quick (1), Standard (3) or Thorough (5).** An LLM gives a slightly different answer each time it is asked.
  Asking each question several times gives a steadier score and a narrower confidence range, at the cost of more
  API calls. Use Quick on tight free-tier quotas.
- **Round** only exists for the offline synthetic provider, where each run simulates a later week to build a demo
  trend. It is picked automatically now; `--round` on the CLI still overrides it.

### Choosing the questions
Open a brand, then **View / edit questions** (`/brands/<key>/questions`). You can:
- see exactly what the AIs are asked;
- switch suggested questions off, or fix awkward or duplicate ones;
- add your own, such as "best vada pav near Dadar station".

A question that contains the brand's own name (or an alias) is still asked and shown in Evidence, but it is **not
scored**, because a mention is guaranteed. Saving a changed list starts a new baseline on the trend chart. **Reset to
suggested questions** returns to the original set and its baseline. The API is `GET/PUT/DELETE /brands/{key}/questions`.

### Switching PCs / pulling a teammate's changes
```bash
git pull && make up      # rebuilds images with the new code; your .env.local stays local
```
Each PC keeps its own snapshot history in its Docker volume. To share real runs, commit nothing; instead copy
`docker compose cp backend:/data/tracking ./tracking-export` and send the JSONL files.

### Housekeeping
```bash
make logs     # follow logs
make down     # stop (data kept in the docker volume)
make reset    # stop and wipe all snapshots (re-seeds synthetic data on next `make up`)
```

## Option 2: Local without Docker (for development)
Requirements: [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`) and Node 22.

```bash
cd backend && uv sync
uv run python scripts/run_tracking_loop.py --brand all --providers synthetic   # seed data (no key needed)
uv run python scripts/report.py gajanan_vada_pav
make dev-backend      # terminal 1 → API on :8000
make dev-frontend     # terminal 2 → UI on http://localhost:5173 (proxies /api to :8000)
make test             # the live Gemini smoke test runs only when GEMINI_API_KEY is set
```

## What's real and what's stubbed in this MVP
- **Real**
  - Query-set generation and freezing.
  - Live LLM collection from any configured provider, with retries, `Retry-After` support and a skip for exhausted providers.
  - Deterministic mention detection.
  - Coverage / Prominence / Share of Voice / Composite, with a cluster-bootstrap 95% CI.
  - Deterministic gap detection.
  - Recommendations with counterfactual priority, each traced to a `gap_id` (AC-7).
  - JSONL tracking history.
  - The REST API and the dashboard, including background runs with progress and cancel.
- **Synthetic (labelled)**
  - The offline `synthetic` provider generates plausible answers so the pipeline can be demonstrated without keys.
- **Designed, not yet built** (see DESIGN_v1)
  - PostgreSQL persistence (ER model).
  - Celery/Redis orchestration: an in-process job thread stands in for it.
  - Web sources, Dev.to distribution, the admin quota view, and the AC-12 detector validation study.

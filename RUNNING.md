# Running the platform

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
dashboard is never empty. The UI labels this data as synthetic. Real runs appear alongside it.

### Bring your own model
Put any key you have in `.env.local`. That file is gitignored, so it never gets committed. Then restart with `make up`.

| Provider            | Variables                                                 |
|---------------------|-----------------------------------------------------------|
| Google Gemini       | `GEMINI_API_KEY` (optional `GEMINI_MODEL`)                |
| OpenAI              | `OPENAI_API_KEY` (optional `OPENAI_MODEL`, `OPENAI_BASE_URL`) |
| Groq                | `GROQ_API_KEY`                                            |
| OpenRouter          | `OPENROUTER_API_KEY`                                      |
| Anthropic Claude    | `ANTHROPIC_API_KEY`                                       |
| Ollama (local)      | `OLLAMA_BASE_URL=http://host.docker.internal:11434`, `OLLAMA_MODEL` |
| Any OpenAI-compatible endpoint | `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_LLM_MODEL` |

With `providers=auto` (the default), the pipeline queries **every** configured provider. With no keys, it falls back to
synthetic data. `make providers` shows what's configured; keys are never printed.

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
You can also start a run from the UI (brand page → **Run analysis**) or through the API (`POST /brands/{key}/runs`).

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
make test
```

## What's real and what's stubbed in this MVP
- **Real**
  - Query-set generation and freezing.
  - Live LLM collection from any configured provider, with retries.
  - Deterministic mention detection.
  - Coverage / Prominence / Share of Voice / Composite, with a cluster-bootstrap 95% CI.
  - Deterministic gap detection.
  - Recommendations with counterfactual priority, each traced to a `gap_id` (AC-7).
  - JSONL tracking history.
  - The REST API and the dashboard.
- **Synthetic (labelled)**
  - The offline `synthetic` provider generates plausible answers so the pipeline can be demonstrated without keys.
- **Designed, not yet built** (see DESIGN_v1)
  - PostgreSQL persistence (ER model).
  - Celery/Redis orchestration: an in-process job thread stands in for it.
  - Web sources, Dev.to distribution, the admin quota view, and the AC-12 detector validation study.

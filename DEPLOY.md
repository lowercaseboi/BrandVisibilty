# Deploying a live demo

Backend on **Render** (Docker), frontend on **Vercel** (static Vite build). Both are
click-deploy from this GitHub repo — no infra to hand-manage. Railway/Fly alternatives
are noted at the bottom.

## 1. Backend — Render

1. Render dashboard -> **New** -> **Blueprint** -> pick this repo. Render reads
   [`render.yaml`](render.yaml) and creates one web service, `brand-visibility-backend`,
   built from `backend/Dockerfile`.
2. Before/after the first deploy, set these env vars on the service (Render prompts for
   any marked `sync: false` in the Blueprint):
   - Leave **all** provider keys blank for the fully offline synthetic demo, or set any
     one of `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
     `ANTHROPIC_API_KEY`, `CUSTOM_LLM_API_KEY` (plus its matching `*_BASE_URL`/`*_MODEL`
     from [`.env.example`](.env.example) if you use `CUSTOM_LLM_*`) to enable real runs.
   - `CORS_ORIGINS` and `CORS_ORIGIN_REGEX` — leave blank. The Vercel frontend reaches the API
     through a same-origin rewrite (step 2), so CORS only matters if you skip that (step 3).
   - `DATA_DIR=/data` and `SEED_DEMO=1` are already set by the Blueprint.
3. Deploy. Render builds the image and calls `/health` to confirm it's up.

**Free plan notes:**
- **Cold starts.** A free service spins down after 15 minutes idle; the next request takes
  ~30–60s to wake it. Fine for a demo, not for a snappy first impression — mention this if
  presenting live.
- **Ephemeral disk.** `/data` is container-local and resets on every deploy or restart.
  `SEED_DEMO=1` reseeds the 3 pilot brands' synthetic snapshots on the next start, so the
  dashboard is never empty, but any run you kick off yourself is lost on restart.
  If you attach a persistent disk that already holds history from before the
  observations split, run `python scripts/migrate_split_observations.py --data-dir /data`
  once from the Render shell (the log warns on startup until you do; see RUNNING.md). The
  commented-out `disk:` block in `render.yaml` adds a persistent volume, but that needs a
  paid plan.

## 2. Frontend — Vercel

The frontend calls the API at the relative path `/api/*` (the default `API_BASE` in
`frontend/src/api/client.ts`). On Vercel, [`frontend/vercel.json`](frontend/vercel.json) rewrites
`/api/(.*)` to the Render service, so the browser only ever talks to the Vercel origin:
**no CORS setup and no `VITE_API_BASE` needed.** The rewrite sits before the SPA fallback, which
serves `index.html` for deep links like `/app`, `/brands/:key/analysis` or `/providers`.

1. Put your Render URL in the `/api` rewrite's `destination` in `frontend/vercel.json`
   (e.g. `https://brand-visibility-backend.onrender.com/$1`, no trailing slash before `$1`).
2. Deploy, either:
   - **CLI** (from the repo root): `npx vercel login` once, then
     `npx vercel link --cwd frontend --yes` and `npx vercel deploy --cwd frontend --prod`; or
   - **Dashboard**: Add New → Project → import this repo, **Root Directory** `frontend`
     (the Vite preset, build `npm run build` and output `dist` come from `vercel.json`).

## 3. CORS (only if you skip the rewrite)

If you'd rather call Render directly from the browser, set **`VITE_API_BASE`** on Vercel to the
Render URL (no trailing slash: requests are built as `` `${VITE_API_BASE}${path}` ``), then on
Render set:
- `CORS_ORIGINS=https://<your-app>.vercel.app` (comma-separate several exact origins).
- `CORS_ORIGIN_REGEX=https://.*\.vercel\.app` (optional) so preview deploys also work.

## 4. Verify

- `https://<render-url>/health` returns `{"status": "ok"}`.
- `https://<render-url>/docs` loads the Swagger UI.
- `https://<vercel-url>/api/health` returns `{"status": "ok"}` too (the rewrite reaches Render).
- The Vercel URL's landing page loads and shows the 3 pilot brands (Gajanan Vada Pav, the
  perfume brand, V.A. Mayekar Opticians) with synthetic demo data — confirms the frontend
  reached the backend. The first load after Render has idled can take ~30s; the app shows a
  "waking the server up" notice meanwhile.

## 5. Campaign Studio in production

Three more settings matter once someone actually approves and publishes a campaign from the deployed app, on top
of the provider keys from step 1 (all documented in `.env.example` and [docs/CHANNEL_SETUP.md](docs/CHANNEL_SETUP.md)):

- `ADMIN_TOKEN` — required to approve/publish/delete campaigns (header `X-Admin-Token`). Leaving it unset doesn't
  break anything; it just limits publishing to the sandbox, export-pack and WhatsApp-share channels, which never
  call an external API.
- `SECRET_KEY` — a Fernet key encrypting any stored platform tokens. Generate one with
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
- `PUBLIC_BASE_URL` — the public origin serving `GET /media/<campaign_id>/<file>` (generated campaign images).
  Instagram fetches that URL itself, so it has to be reachable from Meta's servers. On Render this is simply your
  Render service's own URL, e.g. `PUBLIC_BASE_URL=https://brand-visibility-backend.onrender.com`.

For a local demo instead of a hosted one, `docker-compose.yml` has a commented-out `cloudflared` service that gives
`PUBLIC_BASE_URL` a real public hostname without deploying anywhere — see the comment above it for setup.

## Alternatives to Render/Vercel

- **Railway or Fly.io** instead of Render: both can build `backend/Dockerfile` directly
  (Railway: "Deploy from GitHub", it auto-detects the Dockerfile; Fly: `fly launch` in
  `backend/`, then `fly deploy`). Set the same env vars as above; both platforms also
  inject `$PORT`, which the Dockerfile already reads (`${PORT:-8000}`).
- Any static host works for the frontend in place of Vercel (Netlify, GitHub Pages, Render
  static sites) as long as it builds `frontend/` with `npm run build`, serves `frontend/dist`,
  rewrites unknown paths to `index.html` for the SPA routes, and sets `VITE_API_BASE`.

## Run exactly one backend worker

Analysis runs go through an in-process job queue (`app/interface/jobs.py`), so the API must run as a
single worker. Job records are persisted under `DATA_DIR/jobs/` and a run cut off by a restart shows
as "interrupted", but several workers would each keep their own queue and job table. The backend
refuses to start when `WEB_CONCURRENCY` or `UVICORN_WORKERS` is greater than 1 — don't pass
`--workers N` to uvicorn.

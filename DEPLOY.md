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
   - `CORS_ORIGINS` and `CORS_ORIGIN_REGEX` — come back and set these in step 3, once you
     have the Vercel URL. The service works without them; browser calls from the deployed
     frontend just get blocked by CORS until they're set.
   - `DATA_DIR=/data` and `SEED_DEMO=1` are already set by the Blueprint.
3. Deploy. Render builds the image and calls `/health` to confirm it's up.

**Free plan notes:**
- **Cold starts.** A free service spins down after 15 minutes idle; the next request takes
  ~30–60s to wake it. Fine for a demo, not for a snappy first impression — mention this if
  presenting live.
- **Ephemeral disk.** `/data` is container-local and resets on every deploy or restart.
  `SEED_DEMO=1` reseeds the 3 pilot brands' synthetic snapshots on the next start, so the
  dashboard is never empty, but any run you kick off yourself is lost on restart. The
  commented-out `disk:` block in `render.yaml` adds a persistent volume, but that needs a
  paid plan.

## 2. Frontend — Vercel

1. Vercel dashboard -> **Add New** -> **Project** -> import this GitHub repo.
2. **Root Directory**: `frontend`. Vercel should auto-detect the Vite framework preset
   from [`frontend/vercel.json`](frontend/vercel.json) (build `npm run build`, output
   `dist`, SPA fallback so deep links like `/app`, `/brands/:key`,
   `/brands/:key/questions`, `/providers` all serve `index.html` instead of 404ing).
3. Set the env var **`VITE_API_BASE`** to your Render service's URL, e.g.
   `https://brand-visibility-backend.onrender.com` — **no trailing slash**. The frontend
   builds requests as `` `${VITE_API_BASE}${path}` `` where `path` already starts with
   `/` (see `frontend/src/api/client.ts`), so a trailing slash would produce `...//brands`.
4. Deploy.

## 3. Wire up CORS

Once you have the Vercel URL (e.g. `https://brand-visibility.vercel.app`), go back to the
Render service and set:
- `CORS_ORIGINS=https://brand-visibility.vercel.app` (comma-separate more than one exact
  origin, e.g. a custom domain too).
- `CORS_ORIGIN_REGEX=https://.*\.vercel\.app` (optional) so Vercel's per-branch/PR preview
  deploys, which get their own random subdomain, also work without adding each one by hand.

Redeploy the backend (or it will pick up the env change on its own, depending on Render's
settings) for the new CORS config to take effect.

## 4. Verify

- `https://<render-url>/health` returns `{"status": "ok"}`.
- `https://<render-url>/docs` loads the Swagger UI.
- The Vercel URL's landing page loads and shows the 3 pilot brands (Gajanan Vada Pav, the
  perfume brand, V.A. Mayekar Opticians) with synthetic demo data — confirms the frontend
  reached the backend and CORS is correctly configured (an open devtools Network tab will
  show a CORS error if not).

## Alternatives to Render/Vercel

- **Railway or Fly.io** instead of Render: both can build `backend/Dockerfile` directly
  (Railway: "Deploy from GitHub", it auto-detects the Dockerfile; Fly: `fly launch` in
  `backend/`, then `fly deploy`). Set the same env vars as above; both platforms also
  inject `$PORT`, which the Dockerfile already reads (`${PORT:-8000}`).
- Any static host works for the frontend in place of Vercel (Netlify, GitHub Pages, Render
  static sites) as long as it builds `frontend/` with `npm run build`, serves `frontend/dist`,
  rewrites unknown paths to `index.html` for the SPA routes, and sets `VITE_API_BASE`.

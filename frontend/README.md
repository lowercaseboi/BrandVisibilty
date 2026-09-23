# Frontend — AI Visibility dashboard

React 19 + Vite + TypeScript. No UI kit or chart library; charts are inline SVG.

## Run (dev)

Start the backend on `:8000` first (`uvicorn app.interface.main:app`), then:

```bash
npm install
npm run dev          # http://localhost:5173
```

The app calls `/api/*`; the Vite dev proxy forwards it to `http://localhost:8000` with `/api` stripped.
Override the target with `API_PROXY_TARGET=http://host:port npm run dev`, or bypass the proxy by setting
`VITE_API_BASE` (see `.env.example`).

## Docker

See `RUNNING.md` in the repo root.

## Checks

```bash
npm run build   # type-check + production build
npm run lint    # oxlint
```

## Routes

| Path | Page |
|------|------|
| `/` | Brands: cards per brand + "Add brand" form |
| `/providers` | Configured LLM providers (never shows keys) |
| `/brands/:brandKey` | Dashboard: run analysis, metrics + CI, trend, gaps, recommendations |
| `/brands/:brandKey/runs/:runId/evidence?refs=a,b` | Raw LLM answers with highlighted mentions |

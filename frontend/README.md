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
| `/brands/:brandKey` | Dashboard: score, next steps, who AI recommends, a real answer, trend, Check now; numbers behind a switch |
| `/brands/:brandKey/questions` | View / edit the questions the AIs are asked (toggle, add, reset) |
| `/brands/:brandKey/runs/:runId/evidence?refs=a,b` | "AI answers": what each AI said, with names highlighted |

## Languages and themes

UI text lives in `src/i18n/{en,hi,mr}/{common,dashboard,pages}.ts`. The Hindi and Marathi files are typed strictly
against the English ones, so a missing translation fails `npm run build`. Use `t()`, `t.n()` for plurals and `<T>` for
`**bold**`. Write whole sentences with `{placeholders}`, never glue translated fragments together.

The Hindi and Marathi translations were machine-drafted. `src/i18n/GLOSSARY.hi.md` and `GLOSSARY.mr.md` list the
chosen terms and the strings most in need of a native speaker's review. Theme (light/dark/system), language and the
"Show the numbers behind this" switch are stored in the browser's localStorage.

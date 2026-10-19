# Roadmap — next steps

Planned work after the core platform. Noted 2026-10-06, updated as items land.

- [ ] **Database & queue setup** — proper PostgreSQL and Redis setup (the `db/` and `orchestration/` scaffolding is
      currently unused; see *Known limitations* in the README).
- [x] **Mobile-native UX** — bottom tab bar, bottom sheets, swipeable Board lanes, touch-first motion and
      installable web app (`65e92ed`).
- [ ] **Vercel deployment** — public hosted link. Prepared (same-origin `/api` rewrite, cold-start notice; see
      [DEPLOY.md](../DEPLOY.md)); waiting on the Render backend URL and a Vercel login.
- [ ] **One-click multi-platform posting** — publish a campaign to multiple social platforms in a few clicks from Campaign Studio.
- [ ] **Post history & impact** — a history section to review whether previous posts affected the visibility score now,
      and if so by how many points.
- [ ] **Demo video** — record a walkthrough of the platform.

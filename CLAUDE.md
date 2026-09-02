# AI Visibility & Brand Intelligence Platform

Final-year B.E. AI & Data Science project, team of 4. See:
- PRD_v3.md — requirements, scope, acceptance criteria (the "what")
- DESIGN_v1.md — architecture, ER model, query methodology (the "how")

Stack: Python 3.11 + FastAPI, Celery + Redis, PostgreSQL, React + Vite.
Pilot brands: a local perfume brand, Gajanan Vada Pav, V.A. Mayekar Opticians.

Key constraints to respect in all code:
- Scorer must be a pure function — no I/O, no LLM calls (DESIGN §1.6, §4)
- Gap detection is deterministic; only recommendation drafting uses an LLM (DESIGN §5.1)
- Every recommendation needs a non-null gap_id — no untraceable recommendations (PRD AC-7)
- Coverage/Prominence/SoV computed only over the unprompted query subset (PRD §10.1)

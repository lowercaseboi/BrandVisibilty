# Terminal shortcuts. Docker targets need only Docker; dev-* targets need uv + node.
BRAND ?= all
PROVIDERS ?= auto
SAMPLES ?= 3
ROUND ?= 1
ARGS ?=

.PHONY: up down logs reset run report history evidence providers test dev-backend dev-frontend

up:            ## build + start everything (UI :8080, API :8000/docs)
	docker compose up --build -d
	@echo "UI  -> http://localhost:8080"
	@echo "API -> http://localhost:8000/docs"

down:          ## stop containers (data volume is kept)
	docker compose down

logs:          ## follow backend + frontend logs
	docker compose logs -f

reset:         ## stop and DELETE all collected snapshots (re-seeds on next `make up`)
	docker compose down -v

run:           ## run the pipeline: make run BRAND=gajanan_vada_pav PROVIDERS=gemini SAMPLES=3
	docker compose exec backend python scripts/run_tracking_loop.py --brand $(BRAND) --providers $(PROVIDERS) --samples $(SAMPLES) --round $(ROUND) $(ARGS)

report:        ## terminal report: make report BRAND=gajanan_vada_pav
	docker compose exec backend python scripts/report.py $(BRAND) $(ARGS)

history:       ## score trend in the terminal
	docker compose exec backend python scripts/report.py $(BRAND) --history

evidence:      ## raw LLM answers with brand/competitor mentions highlighted
	docker compose exec backend python scripts/report.py $(BRAND) --evidence

providers:     ## which model providers are configured (never shows keys)
	curl -s localhost:8000/providers | python3 -m json.tool

test:          ## backend tests (local uv)
	cd backend && uv run pytest -q

dev-backend:   ## run API locally without Docker (needs uv)
	cd backend && uv run uvicorn app.interface.main:app --app-dir src --reload --port 8000

dev-frontend:  ## run UI locally without Docker (needs node) -> http://localhost:5173
	cd frontend && npm install && npm run dev

# MVP integration contract (demo-readiness)

This is the single source of truth that lets the backend, the API and the frontend be built in parallel. Every module
listed here must exist with exactly these names and signatures. Keep the pure/impure split from CLAUDE.md:

- Scorer, gap detection and recommendation priority are pure. They do no I/O and make no LLM calls.
- Only the optional recommendation *drafter* may call an LLM.
- Every recommendation has a non-null `gap_id` (AC-7).
- Metrics are computed over the unprompted subset only.

## 1. Bring-your-own-model providers — `app/collection/`

Every provider implements the existing `LLMProvider` protocol (`app/collection/types.py`). Keys come only from env vars
(or the repo-root `.env.local` / `.env`) and are never logged or returned by the API.

| provider id   | env vars (key / model override)                          | notes                                    |
|---------------|----------------------------------------------------------|------------------------------------------|
| `gemini`      | `GEMINI_API_KEY` / `GEMINI_MODEL`                        | existing adapter                         |
| `openai`      | `OPENAI_API_KEY` / `OPENAI_MODEL` (`OPENAI_BASE_URL`)    | OpenAI-compatible chat-completions       |
| `groq`        | `GROQ_API_KEY` / `GROQ_MODEL`                            | OpenAI-compatible, fixed base URL        |
| `openrouter`  | `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`                | OpenAI-compatible, fixed base URL        |
| `anthropic`   | `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`                  | Messages API via httpx                   |
| `ollama`      | `OLLAMA_BASE_URL` / `OLLAMA_MODEL`                       | local models; no key                     |
| `custom`      | `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_LLM_MODEL` | any OpenAI-compatible endpoint    |
| `synthetic`   | none                                                     | deterministic offline demo generator     |
| `replay`      | none                                                     | replays recorded real responses          |

`app/collection/registry.py`:

```python
@dataclass(frozen=True)
class ProviderInfo:
    provider_id: str
    label: str
    configured: bool        # key/base-url present (synthetic/replay: always True)
    model: str | None       # model that will be used; never the key
    kind: Literal["live", "offline"]

def available_providers() -> list[ProviderInfo]
def resolve_provider_ids(spec: str) -> list[str]
    # "auto" -> every configured live provider; if none are configured -> ["synthetic"]
    # "gemini,groq" -> that list (ValueError if a live one isn't configured)
def build_provider(provider_id: str, *, brand: "BrandConfig | None" = None, round: int = 1) -> LLMProvider
```

Retry/backoff for 429, 5xx and timeouts lives in `app/collection/retry.py::query_with_retry(provider, prompt, params) -> CollectionResult`.

## 2. Brands — `app/brands/registry.py`

```python
@dataclass(frozen=True)
class BrandConfig:
    brand_key: str
    params: BrandParams                      # app.querysets.templates.BrandParams
    self_aliases: tuple[str, ...]
    competitors: dict[str, tuple[str, ...]]  # competitor entity_id -> aliases (first = display name)
    is_pilot: bool

    def alias_table(self) -> tuple[EntityAlias, ...]   # self entity id is "self"
    def competitor_ids(self) -> frozenset[str]

def list_brands() -> list[BrandConfig]        # pilots + user-created (DATA_DIR/brands.json)
def get_brand(brand_key: str) -> BrandConfig  # KeyError if unknown
def create_brand(spec: dict) -> BrandConfig   # validates (AC-1), persists, returns; ValueError on bad input
```

Create-brand spec (also the `POST /brands` body):
`{name, category, cities: [..], audiences: [..], competitors: [..names..], aliases: [..optional..], jobs_to_be_done: [..optional..]}`.

The pilots are `gajanan_vada_pav`, `va_mayekar_opticians` and `perfume_pilot`. The perfume brand's real name isn't in the
docs yet, so it uses the placeholder display name "Local Perfume Brand".

## 3. Data store — `app/tracking/store.py`

`DATA_DIR = Path(os.environ.get("DATA_DIR", <backend>/data))`, with snapshots in `DATA_DIR/tracking/<brand_key>.jsonl`.

```python
def append_snapshot(record: dict) -> None
def load_snapshots(brand_key: str) -> list[dict]     # oldest first; [] if none
def get_snapshot(brand_key: str, run_id: str) -> dict | None
def brand_keys_with_data() -> set[str]
```

## 4. Pipeline — `app/pipeline/runner.py` (used by the CLI and the API)

```python
ProgressFn = Callable[[str, int, int], None]   # (message, done, total)

def run_pipeline(brand_key: str, *, providers: str = "auto", samples: int = 3,
                 round: int = 1, record: bool = False,
                 on_progress: ProgressFn | None = None) -> dict
```

Pipeline steps:
1. Brand config → `generate_draft` / `freeze`.
2. Keep the unprompted queries only.
3. For each provider × query × sample, `query_with_retry`.
4. `detect_mentions` → `Observation`.
5. `score` → `detect_gaps` → `recommend`.
6. `build_snapshot` → `append_snapshot` → return the record.

A provider or sample failure never kills the run (AC-9). It marks `status="partial"` and lists the provider under
`admission.missing_providers`. `record=True` writes live responses to the replay cache at
`DATA_DIR/replay/<brand_key>.json`.

## 5. Snapshot record — the JSONL line, the API response and the frontend `Snapshot` type

```jsonc
{
  "brand_key": "gajanan_vada_pav", "brand": "Gajanan Vada Pav",
  "run_id": "uuid4", "status": "completed" | "partial",
  "data_origin": "live" | "synthetic" | "replay",
  "providers": ["gemini"],
  "comparability_key": "sha256(query_set_content_hash|sampling_config|sorted model versions)[:16]",
  "collection_started_at": "iso", "collection_completed_at": "iso", "collection_span_days": 0,
  "query_set_content_hash": "...", "query_set_template_version": "v1",
  "sampling_config": {"temperature": null, "system_prompt": null, "samples_per_query": 3},
  "observation_count": 60, "mentioned_count": 12, "cluster_count": 20,
  "analysis_result": {"coverage", "prominence", "share_of_voice", "composite_score", "ci_low", "ci_high",
                      "per_provider_coverage": [{"provider_id","coverage","observation_count","mentioned_count"}]},
  "gaps": [{"gap_id": "gap-<sha1[:10]>", "gap_type", "evidence_refs": [...], "detail": {...}, "is_inferred": false}],
  "recommendations": [{"recommendation_id", "gap_id", "action", "action_class", "priority", "delta_composite",
                       "confidence", "effort", "reasoning", "evidence_refs": [...], "drafted_by": "template" | "<provider>"}],
  "admission": {"admissible", "status", "reasons": [], "query_coverage", "sample_completeness",
                "missing_query_ids": [], "missing_providers": [], "collection_span_days", "policy_version": "v0"},
  "entities": {"self": "Gajanan Vada Pav", "<competitor_id>": "<display name>"},
  "raw_observations": [{"observation_id", "query_id", "query_text", "intent_type", "provider_id", "model_version",
                        "response_text", "mentions": [{"entity_id","entity_kind","rank","char_start","char_end","is_passing_mention"}]}]
}
```

`observation_id` is `"<provider_id>:q<idx>-s<sample>"`, and `query_id` is `"q<idx>"`.

## 6. Recommendation engine — `app/recommendation/engine.py`

```python
@dataclass(frozen=True)
class Recommendation:
    recommendation_id: str; gap_id: str; action: str; action_class: str
    priority: float; delta_composite: float; confidence: float; effort: int
    reasoning: str; evidence_refs: tuple[str, ...]; drafted_by: str = "template"

def recommend(gaps: list[Gap], observations: list[Observation], self_entity_id: str,
              competitor_entity_ids: frozenset[str], *, entity_names: dict[str, str] | None = None,
              max_recommendations: int = 10) -> list[Recommendation]     # sorted by priority desc
```

## 7. HTTP API — `app/interface/main.py` (`uvicorn app.interface.main:app`)

| method | path                                              | result                                           |
|--------|---------------------------------------------------|--------------------------------------------------|
| GET    | `/health`                                         | `{"status":"ok"}`                                |
| GET    | `/providers`                                      | `ProviderInfo[]` (never keys)                    |
| GET    | `/brands`                                         | `[{brand_key, brand, has_data, is_pilot}]`       |
| POST   | `/brands`                                         | create brand (spec above) → 201 BrandSummary; 422 on invalid |
| GET    | `/brands/{key}/snapshots/latest`                  | Snapshot without `raw_observations`; 404 if none |
| GET    | `/brands/{key}/snapshots`                         | Snapshot[] oldest first, without `raw_observations` |
| GET    | `/brands/{key}/snapshots/{run_id}/observations`   | `raw_observations[]` + `entities`                |
| POST   | `/brands/{key}/runs`                              | body `{providers?: "auto", samples?: 3, round?: 1}` → 202 `Job` |
| GET    | `/jobs/{job_id}`                                  | `Job`                                            |

`Job` = `{job_id, brand_key, status: "queued"|"running"|"completed"|"partial"|"failed", message, done, total, run_id|null, error|null}`.

Jobs run in a background thread, one at a time, and are held in memory. That's an MVP stand-in for Celery.

CORS is open to `http://localhost:5173` and `http://localhost:8080`. The frontend reads its API base from `VITE_API_BASE`
(default `/api`); nginx or the Vite proxy forward `/api/*` to the backend with the `/api` prefix stripped.

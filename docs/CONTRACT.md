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
| `gemini`      | `GEMINI_API_KEY` / `GEMINI_MODEL`                        | key sent as `x-goog-api-key` header      |
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
It makes up to 4 attempts with capped exponential backoff and jitter. A numeric `Retry-After` header (capped at 60s)
wins over the computed backoff. Other errors are not retried.

Adapters must put keys only in request headers, never in the URL. httpx includes the URL in `HTTPStatusError`
messages, and those messages reach job progress, the API and the UI.

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
ProviderFn = Callable[[dict], None]            # ProviderProgress payload (§7)
SkipFn = Callable[[str], bool]                 # provider_id -> True to stop calling that provider

def run_pipeline(brand_key: str, *, providers: str = "auto", samples: int = 3,
                 round: int | None = None, record: bool = False,
                 on_progress: ProgressFn | None = None,
                 should_skip: SkipFn | None = None,
                 on_provider: ProviderFn | None = None) -> dict
```

Pipeline steps:
1. Brand config → `generate_draft` / `freeze`.
2. Keep the unprompted queries only.
3. For each provider × query × sample, `query_with_retry`.
4. `detect_mentions` → `Observation`.
5. `score` → `detect_gaps` → `recommend`.
6. `build_snapshot` → `append_snapshot` → return the record.

A provider or sample failure never kills the run (AC-9). After 3 consecutive failed calls, a provider's remaining
calls are skipped: each failure has already used up its retries, so an exhausted quota would otherwise stall the run. It marks `status="partial"` and lists the provider under
`admission.missing_providers`. `record=True` writes live responses to the replay cache at
`DATA_DIR/replay/<brand_key>.json`.

**Skipping.** `query_with_retry(..., should_stop=, on_wait=)` (`app/collection/retry.py`) waits in ≤0.5 s slices
and raises `Skipped` as soon as `should_stop()` is true, so a provider can be abandoned in the middle of a
Retry-After wait; `on_wait(seconds, reason)` is called before each wait (`reason` is `rate limited`,
`provider error 503` or `timed out`). The runner polls `should_skip(provider_id)` before every call and during
every wait. A provider stops early, keeping the answers it already has, when:

- `should_skip` returns true (user pressed **Skip**, or **Finish now** which skips every provider): message
  `Groq skipped — continuing with the answers collected so far`;
- it has gone `AUTO_SKIP_AFTER_SECONDS = 120` without a successful answer (measured from its last success or its
  start) while failing or waiting: `Groq auto-skipped: no answer for 2 minutes (rate limited)`;
- 3 consecutive calls failed (rule above).

A skipped provider's remaining planned calls count as done, so `done` still reaches `total`. If it produced no
answers it lands in `admission.missing_providers` and the run is `partial`. If nothing scored was collected and a
provider was skipped on request, the run raises `RuntimeError("No answers were collected before the run was
skipped")` (the job fails). Waits are announced as `Groq rate limited — waiting 40s before retrying (question 4 of 20)`.
`on_provider` receives the ProviderProgress payload (§7) whenever a provider's state or counts change.

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
  "observation_count": 51, "unscored_observation_count": 0, "mentioned_count": 12, "cluster_count": 17,
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

Records written by the pipeline also carry `"unscored_observation_count": <int>` — the number of `scored: false`
raw observations appended after the scored ones (0 when none; absent in older records). `observation_count`
counts scored observations only.

Each raw observation also carries `"scored": bool`, which is `true` when absent in legacy records. Brand-named
questions from a customised question set (§8) are asked and stored for Evidence with `scored: false`, `query_id`
`"p<idx>"` and `observation_id` `"<provider_id>:p<idx>-s<sample>"`. They never reach the scorer, the gap detector,
the recommendation engine or the admission counts.

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
| GET    | `/brands/{key}/questions`                         | `QuestionSet` (§8); 404 unknown brand            |
| PUT    | `/brands/{key}/questions`                         | body `{questions: [{text, intent_type?, source?, enabled?}]}` → `QuestionSet`; 422 with a readable message |
| DELETE | `/brands/{key}/questions`                         | reset to the suggested questions → `QuestionSet` |
| POST   | `/brands/{key}/runs`                              | body `{providers?: "auto", samples?: 3, round?: null}` → 202 `Job`. `round` only affects synthetic data; when null it is the brand's synthetic run count + 1 |
| GET    | `/jobs/{job_id}`                                  | `Job`                                            |
| GET    | `/jobs?brand_key=`                                | `Job[]` submitted since server start, optionally filtered by brand |
| POST   | `/jobs/{job_id}/cancel`                           | `Job`; 404 if unknown, 409 if already finished   |
| POST   | `/jobs/{job_id}/skip`                             | body `{provider_id: str | null}` → `Job`. A provider id stops calling that provider; `null` skips every remaining call and goes straight to scoring what was collected. 404 unknown job; 409 unless running (cancel a queued job instead); 422 if the job doesn't use that provider |

`Job` = `{job_id, brand_key, status: "queued"|"running"|"completed"|"partial"|"failed"|"cancelled", message, done, total, run_id|null, error|null, providers: ProviderProgress[]}`.

`ProviderProgress` = `{provider_id, label, done, total, succeeded, failed, state: "queued"|"running"|"waiting"|"skipped"|"done", note: str|null}`,
one per provider in the order the run uses them (empty until the run starts). `note` is a short human string,
e.g. `waiting 40s — rate limited`, `auto-skipped after 2 min without an answer`, `skipped after 3 failures in a row`.
A skipped provider's `done` equals its `total`.

Jobs run in a background thread, one at a time, and are held in memory. That's an MVP stand-in for Celery.

Cancelling a queued job drops it. Cancelling a running job is cooperative: the run stops at the next provider call
during collection (interrupting a retry wait) and saves nothing. Once collection has finished, a late cancel is
ignored and the run completes. Skip requests (§4) are cooperative in the same way. A job's cancel/skip requests are
discarded when it finishes, and only the 100 most recent finished jobs are kept.
The frontend's Run panel re-attaches to a brand's active job via `GET /jobs?brand_key=`.

`GET /brands/{key}/runs` is a hidden alias of `/brands/{key}/snapshots` that the frontend client still uses.

CORS is open to `http://localhost:5173` and `http://localhost:8080`. The frontend reads its API base from `VITE_API_BASE`
(default `/api`); nginx or the Vite proxy forward `/api/*` to the backend with the `/api` prefix stripped.

Job `message` strings are human-readable and shown directly in the UI, for example
`Groq · question 4 of 20, answer 2 of 3 · “best vada pav outlet for students” · brand mentioned`. Failures are
summarised (`rate limited`, `provider error 503`, `timed out`) and never include raw exception text. `done` and
`total` count API calls: providers × questions × samples.

## 8. Question sets: `app/querysets/custom.py`

Customers can review and edit the questions the LLMs are asked (DESIGN §3, mandatory human review).

- **No saved file** (the default): the run uses `freeze(generate_draft(params))`, filtered to unprompted questions,
  exactly as before. The hash and `comparability_key` are unchanged.
- **Saved** at `DATA_DIR/questions/<brand_key>.json` as `{questions: [{text, intent_type, source, enabled}], updated_at}`.
  Enabled questions are frozen as `template_set_version "v1-custom"`. The new hash starts a new comparability segment,
  and the trend chart breaks the line there.
- A question **names the brand** when `detect_mentions(text, brand.alias_table())` finds the self entity. Those
  questions are asked but not scored (PRD §10.1).
- **Validation:**
  - 1–60 questions, each 3–200 characters, with no case-insensitive duplicates.
  - `intent_type` must be a template intent or `"custom"`.
  - At least one enabled question must be scorable.
  - Saving a list identical to the defaults deletes the file, so the baseline isn't broken for nothing.

```jsonc
// QuestionSet
{"brand_key": "gajanan_vada_pav", "customized": false,
 "questions": [{"id": 0, "text": "best vada pav outlet for students", "intent_type": "category_discovery",
                "source": "template" | "custom", "enabled": true, "names_brand": false, "scored": true}],
 "scored_count": 17, "unscored_count": 0}
```

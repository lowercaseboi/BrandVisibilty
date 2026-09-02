# Design Document v1 — Architecture, Data Model & Query Set Methodology
## AI Visibility & Brand Intelligence Platform

**Companion to:** `PRD_Detailed_v2.md` (referenced throughout as §N)
**Status:** Draft for team review
**Scope:** System architecture, entity-relationship model, and query-set design (the measurement instrument)

---

## 0. Corrections to PRD v2

These are load-bearing. Each one is a defect that only becomes visible once you try to implement the spec literally.

| # | PRD section | Problem | Resolution |
|---|---|---|---|
| C-1 | §10.1 Coverage | Denominator includes brand-named queries, where a mention is trivially guaranteed. Coverage becomes a function of query wording, not visibility. | Query set splits into **unprompted** and **prompted** subsets. Visibility score computed over the unprompted subset only. See §3.2. |
| C-2 | §10.1 Prominence | Undefined for responses where the brand is absent. Scoring absence as 0 double-counts it (already captured by Coverage) and corrupts the 0.4/0.3/0.3 weighting. | Prominence is **conditional on mention** — mean over responses where the brand appeared. Undefined (not zero) when Coverage is 0. See §4.2. |
| C-3 | §10.4 Comparability | Guards query-set changes but not **model version drift**. `gemini-2.0-flash` is a moving alias; a silent provider-side update invalidates a trend line exactly as much as a changed query does. | Store resolved model version per observation. A version change is a comparability event and starts a new baseline. See §4.5. |
| C-4 | §8.1 Provider abstraction | `query(prompt) → {response, metadata}` cannot express YouTube (result list), Reddit (thread + comments), or web scraping (documents). | Two interfaces, `LLMProvider` and `SourceCollector`, both returning a shared `CollectionResult` envelope. Config-driven swapping is preserved. See §1.3. |
| C-5 | §14 QuerySet | `queries[]` as an inline array prevents `RawObservation` from referencing a specific query, making AC-5 traceability unimplementable at query granularity. | `Query` is promoted to a first-class table. See §2. |
| C-6 | §10.1 Share of Voice | "Brand mentions ÷ (brand + competitor mentions)" doesn't specify whether a mention is counted per-occurrence or per-response. Per-occurrence rewards verbose responses that name a brand three times. | SoV counted as **per-response presence**, summed across responses. See §4.3. |

---

## 1. Architecture

### 1.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| API | Python 3.11 + FastAPI | Analysis work is Python-native. Pydantic models double as the normalization contract (§17), so the schema is enforced rather than documented. |
| Workers | Celery + Redis, Celery Beat for schedules | Mature, well-documented retry/backoff primitives. Beat covers §11.5 scheduled reruns with no custom scheduler. |
| Database | PostgreSQL | Relational integrity for the evidence chain (AC-5, AC-7); JSONB columns for raw responses and score breakdowns. |
| Frontend | React + Vite; SSE for job progress, 2s polling fallback | §13.1 requires visible per-source progress, not a spinner. |
| Secrets | Environment + a `SecretProvider` indirection | §12 forbids credentials in frontend or logs. Indirection keeps a future move to a vault from touching adapter code. |

*If the team is stronger in Node, the same pipeline shape maps cleanly to NestJS + BullMQ + Postgres. The layering below is stack-independent — nothing in it assumes Python.*

### 1.2 Layers

```
L0  Interface        React SPA · FastAPI REST · SSE progress stream
L1  Orchestration    JobService · stage machine · Celery Beat · fan-out
L2  Collection       LLMProvider / SourceCollector adapters
                     RateLimiter · RetryPolicy · CircuitBreaker · UsageLedger
L3  Normalization    CollectionResult → NormalizedObservation
L4  Analysis         MentionDetector · EntityExtractor · Scorer · GapAnalyzer
L5  Recommendation   Gap → prioritized, evidence-linked actions
L6  Distribution     ChannelAdapter · approval gate · export fallback
L7  Tracking         Snapshot writer · trend calculator
--  Cross-cutting    Correlation IDs · structured logs · audit log · metrics
```

### 1.3 The two collection interfaces (resolves C-4)

```python
class CollectionResult:
    source_id: str
    source_kind: Literal["llm", "web", "social"]
    model_version: str | None      # resolved, not the alias — see C-3
    payload: str | list[Document]
    latency_ms: int
    token_usage: dict | None
    raw_meta: dict                 # JSONB, provider-specific, never parsed by L4

class LLMProvider(Protocol):
    def query(self, prompt: str, params: SamplingParams) -> CollectionResult: ...
    def quota_state(self) -> QuotaState: ...

class SourceCollector(Protocol):
    def search(self, terms: list[str], limit: int) -> CollectionResult: ...
    def quota_state(self) -> QuotaState: ...
```

Both expose `quota_state()`, which is what lets the orchestrator skip an exhausted provider before dispatching work rather than discovering exhaustion through a wall of 429s (§15.5).

Adapters: `GeminiAdapter`, `GroqAdapter`, `OpenRouterAdapter`, `AnthropicAdapter` (LLMProvider); `YouTubeAdapter`, `WebScrapeAdapter`, `GoogleCSEAdapter`, `BraveSearchAdapter` (SourceCollector). §1.8 covers source strategy in full.

### 1.8 Web/Social Source Strategy (supersedes the Reddit-fallback role in PRD §9)

With Reddit out of scope, the search-engine discovery call that existed only to find Reddit threads is repurposed as general category discovery — what it should have been doing from the start.

| Source | Role | Free tier | Feeds |
|---|---|---|---|
| Blogs/web (scrape + RSS) | Primary web corpus | No API dependency | SOURCE gaps (§5.2), competitor-context |
| YouTube Data API v3 | Video corpus | Solid daily quota | SOURCE gaps, prominence context |
| Google Custom Search JSON API | Category-wide SERP discovery — "what ranks for this category" | 100 queries/day | SOURCE gaps |
| Brave Search API | Independent-index SERP discovery, cross-checks Google CSE | ~1,000 queries/month | SOURCE gaps |

**Two search engines, deliberately.** Google CSE and Brave draw from different indices. A listicle or video that both surface independently is a much stronger "this dominates the category" signal than either alone, and it costs nothing extra — Brave's monthly cap absorbs the query volume easily at this project's scale.

**Explicitly out of scope for v1, with rationale (join Instagram in §9's exclusion table):**

| Source | Why excluded |
|---|---|
| Common Crawl | Free, but requires terabyte-scale archive processing infrastructure disproportionate to what blog scraping + two SERP APIs already cover |
| G2 / Capterra / Trustpilot | APIs are partner/business-claim gated, not general-purpose free access |
| X/Twitter | Free read tier is no longer practically usable (paid tiers start ~$100/mo) |
| Bing Search API | Retired by Microsoft in August 2025 — no longer exists at any price |

**Conditional, category-dependent (add only if a pilot brand fits):**

| Source | Fit | Free tier |
|---|---|---|
| Hacker News (Algolia Search API) | Dev tools, technical products | Fully free, no key |
| Product Hunt API | SaaS, launched products | Free tier |

These slot into `SourceCollector` (§1.3) as configuration, not architecture — adding one is a `Provider` row plus an adapter class, not a redesign. Don't build either speculatively; add only once a real pilot brand's vertical calls for it.

**Note on what search-engine data does *not* do:** it never enters the visibility composite score. The whole premise of this project (§2.2) is that traditional SERP ranking no longer explains AI-mediated discovery — feeding SERP results into the Coverage/Prominence/SoV formula would quietly turn this back into a conventional SEO tool. Search-engine data is scoped strictly to the web/social layer: SOURCE gap detection and competitive/corpus context, never the score itself.

### 1.4 Job execution model

A job fans out into one task per `(provider, query, sample_index)` tuple rather than one task per provider.

**Why:** a failed task isolates to a single sample instead of losing a provider's entire contribution; the rate limiter gets fine-grained scheduling control; and resumption after a crash re-dispatches only the missing tuples. **Cost:** ~450 queue messages per job instead of ~3, and more DB round-trips. At this scale that overhead is irrelevant; the failure isolation is not.

Idempotency comes from a unique constraint on `raw_observation (job_id, provider_model_id, query_id, sample_index)`. Retries and resumes are safe by construction — no dedup logic in application code.

**Stage machine.** Each stage persists its output before the next reads it:

```
COLLECTING → NORMALIZING → SCORING → GAP_ANALYSIS → RECOMMENDING → COMPLETE
                                                                  ↘ PARTIAL
```

`AnalysisJob.current_stage` + `stage_status` gives §15.7 checkpoint resume for free: reprocessing restarts at the last stage whose output is complete and valid.

### 1.5 Rate limiting and quota (AC-11)

Two tiers, deliberately:

- **Redis token bucket, per provider, per-minute.** Fast, shared across concurrent workers. Volatile — a Redis restart loses it, which is acceptable for a per-minute window.
- **Postgres `ProviderUsageLedger`, per provider, per day.** Durable, auditable, survives restarts. This is the source of truth for the admin cost view and the finite Anthropic credit (§8, AC-11).

**Circuit breaker per provider:** opens after M consecutive failures or on quota exhaustion, and stays open for the remainder of the run. Directly implements §15.5's "avoid uncontrolled retry loops."

**Retry classification:** 429 / 5xx / timeout → transient, exponential backoff with jitter, bounded attempts. Any other 4xx → permanent, fail the task immediately and record the reason. Retrying a 400 just burns quota.

### 1.6 Analysis layer detail

**MentionDetector — deterministic, not LLM.** Alias-table lookup with casefolding, punctuation stripping, and possessive/plural handling, matched on word boundaries. Records character offsets so every mention has an evidence span.

Choosing deterministic detection over an LLM classifier is a research decision, not just an engineering one: the detector must be reproducible for the paper, and a string matcher can be reported with a precision/recall figure against your manual ground-truth labels (§3.4 Research Goals). An LLM classifier's behaviour would drift between runs, and you'd be measuring the detector's variance on top of the phenomenon's variance.

**EntityExtractor — LLM, cost-controlled.** Needed for two things: entity ordering (prominence) and discovery of competitors the user never listed.

Running it on every response costs ~450 extra calls per job, roughly doubling quota consumption. Instead:
- **Ordering** for prominence is derived from the offsets the deterministic detector already produced. No LLM call needed.
- **Unlisted-entity discovery** runs on a sampled subset (~20% of unprompted responses), batched five responses per call. Discovery is a feature, not a scoring input, so sampling is sound.

Discovered entities are written as `TrackedEntity(kind='discovered')` and surfaced to the user as *"these competitors appear in AI answers about your category and you didn't list them"* — one of the more compelling demo moments available, and it costs almost nothing.

**Scorer — a pure function.** `list[EntityMention] → AnalysisResult`. No I/O, no LLM, fully unit-testable. This is what makes AC-5 achievable and the paper's methodology reproducible by a third party.

**GapAnalyzer — LLM with forced citation.** Structured output where every gap must carry `evidence_refs` pointing at real observation IDs. Any claim without a resolvable reference is written with `is_inferred = true` (§11.2). Validate the IDs server-side; models will invent them.

### 1.7 Cross-cutting

A correlation ID is generated at the API boundary and propagated through job → task → every log line. Structured JSON logging with a redaction filter on known secret keys (§12). Audit writes go through a single `AuditService` so approvals, retries, and publish attempts can't be logged inconsistently.

---

## 2. Data Model

Refines PRD §14. Full ER diagram in `er_diagram.mermaid`.

### 2.1 Key changes from §14

**`Competitor` is absorbed into `TrackedEntity`.** Your brand and its competitors are the same kind of object for every purpose that matters — both need aliases, both are mention targets, both appear in Share of Voice. A single table with `kind ∈ {self, competitor, discovered}` removes a pile of duplicated detection logic and gives discovered competitors somewhere to live.

**`Query` promoted from array to table** (resolves C-5), carrying `intent_type` and `is_brand_named` — the flag that partitions the scoring denominator (C-1).

**`ProviderModel` split from `Provider`.** OpenRouter is one provider with ~14 models; treating them as one row makes per-model quota tracking impossible. This is also where `resolved_version` lives (C-3).

**`EntityMention` is new** — the join between an observation and an entity, carrying rank, character offsets, and prominence band. This table *is* the evidence chain. Every number in `AnalysisResult` decomposes into rows here, which is what makes AC-5 and AC-7 real rather than aspirational.

**`CollectionTask` is new** — one row per `(provider_model, query, sample_index)`, tracking attempt count and terminal state. Without it, resuming a partial job means guessing what's missing.

**`ProviderUsageLedger` is new** — durable quota and cost accounting (AC-11).

### 2.2 Integrity rules worth enforcing in-schema

- `UNIQUE (job_id, provider_model_id, query_id, sample_index)` on `raw_observation` — idempotent retries.
- `query_set` is immutable once `frozen_at` is set; edits create a new version row. Enforce with a trigger, not convention.
- `tracking_snapshot` stores `query_set_version` **and** `model_fingerprint` (a hash of the participating model versions); the trend view refuses to join across differing values (§10.4 + C-3).
- `recommendation.gap_id` is `NOT NULL` — no recommendation can exist without a traceable origin (AC-7).

---

## 3. Query Set Design

This is the measurement instrument. If it's arbitrary, the score is arbitrary and the paper has no methodology section.

### 3.1 Templates, not hand-written queries

Queries are **not** authored per brand. You define a versioned taxonomy of *intent templates* parameterized by brand attributes:

```
template: "best {category} for {audience}"
brand params: category="project management tool", audience="freelance designers"
→ "best project management tool for freelance designers"
```

Three properties follow:
- The methodology transfers across brands, which is what makes it publishable rather than a case study.
- Query-set versioning becomes meaningful: **v = (template set version, brand parameter set)**.
- The generation step is auditable — a reviewer can see exactly why each query exists.

**Generation pipeline:** brand params → template instantiation → LLM expansion for natural phrasing variants → **mandatory human review** → freeze + SHA-256 hash → store hash on every job that uses it. Auto-generation without the review gate produces a non-reproducible instrument.

### 3.2 The unprompted / prompted split (resolves C-1)

| | Unprompted | Prompted |
|---|---|---|
| Brand name in query | No | Yes |
| Measures | Whether AI systems surface you unaided | Whether AI systems *know* you, and describe you correctly |
| Feeds | **Visibility score** (Coverage, Prominence, SoV) | Identity accuracy, gap detection, misinformation checks |
| Expected coverage | Low for most small businesses — this is the signal | ~1.0 by construction — carries no visibility information |

Both live in the same `QuerySet`, distinguished by `is_brand_named`. Both are collected and stored. Only unprompted queries enter the scoring denominator.

The prompted subset is not filler. For a small business, *"Is Acme Studio legitimate?"* returning a hedge, or *"What does Acme Studio do?"* returning a description three pivots out of date, is often more actionable than a Coverage number — and it's a gap the unprompted set can't detect.

### 3.3 Intent taxonomy

**Unprompted (≈20 queries)**

| Intent | Template | Weight in set |
|---|---|---|
| Category discovery | "best {category} for {audience}" | 4 |
| Problem-first | "how do I {job_to_be_done}" | 4 |
| Alternative-seeking | "alternatives to {competitor}" | 3 |
| Attribute-constrained | "most affordable / fastest / easiest {category}" | 3 |
| Local / contextual | "{category} in {city}" | 3 |
| Recommendation-seeking | "who should I hire to {task}" | 3 |

Local queries are weighted deliberately — §5.1 is small businesses and freelancers, for whom geography is often the dominant discovery axis. A national-scope-only query set would systematically under-measure exactly the users this project targets.

**Prompted (≈10 queries)**

| Intent | Template |
|---|---|
| Identity | "what is {brand}" · "what does {brand} do" |
| Fit | "is {brand} good for {use_case}" |
| Commercial | "how much does {brand} cost" |
| Head-to-head | "{brand} vs {competitor}" |
| Trust | "is {brand} reliable / legitimate" |
| Sourcing | "where can I find reviews of {brand}" |

### 3.4 Sizing and quota budget

Recommended: **Q_unprompted = 20, Q_prompted = 10, N = 5, P = 3** free-tier providers.

```
30 queries × 5 samples × 3 providers = 450 calls per job
→ 150 calls per provider per job
```

| Provider | Free daily ceiling | Per-job load | Headroom |
|---|---|---|---|
| Gemini Flash | 250–1,000/day | 150 | 1–6 jobs/day |
| Groq | ~1,000/day | 150 | ~6 jobs/day |
| OpenRouter | ~50/day/model | 150 across 3 models | 1 job/day — tightest |
| Anthropic | finite credit | 0 (excluded from loop) | benchmark runs only |

OpenRouter is the binding constraint. Spread its 150 calls across at least three distinct free models — which is also the point of including it (§8, model diversity). During development, run against a cached-response fixture set rather than live providers; you will otherwise burn a day's quota on a debugging session.

**Why N = 5:** the PRD permits 3–5. Five gives mention-rate resolution of 0.2 rather than 0.33, which is the difference between distinguishing "occasionally surfaced" from "usually surfaced." Below 5 the rate is too coarse to support the trend claims in §11.5.

### 3.5 Sampling parameters (reproducibility controls)

| Parameter | Setting | Rationale |
|---|---|---|
| Temperature | Provider default, recorded per call | **Not 0.** The research question is what a typical user sees, and typical users get default sampling. Temperature 0 would suppress the run-to-run variance the study exists to characterize. |
| System prompt | None, or a fixed minimal one, stored in the QuerySet version | An unrecorded system prompt makes the instrument unreproducible. |
| Conversation history | None — every call is a fresh context | Prevents earlier samples contaminating later ones. |
| Tool use / web search | **Off** where the provider allows it | Grounded and ungrounded responses measure different phenomena. Mixing them means the score has no single referent. Flag this as a limitation and a v2 axis. |
| Model version | Resolved and stored per observation | C-3. |

Record all of these in `QuerySet.sampling_config`. If any change, it's a new version.

The tool-use setting deserves a paragraph in the paper. Whether the model answers from parameters or from live retrieval is arguably the single largest source of variance in this whole problem, and treating it as a controlled variable in v1 (rather than an uncontrolled one) is a defensible methodological stance.

---

## 4. Scoring, Operationalized

### 4.1 Coverage

```
Coverage = (# unprompted (query, provider, sample) triples where brand mentioned)
         / (total unprompted triples)
```

Denominator is the unprompted subset only (C-1). Report per-provider Coverage alongside the aggregate — a brand at 0.6 on Gemini and 0.0 on Groq is a materially different situation from one at 0.3 on both, and the composite score alone hides that.

### 4.2 Prominence (resolves C-2)

Computed **only over responses where the brand was mentioned.** Rank `r` = the brand's position among distinct entities ordered by first mention.

| Condition | Score |
|---|---|
| Sole option named | 1.0 |
| First of several | 0.9 |
| Rank 2–3 | 0.6 |
| Rank 4+ / in list body | 0.3 |
| Passing or parenthetical mention | 0.1 |

`Prominence = mean(band_score)` over mentioned responses. **Undefined, not zero, when Coverage = 0** — the composite falls back to a two-component score with re-normalized weights, and the UI says so rather than displaying a misleading 0.

Banded rather than continuous `1/r` because the bands map onto how users actually read answers (did I appear in the visible part, or after the fold), and because bands are defensible in a paper without needing to justify a specific decay curve.

### 4.3 Share of Voice (resolves C-6)

```
SoV = (# unprompted responses mentioning brand)
    / (# unprompted responses mentioning brand OR any tracked competitor)
```

Per-response **presence**, not occurrence count. Occurrence counting would reward a response that repeats a brand name three times over one that names it once and describes it well, which is measuring verbosity.

Denominator excludes responses that name no tracked entity at all — those are usually the model answering generically or refusing, and including them would deflate every brand's SoV by a constant that varies with provider chattiness rather than with competitive position.

### 4.4 Composite

Per §10.3, unchanged: `0.4·Coverage + 0.3·Prominence + 0.3·SoV`, each in [0,1], reported 0–100, breakdown always preserved.

Lock this formula after validation and before any tracked run you intend to plot.

### 4.5 Comparability key (resolves C-3)

A trend line is only valid within a constant:

```
comparability_key = hash(query_set_version, sampling_config, model_fingerprint)
```

where `model_fingerprint` hashes the resolved model versions of participating providers. Stored on every `TrackingSnapshot`. The trend view groups by this key and renders a visible discontinuity marker at boundaries rather than connecting across them.

This is the single most important thing separating a defensible longitudinal claim from a plausible-looking but meaningless line chart.

---

## 5. Recommendation Generation

### 5.1 Architecture: rules detect, LLM narrates

Gap detection is **deterministic**. Recommendation drafting is **LLM-assisted**. The boundary is strict.

```
Stage A  GapDetector (pure functions over aggregated EntityMention data)
         → typed Gap records + evidence_refs        [reproducible, unit-tested]

Stage B  RecommendationDrafter (LLM, schema-constrained)
         → reasoning prose + bounded action          [fluent, non-load-bearing]
```

**Why the split.** If an LLM decides *whether* a gap exists, gap detection is non-reproducible: it can't be unit-tested, can't be reported with precision/recall against ground truth, and drifts silently when the provider updates the model. Determinism goes where correctness matters; the LLM goes where only fluency matters. Stage B can be swapped, degraded, or disabled entirely without affecting what the system claims to have found.

**Failure mode this prevents:** an LLM handed raw observations will reliably invent plausible-sounding gaps with no data behind them, and they are extremely hard to spot in review because they read exactly like the real ones.

### 5.2 Gap taxonomy (replaces PRD §11.2)

PRD §11.2's user-need / product / marketing categories are marketing constructs with no computable definition — nothing in the collected data maps onto them. Replaced with five types derivable directly from the score breakdown:

| Type | Detection rule | Evidence source |
|---|---|---|
| **PRESENCE** | Coverage ≤ θ_presence for an intent cluster or a provider | Unprompted subset |
| **PROMINENCE** | Coverage ≥ θ_present but mean rank ≥ 4 | Rank distribution in `EntityMention` |
| **REPRESENTATION** | Prompted responses disagree with brand profile, or disagree with each other | Prompted subset |
| **COMPETITIVE** | Competitor co-occurs in ≥ θ_co of responses and out-ranks in ≥ θ_beat of those | Per-competitor SoV |
| **SOURCE** | Domains/videos dominant in the web layer for this category contain no brand mention | YouTube + web scrape |

All thresholds live in a versioned `detection_config`, stored on the job. Threshold changes are a methodology change and must be recorded as such.

**SOURCE gaps are what the web/social layer is for.** PRD §9 specifies collecting YouTube and blog data but never says what consumes it — as written, it is collected and then unused. Its purpose is actionability: "Gemini doesn't mention you" is not something a user can act on; "these six listicles and four videos rank for your category and none list you" is. Without this layer, every recommendation degrades into generic content advice.

### 5.3 Diagnostic matrix

The component breakdown determines the recommendation class. This is PRD §10.3's explainability claim made operational.

| Coverage | Prominence | SoV | Diagnosis | Action class |
|---|---|---|---|---|
| ≈ 0 | — | ≈ 0 | No category association exists | Corpus entry: directories, category roundups, structured listings |
| low | high | low | Narrow but strong association | Intent broadening: target missing clusters |
| high | low | mid | Known, but always an afterthought | Differentiation: own a named attribute |
| high | mid | low | Crowded frame, competitors dominate | Comparative content, head-to-head positioning |
| split by provider | — | — | Divergent training/grounding corpora | Target the absent provider's likely sources |

The final row depends on the per-provider Coverage split stored in `AnalysisResult.breakdown_json` (§4.1). It is frequently the most surprising output for a user, and it is invisible if only the aggregate is stored.

### 5.4 Prioritization by counterfactual score delta

Because `Scorer` is a pure function (§1.6), impact can be simulated rather than estimated:

1. Take the job's `EntityMention` set.
2. Apply the gap's hypothetical closure (e.g. local-intent coverage 0 → 0.5).
3. Re-run `Scorer`.
4. `Δcomposite` = the resulting change in score.

```
priority = Δcomposite × confidence × (1 / effort_constant)
```

- **Δcomposite** — counterfactual impact, in the same units as the score itself.
- **confidence** ∈ [0,1] — evidence volume and cross-provider agreement; a gap seen on one provider scores lower than one seen on all three.
- **effort_constant** — static per action type (directory listing = 1, content piece = 3, positioning change = 5, product change = 8).

This grounds ranking in the scoring methodology instead of delegating it to a model, and the closure assumptions are inspectable. Record the assumed closure delta on the recommendation so a reviewer can see what was simulated.

### 5.5 Bounded action vocabulary

Stage B emits actions from a closed set, mapped to PRD §11.3's three required types:

| §11.3 type | Actions |
|---|---|
| Content | publish comparison page · publish use-case page · publish FAQ · produce video targeting query cluster |
| Messaging | clarify category descriptor · add attribute claim · correct outdated description |
| Distribution | submit to directory · pitch inclusion in listicle · seek review coverage · community answer |

Free-text actions are rejected at validation. A closed vocabulary keeps recommendations executable by a small business, keeps distribution actions inside what §11.4 can actually support, and prevents the model from proposing things outside the user's means.

### 5.6 Validation gate

Before persistence, every drafted recommendation must:

- Reference a `gap_id` that exists (schema-enforced `NOT NULL`, §2.2).
- Carry `evidence_refs` resolving to real `NormalizedObservation` rows — **validated server-side**; models fabricate IDs.
- Use an action from §5.5's vocabulary.
- Fall within a configured maximum count per job (prevents a 40-item list no user will read).

If a gap has evidence but no valid recommendation can be produced, it is persisted as **observed-only** with the reason recorded. Per PRD §6, the system says it has nothing to recommend rather than fabricating one.

---

## 6. Tracking & Trend

### 6.1 The problem the PRD doesn't state

§11.5 requires showing improving / declining / stable. Against what threshold? The composite moving 41 → 46 between runs may be a real change or may be sampling noise, and the system has no basis to distinguish them without an uncertainty estimate.

**Naive estimate.** Coverage over 20 queries × 5 samples × 3 providers = 300 binary observations. SE ≈ √(0.25/300) ≈ 0.029 → roughly **±6 points** at 95% confidence.

**Corrected estimate.** Those observations are not independent. Samples within a query are strongly correlated — some queries reliably surface the brand, others reliably do not. Effective sample size is far closer to the number of **queries (20)** than to the number of calls. At n = 20: SE ≈ √(0.25/20) ≈ 0.112 → roughly **±22 points**.

Reporting a 5-point improvement under the naive assumption is a false-positive machine. Every trend claim in this system must be made against the clustered estimate.

### 6.2 Cluster bootstrap

```
for i in 1..1000:
    resample QUERIES with replacement (not individual calls)
    recompute composite over the resampled set
CI = 2.5th and 97.5th percentiles of the 1000 composites
```

Correct for the clustering, requires no distributional assumptions, and is trivially cheap because `Scorer` is pure and operates on in-memory mention data. Store `ci_low` and `ci_high` on every `TrackingSnapshot`.

**Direction is then decided by CI overlap, not point-estimate movement.** "Stable" becomes the honest default rather than a fallback, which is both methodologically correct and the more defensible position under academic review.

### 6.3 Design implication: add queries, not samples

Additional samples repeat within an existing cluster and buy very little power. Additional queries add clusters. At equal quota cost:

| Configuration | Calls/provider | Clusters | Approx. CI |
|---|---|---|---|
| 20 queries × 5 samples | 100 | 20 | ±22 |
| 33 queries × 3 samples | 99 | 33 | ±17 |

**Two-phase plan:**

- **Phase 1 — validation (N = 5, Q = 20).** Within-query variance is itself a research output; you need repeated samples per query to characterize the instrument's reliability. Keep N = 5 here.
- **Phase 2 — tracking loop (N = 3, Q = 33).** Once the instrument is characterized, shift the budget toward clusters. Same quota, materially better change detection.

The shift is a comparability event (§4.5) and starts a new baseline. Make the switch **before** the tracking loop begins, not during it.

### 6.4 Trend direction

| Snapshots available | What is reported |
|---|---|
| 1 | Baseline only. No direction. |
| 2 | Two-run **comparison** — "change detected" / "no change detected" by CI overlap. Not called a trend. This satisfies PRD §19. |
| 4+ | **Theil–Sen slope** — median of all pairwise slopes. Direction reported only when the slope's bootstrap CI excludes zero. |

Theil–Sen over least-squares regression: robust to a single anomalous run (a provider outage or a transient model change will produce one), no normality assumption, and about ten lines of code. At n = 6–10 snapshots, robustness matters more than efficiency.

### 6.5 Change decomposition

When the composite moves, report **which component moved** — the tracking-time analogue of §10.3's score breakdown.

```
Composite  41 → 47   (+6, CI [-9, +21] → not significant)
  Coverage  0.30 → 0.42   (+0.12)  ← primary driver
  Prominence 0.55 → 0.51  (-0.04)
  SoV       0.28 → 0.29   (+0.01)
```

Also track per-intent coverage over time. "Local-intent coverage went 0.0 → 0.4 while category-discovery stayed flat" is far more useful than a composite delta, and it closes the loop with §5.2's intent-cluster gaps — the user can see whether the thing they acted on is the thing that moved.

### 6.6 Snapshot contents

`TrackingSnapshot.metrics_json` must denormalize enough to render the full trend view without joining across `RawObservation`:

- composite, three components, `ci_low`, `ci_high`
- per-provider coverage
- per-intent coverage
- per-competitor SoV
- observation count and participating provider list

Raw observations stay in their own table tied to the job. The snapshot is the trend view's read model.

### 6.7 Annotations, not causal claims

Overlay markers on the trend chart for:

- Approved recommendations (with approval date)
- Model version changes (§4.5)
- Query-set version changes
- Runs where a provider was unavailable

The system displays temporal coincidence and **never asserts causation**. PRD §4 already disclaims visibility → business outcomes; the same discipline applies to recommendation → visibility. The user is shown what they did and what happened, and draws their own conclusion. Anything stronger is unsupportable from n ≈ 8 uncontrolled observations.

### 6.8 Sequencing — start before the rest of the pipeline exists

**Tracking history is the only deliverable in this project that cannot be built at the end.** It accumulates in real time or not at all — there's no way to backfill eight weeks of snapshots the night before a demo.

The dependency that matters isn't a date, it's an order: the collection loop (Provider adapters + Scorer) needs to start running against 2–3 real brands as soon as those two pieces exist, independent of whether the recommendation engine, distribution module, or UI are built yet. Collection and scoring are early-pipeline components with no dependency on anything else in this document, so nothing blocks starting the loop early except sequencing it after Provider/Scorer instead of after the whole system.

If the loop only starts once the full pipeline is assembled, the project ends up with two snapshots and no trend — §19's trend-view success criterion becomes unmeetable regardless of how good the rest of the build is.

Recommended cadence: **weekly**. Daily is wasteful against free-tier quota (OpenRouter caps you near one full job per day, §3.4) and the underlying signal doesn't move meaningfully day to day.

**Pilot roster (final):**

| Brand | Category | Role |
|---|---|---|
| Perfume brand | Product, currently weak presence | Full-loop test — only brand with a real relationship, so it's the one that exercises §11.4's distribution approval gate with an actual human who can say yes |
| Gajanan Vada Pav | Single-item food, established, multi-outlet | Discovery-intent, local-intent, listicle-driven SOURCE gaps |
| V.A. Mayekar Opticians | Service-retail, 65+ years, multi-outlet | Trust/legitimacy intent cluster (§3.3) and trade-press evidence — the only pilot old and established enough to make "is {brand} reliable" a meaningful query |

Three brands, three distinct visibility profiles (weak / established-product / established-service) — a stronger empirical spread for the paper than two similar food brands would have given, at one extra job's quota cost over a two-brand pilot.

---

## 7. Decisions Log

Everything below was an open question through design review and is now resolved. Kept here as the record of what was decided and why, rather than re-litigated later.

| # | Decision | Resolution |
|---|---|---|
| 1 | Stack | Python/FastAPI as proposed — team's call to override if existing strength points elsewhere; nothing structural depends on this choice. |
| 2 | Distribution channel (§11.4) | **Dev.to for v1.** Simplest publishing API, least OAuth friction — satisfies the requirement without becoming a side project. LinkedIn/X remain a stretch goal. |
| 3 | Ground-truth labeling (§3.4) | **2 annotators, ~10–15% of a job's raw observations (~45–65 responses), Cohen's kappa for inter-annotator agreement**, disagreements adjudicated by a third team member. Validates `MentionDetector` against human judgment and produces the reliability figure the paper needs. |
| 4 | Grounded vs. ungrounded | **Tool use disabled for v1** (§3.5) — kept as a controlled variable rather than an uncontrolled confound in the score. |
| 5 | Detection thresholds (§5.2) | Initial values: θ_presence = 0.10, θ_present = 0.20, θ_co = 0.30, θ_beat = 0.60. Starting guesses, recalibrated after the first real job's data, then frozen. |
| 6 | Phase 1 → Phase 2 switch trigger (§6.3) | **After 3 completed validation jobs**, once per-query mention-rate variance looks stable across them — a data-driven trigger, not a calendar one. |
| 7 | Pilot brands (§6.8) | **Perfume brand + Gajanan Vada Pav + V.A. Mayekar Opticians.** See §6.8 for the roster table and rationale — three distinct visibility profiles (weak / established-product / established-service). |
| 8 | OpenRouter | **Kept in** as the third free-tier LLM provider. Costs nothing extra given the existing abstraction, and it's what lets the paper claim more than a two-provider comparison. |
| 9 | Anthropic credit | **Reserved for final validation/demo runs**, not spent during development. It's a one-time $5 trial credit, non-renewing — Gemini/Groq cover everything development needs. |
| 10 | Web/social discovery sources | **Google CSE + Brave Search API**, both feeding SOURCE gaps only — never the visibility score itself (§1.8). HN/Product Hunt deferred, added only if a future pilot brand's vertical calls for them. |
| 11 | Reddit | **Dropped entirely**, along with its Google-CSE discovery fallback. Removes the project's only multi-week external-approval dependency. |
9. **Anthropic credit allocation** — the $5 trial credit is one-time and non-renewing (confirmed, not an ongoing rate-limited tier). Decide up front how it's spent: reserved entirely for final demo/validation runs, or partially used during development for spot-checking the Scorer against a "smarter" model's output. Once it's gone, it's gone — there's no top-up without paying.

# Product Requirements Document (v3)
## AI Visibility & Brand Intelligence Platform

**Project type:** B.E. AI & Data Science — Final Year Major Project
**Team size:** 4
**Status:** Current — supersedes v2

**Companion document:** `DESIGN_v1.md` carries the full system architecture, ER model, query-set methodology derivation, and the decisions log behind every change in this revision. This PRD states *what* the system does and why; the design doc states *how*.

---

## 0. Document History

| Version | Change |
|---|---|
| v1 → v2 | Finalized scoring approach, provider tiering, data source selection |
| v2 → v3 | Reddit removed entirely (no longer a data source or a risk). Scoring methodology corrected: unprompted/prompted query split, conditional prominence, per-response share-of-voice, model-version comparability tracking. Gap taxonomy replaced with five detection-driven types. Web/social sources finalized: Google Custom Search + Brave Search added (replacing the Reddit-discovery fallback), scoped strictly to gap evidence, never the score. LLM provider roles finalized: Gemini + Groq as the two scheduled providers, OpenRouter retained as a third free-tier diversity source, Anthropic confirmed as a one-time, non-renewing benchmark credit. Distribution channel fixed to Dev.to for v1. Three real pilot brands selected. Research-paper output reframed as a secondary, optional outcome rather than a parallel core deliverable. |

---

## 1. Executive Summary

Discovery is shifting from traditional search toward AI-assisted discovery — people increasingly ask chatbots and AI-powered search engines questions that used to go to Google. This changes how brands are found, described, and compared, and existing SEO tooling doesn't measure it.

This project builds a system that observes how a brand appears across multiple AI systems and web/social sources, scores that visibility against competitors, identifies content and positioning gaps, and generates explainable, prioritized recommendations — with optional content distribution and ongoing trend tracking. It treats all AI systems as black boxes (no fine-tuning, no internals access) and is explicitly scoped for small businesses, freelancers, and solo professionals rather than enterprise marketing teams.

Documenting the visibility-scoring methodology as it's built is good practice regardless of outcome, and a research paper is a plausible secondary output of that documentation — but it is not a core deliverable, and no scope or deadline in this document depends on it.

---

## 2. Problem Statement

### 2.1 Background
People increasingly ask questions through chatbots, AI assistants, and answer engines rather than typing keywords into a search box. This changes how brands are found, described, and compared online.

### 2.2 The Problem
Traditional SEO alone no longer explains or predicts how a brand shows up in AI-generated responses. Brands need a way to observe this, compare it to competitors, find the gaps behind poor visibility, and act on them.

### 2.3 Why It Exists
LLM-based assistants and AI search systems don't surface information the way traditional indexed search does — there's no keyword ranking to optimize against, no crawlable "position 1," and results vary run to run.

### 2.4 Who Experiences It
Small businesses, freelancers, founders, and independent professionals who want to be discovered, represented accurately, and recommended by AI systems, but lack the tooling or expertise to measure it.

---

## 3. Goals

### 3.1 Primary Goals
- Measure how a brand appears across multiple AI systems and construct its current observed identity.
- Compare brand visibility against competitors and produce a comparable, explainable score.
- Identify gaps behind poor visibility from observed data, backed by evidence.
- Generate prioritized, reasoning-backed recommendations to close those gaps.
- Track visibility changes over time and show improvement/decline/stability, with an honest account of statistical uncertainty.

### 3.2 Secondary Goals
- Support content distribution to at least one social/publishing channel.
- Keep the system modular enough to add providers/channels without redesign.
- Simulate a realistic, professional end-to-end product workflow.

### 3.3 Engineering Goals
- Clean, explainable architecture with documented tradeoffs at every major decision point.
- Security, maintainability, and test coverage from the start, not bolted on.
- Realistic scope for 4 students working without a fixed calendar plan.
- Quality bar suitable for internship-level technical evaluation.

### 3.4 Secondary Goal: Research Documentation (Optional)
Collecting evaluation data (manually-labeled ground truth, tracked runs over time) and documenting methodology decisions as they're made costs nothing extra beyond normal development discipline, and keeps the option of a research paper open. It is not a scoped deliverable, has no dedicated milestones, and nothing else in this document depends on it existing.

---

## 4. Non-Goals

- Not a general-purpose marketing platform.
- Not a replacement for SEO — complements existing SEO workflows.
- Does not reverse-engineer, probe internals of, or fine-tune any LLM — black-box observation only.
- Not unrestricted, web-scale crawling.
- Not designed for high-scale production workloads (millions of users/queries).
- Not fully autonomous marketing — every external publishing action requires human approval.
- Not a guarantee that improved measured visibility causes improved business outcomes — the system reports a visibility signal, not a business-outcome prediction, and never presents recommendation → visibility change as causal (§13.2, Tracking).
- Not a general web-search or SEO-ranking tool — search-engine data collected by the system feeds gap evidence only and never contributes to the visibility score itself (§10.6).

---

## 5. Users & Actors

### 5.1 Primary User
Small business owner / freelancer / self-employed professional.

### 5.2 Internal (System) Actors
| Actor | Responsibility |
|---|---|
| Data Collection Layer | Queries LLM providers and web/social sources, stores raw observations |
| Analysis Engine | Normalizes data, detects mentions/gaps, computes the visibility score |
| Recommendation Engine | Converts detected gaps into prioritized, reasoned, evidence-linked actions |
| Distribution Module | Prepares and (with approval) publishes content to supported channels |
| Tracking Module | Reruns analyses on schedule, stores history, computes trend direction with uncertainty bounds |
| Admin / Operator | Configures providers, keys, schedules; manages retries and audit logs |

### 5.3 External Actors
- **LLM providers** — Gemini, Groq, OpenRouter (scheduled loop); Anthropic (benchmark only). See §8.
- **Web/social sources** — blogs/web, YouTube, Google Custom Search, Brave Search. See §9.
- **Social platforms** — receive distribution content where supported (Dev.to for v1).

---

## 6. Assumptions

- The brand being analyzed has a pre-existing, real-world identity — not built from scratch by the system.
- Publicly observable AI responses and web content are sufficient for useful visibility analysis.
- A single query to a single provider is **not** a reliable sample — repeated sampling is required (§10.2).
- Visibility is a probabilistic, observable signal, subject to sampling noise that must be quantified, not ignored (§10.7).
- Improved measured visibility does not necessarily imply improved business outcomes; the system does not claim otherwise.
- Identified gaps can be converted into actionable recommendations in nearly all cases; where they can't, the system says so rather than fabricating one.

---

## 7. Constraints

- Must be buildable by a team of 4 students without a dedicated, large-scale engineering organization behind it.
- Scoped to small businesses, freelancers, and self-employed users — not enterprise.
- External AI/search providers impose rate limits and quotas; OpenRouter's per-model daily cap (~50 requests/model) is the binding constraint on job frequency (§8, §10.2).
- Social platforms may restrict automated publishing or require manual approval.
- LLM responses are non-deterministic and vary run to run — this is treated as a measured property of the system (§10.7), not noise to be hidden.
- Anthropic's API access is a one-time, non-renewing trial credit (~$5) with no ongoing free tier — reserved for benchmark/validation use, never the scheduled collection loop (§8).
- All major architecture decisions must be explainable for academic/technical evaluation.

---

## 8. Provider Strategy (LLM Data Sources)

A deliberately tiered strategy, not a flat list — each provider plays a distinct, finalized role.

| Tier | Provider | Model(s) | Free tier characteristics | Role in system |
|---|---|---|---|---|
| Primary | **Google Gemini** | Flash / Flash-Lite | ~10–15 RPM, 250–1,000 req/day, no card, doesn't expire | High-frequency scheduled tracking runs |
| Secondary | **Groq** | Llama 4 / GPT-OSS-120B | ~30 RPM, ~1,000 req/day | Architecturally distinct model family — strengthens cross-provider signal |
| Tertiary | **OpenRouter** | ~14 free-routed models (Mistral, Gemma, Llama variants) | ~50 req/day per model | Extra model diversity via one API. **Confirmed retained** — the tightest quota constraint in the system, but the one that makes a genuine model-diversity claim possible |
| Benchmark | **Anthropic Claude** | Claude, via a one-time trial credit | **Confirmed: one-time, non-renewing ~$5 trial credit. Not an ongoing tier at any spend level.** | Spot-check / benchmark only — never the scheduled loop. Reserved entirely for final validation and demo runs; not spent during development |

**Explicitly excluded:** OpenAI (no standing free tier — free access requires opting into data-sharing for a capped daily allowance, unsuitable for a scheduled pipeline), Perplexity (paid from first request, no free tier), Bing Search API (fully retired by Microsoft, August 2025 — not available at any price).

### 8.1 Provider Abstraction Requirement
LLM providers and web/social sources sit behind two role-appropriate interfaces (`LLMProvider`, `SourceCollector` — full spec in the companion design doc), both returning a shared result envelope, so:
- Adding/removing a provider or source is a configuration change, not a code change to the Analysis Engine.
- The system can lose access to any one provider or source (quota exhaustion, credit depletion, outage) without breaking the pipeline — direct implementation of the graceful-degradation requirement (§12).

### 8.2 Sampling Strategy
A single query to a single provider is not a trustworthy sample of what that provider "typically" says. The system runs each query multiple times per provider and treats presence as a **rate**, not a binary — every individual raw response is stored, with aggregation happening at analysis time.

**Sampling runs in two phases**, because sample count and query count trade off against each other for statistical power (full derivation in the design doc, §6.3):

| Phase | Samples per query (N) | Unprompted queries (Q) | Purpose |
|---|---|---|---|
| Validation | 5 | 20 | Characterizes within-query variance — needed to know how reliable the instrument is before trusting a trend |
| Tracking loop | 3 | ~33 | Same total quota cost, but more query clusters gives materially tighter trend-detection power (§10.7) |

The switch from validation to tracking-loop sampling happens once within-query variance looks stable across several completed validation jobs — a data-driven trigger, not a fixed date — and constitutes a comparability event (§10.5): it starts a new baseline, never silently splices onto prior history.

---

## 9. Data Source Strategy (Web & Social)

Reddit is **out of scope for v1** — removed entirely, along with the search-engine discovery mechanism that existed only to find Reddit threads. This removes the project's only external dependency with a multi-week manual-approval lead time.

| Source | Feasibility | Access method | Role |
|---|---|---|---|
| **Blogs / general web** | High | Standard scraping (respecting `robots.txt`) or RSS | Primary web corpus — no API dependency |
| **YouTube** | High | Official YouTube Data API v3 | Video corpus — search, metadata, comments |
| **Google Custom Search JSON API** | High | Free tier, 100 queries/day | Category-wide SERP discovery — "what ranks for this category" |
| **Brave Search API** | High | Free tier, ~1,000 queries/month | Independent-index cross-check of Google CSE; two engines agreeing a source dominates a category is stronger evidence than either alone |
| **Instagram** | Excluded from v1 | — | No general "search brand mentions" endpoint in the official Graph API (business/creator accounts you manage only); unauthorized scraping violates platform terms and is technically fragile. Documented as a known limitation and future-work item, not built |

**Search-engine data is scoped strictly to gap evidence, never the visibility score.** The premise of this project (§2.2) is that traditional SERP ranking no longer explains AI-mediated discovery. Feeding Google CSE / Brave results into the composite score would quietly turn the system back into a conventional SEO tool. These sources exist to produce evidence like "these six listicles and four videos dominate this category and none mention the brand" — actionable, but never part of Coverage, Prominence, or Share of Voice.

**Vertical-conditional, not built by default:** Hacker News (Algolia Search API, fully free) and Product Hunt (free tier) are viable additions if a pilot brand is a dev tool or SaaS product — none of the three pilot brands (§9.2) currently are, so these stay documented but unbuilt, addable as configuration when a relevant brand justifies them.

### 9.1 Design Requirement
Every data source — LLM provider or web/social source — must be able to fail, be rate-limited, or be entirely absent (e.g., Instagram) **without breaking the analysis job**. The job proceeds with whatever sources succeeded and reports the rest as unavailable in its status.

### 9.2 Pilot Brands

Three real, currently-tracked brands, chosen for distinct visibility profiles rather than similarity:

| Brand | Category | Why it was chosen |
|---|---|---|
| A local perfume brand | Product, currently weak online presence | Only pilot with a direct relationship — the sole brand exercising the full distribution-approval loop (§13.2) with a real human able to approve a real publish action |
| Gajanan Vada Pav | Single-item street food, established, multi-outlet, has editorial listicle coverage | Exercises discovery-intent and local-intent query clusters against a brand with genuine (if narrow) existing visibility |
| V.A. Mayekar Opticians | Service-retail, 65+ years, multi-outlet, has trade-press coverage | The only pilot old and established enough to make trust/legitimacy queries ("is {brand} reliable") meaningful — exercises the prompted-query trust cluster no food brand can |

---

## 10. Visibility Scoring Methodology

### 10.1 Query Set Structure: Unprompted / Prompted Split

Every query set is split into two subsets, and this split is what Coverage is actually computed over:

| | Unprompted | Prompted |
|---|---|---|
| Brand name in query | No | Yes |
| Measures | Whether AI systems surface the brand unaided | Whether AI systems know the brand and describe it correctly |
| Feeds | **Visibility score** (Coverage, Prominence, SoV) | Identity accuracy, gap detection |
| Expected coverage | Low for most small businesses — this is the signal | ~1.0 by construction — carries no visibility information on its own |

A query set that mixed both into one Coverage denominator would measure query-writing, not visibility — a query containing the brand's own name makes a mention near-guaranteed regardless of actual AI visibility. Both subsets are collected and stored; only the unprompted subset enters the score.

### 10.2 Signal Set

| Signal | What it captures | Status |
|---|---|---|
| Coverage | % of unprompted (query, provider, sample) triples where the brand is mentioned | v1 |
| Prominence | Where in the response the brand appears — **computed only over responses where it was mentioned** | v1 |
| Share of Voice | Brand presence ÷ (brand OR competitor presence) across unprompted responses, counted per-response | v1 |
| Sentiment | Favorable / neutral / negative framing of the mention | v2 |
| Cross-provider consistency | Number of distinct providers where the brand appears, out of total queried | v2 |

**Why sentiment and consistency are deferred to v2:** Coverage, Prominence, and Share of Voice compute directly from raw observations already being collected — no extra model calls, no extra failure surface. Sentiment requires an additional LLM classification call or a fragile lexicon approach; cross-provider consistency is only meaningful once the sampling strategy is proven reliable across providers. Both are real signals worth adding once the core pipeline is validated.

### 10.3 Prominence — Conditional, Not Zero-Filled

Prominence is undefined, not zero, for a response where the brand wasn't mentioned — scoring absence as 0 would double-count it, since it's already captured by Coverage, and would silently corrupt the composite's weighting. Prominence is the mean of a banded score (sole option named / first of several / rank 2–3 / rank 4+ or buried / passing mention) computed only over mentioned responses. When Coverage is 0 for a brand, Prominence is reported as undefined and the composite falls back to a re-normalized two-component score, with the UI stating this explicitly rather than showing a misleading 0.

### 10.4 Share of Voice — Per-Response Presence

```
SoV = (# unprompted responses mentioning the brand)
    / (# unprompted responses mentioning the brand OR any tracked competitor)
```

Counted as presence per response, not occurrence count — a response repeating the brand's name three times shouldn't outscore one that names it once and describes it well. Responses naming no tracked entity at all are excluded from the denominator, since including them would deflate every brand's SoV by an amount that varies with provider chattiness rather than competitive position.

### 10.5 Comparability

A score is only meaningful across runs when computed against the **same query-set version, sampling configuration, and resolved model versions.** Model aliases (e.g. a provider's "flash" tier) are pointers a provider can silently update; an unrecorded version change invalidates a trend line exactly as much as a changed query set does. The system stores a **comparability key** — a hash of query-set version, sampling config, and resolved model versions — on every tracked run, and the trend view groups strictly by this key, rendering a visible discontinuity marker at boundaries rather than connecting across them.

### 10.6 Composite Formula (v1)

```
VisibilityScore = 0.4 · Coverage + 0.3 · Prominence + 0.3 · ShareOfVoice
```

- Each component normalized to [0, 1] before weighting; final score reported 0–100.
- The component breakdown, including a per-provider Coverage split, is always preserved alongside the final score — this is what makes recommendations explainable and what surfaces provider-specific gaps (a brand present on one provider and absent on another is a materially different situation than one absent on both, and the composite alone hides that).
- Weights are a deliberate, qualitatively justified design decision (Coverage weighted highest because prominence/share-of-voice are meaningless if the brand isn't present at all), not statistically learned — this keeps the score transparent and defensible, and is locked after initial validation.

### 10.7 Statistical Uncertainty

Coverage over N samples × Q queries × P providers is **not** N×Q×P independent observations — samples within a query are strongly correlated, so effective sample size is much closer to Q than to the raw call count. At Q=20, the 95% confidence interval on Coverage is roughly ±22 points, not the ±6 points a naive independence assumption would suggest.

The system computes this correctly via a **cluster bootstrap** (resampling queries, not individual calls, and recomputing the composite across resamples) and reports every score and every tracked trend with a confidence interval, never a bare point estimate. Trend direction (§13.2, Tracking) is decided by whether confidence intervals overlap between runs, not by whether the point estimate moved — "no significant change" is the honest default, not a fallback.

---

## 11. Functional Requirements

### 11.1 Data Collection
- Accept a brand name, identity, or target profile as input.
- Query multiple AI providers (§8) and web/social sources (§9) using a fixed, versioned, unprompted/prompted query set per brand (§10.1).
- Sample each query per the current phase's N (§8.2).
- Store every raw observation, including source, resolved model version, timestamp, and query context.
- Allow partial collection (some sources unavailable) without blocking the job.

### 11.2 Analysis
- Normalize all collected data into a consistent internal schema regardless of source.
- Detect brand mentions, competitor mentions, and positioning patterns using deterministic string/alias matching — not an LLM classifier — so detection is reproducible and independently testable (§11.6).
- Compute the v1 visibility score (§10) with full component breakdown, per-provider split, and confidence interval.
- Compare target brand against selected competitors on the same signals.
- Identify gaps from one of five detection-driven types (§11.3), each backed by specific supporting evidence.
- Explicitly distinguish observed facts (directly present in raw data) from inferred interpretations.

### 11.3 Gap Detection

Gap types are derived directly from the score breakdown and the web/social evidence layer, not from abstract marketing categories — each has a computable detection rule:

| Type | Detected when | Evidence source |
|---|---|---|
| **Presence** | Coverage at or below threshold for an intent cluster or a provider | Unprompted subset |
| **Prominence** | Coverage adequate but mean rank is poor | Rank distribution |
| **Representation** | Prompted responses disagree with the brand's actual profile, or disagree with each other | Prompted subset |
| **Competitive** | A competitor co-occurs frequently and out-ranks the brand within those co-occurrences | Per-competitor SoV |
| **Source** | Domains/videos dominant in the category's web layer don't mention the brand | Blog/web + YouTube + Google CSE + Brave |

Detection thresholds are versioned configuration, not hardcoded; initial values are set from the first real analysis run and frozen thereafter.

### 11.4 Recommendation
- Generate prioritized recommendations from detected gaps only — an LLM never introduces a gap, it drafts reasoning and an action for one the deterministic detector already found.
- Every recommendation uses an action from a bounded, closed vocabulary mapped to content / messaging / distribution types — free-text actions are rejected.
- Priority is computed from a counterfactual score-impact simulation (re-running the scorer against a hypothetical gap closure), not model judgment.
- Preserve and expose the reasoning chain behind every recommendation, traceable to source evidence — validated server-side, since models will fabricate evidence references if not checked.
- Record user decisions (approve / reject / save for later) per recommendation.
- Where no valid recommendation can be produced for a gap with evidence, persist it as observed-only with the reason recorded, rather than fabricating an action.

### 11.5 Distribution
- Prepare and publish content to **Dev.to** for v1 (§13.2) — confirmed as the launch channel for its minimal OAuth friction. Additional channels are a stretch goal.
- Require explicit human approval before any external publish action.
- Log every distribution attempt, its outcome, and the content involved.
- If Dev.to is unavailable, allow manual export of the prepared content rather than blocking the user.

### 11.6 Tracking
- Support both on-demand and scheduled reruns of analysis.
- Store every run as a `TrackingSnapshot`, tied to its exact comparability key (§10.5).
- Compute trend direction only within a constant comparability key, using a cluster bootstrap confidence interval (§10.7): two-run comparisons report "change detected" or "no change detected" by CI overlap; four or more snapshots use a Theil–Sen slope, robust to a single anomalous run, with direction reported only when its bootstrap CI excludes zero.
- Display which score component drove any reported change, and per-intent coverage over time, not just the composite delta.
- Never assert that a change in visibility was caused by an approved recommendation — display temporal coincidence via annotation markers only.

### 11.7 Administration
- Configure provider credentials, schedules, and analysis settings.
- Support manual reprocessing/retry of failed jobs from the last valid checkpoint.
- Track per-provider usage/cost, with particular attention to OpenRouter's tight per-model daily cap and the finite, non-renewing Anthropic credit.
- Maintain audit logs for administrative actions, approval events, retries, and publishing attempts.
- Support a ground-truth labeling workflow: sampling ~10–15% of a job's raw observations, recording independent labels from two annotators, and computing inter-annotator agreement (Cohen's kappa) — the basis for validating the deterministic detector against human judgment.

---

## 12. Non-Functional Requirements

- Handle partial provider or source failure without collapsing the full workflow.
- Degrade gracefully when any source is unavailable, rate-limited, or intentionally excluded (e.g., Instagram).
- Allow new providers or sources to be added via configuration, not redesign (§8.1).
- Never expose sensitive brand information, credentials, or provider keys in the frontend or logs.
- Expose logs for each workflow stage, with correlation IDs for traceability.
- Expose metrics for failures, latency, retries, success rates, and per-provider cost/quota consumption.
- Make every recommendation and score traceable back to the raw evidence that produced it, down to individual mention-level evidence, not just the job level.
- Report every score and trend with its confidence interval — never a bare point estimate presented as certain.
- Preserve raw and intermediate data even when later stages fail, so partial runs are still inspectable.

---

## 13. User Interaction Flow

### 13.1 Principles
- Guide users through analysis → review → recommendation → distribution in a clear sequence.
- Keep long-running jobs visible with real-time progress, not a spinner with no feedback.
- Let users inspect evidence before accepting recommendations or approving publication.
- Present uncertainty honestly — a trend claim always carries its confidence interval in the UI, not just the headline number.

### 13.2 Flow Stages

**Brand Setup**
1. User enters brand name/identity, optionally description, audience, product details, competitors.
2. System validates input, creates a brand record and a versioned unprompted/prompted query set.
3. System confirms setup and offers to begin analysis.

**Analysis Run**
1. User starts an analysis; system creates a job and begins sampled, multi-source collection.
2. System shows live progress per source/provider, including any that are unavailable.
3. System stores results as they arrive and presents a full summary with evidence, confidence interval, and status once complete.

**Competitor Comparison**
1. User selects competitors (locked into the versioned set for comparability).
2. System computes and displays relative visibility and standing across the same signals.
3. User can inspect source-level evidence behind any comparison point.

**Recommendation Review**
1. System generates recommendations from detected gaps, each typed per §11.3.
2. User reviews the list with reasoning, supporting evidence, and simulated score impact per item.
3. User approves, rejects, or saves each; system records the decision.

**Content Distribution**
1. User selects an approved recommendation or content draft and a channel (Dev.to for v1).
2. System prepares the content.
3. User approves publishing (required).
4. System publishes or exports, and records the outcome.

**Tracking & Monitoring**
1. User schedules recurring analysis.
2. System runs on schedule, stores each run as a snapshot tied to its comparability key.
3. User views trend comparisons with confidence intervals, component-level breakdown, and annotation markers for recommendations acted on and comparability boundaries crossed.

---

## 14. Data Model (Entities)

Summary view — full ER model and field-level detail in the companion design document.

| Entity | Key fields | Notes |
|---|---|---|
| **Brand** | id, name, description, audience, product_details | Root entity |
| **TrackedEntity** | id, brand_id, kind (self / competitor / discovered), name | Unifies brand and competitors; `discovered` captures competitors the system finds that the user never listed |
| **QuerySet** | id, brand_id, version, sampling_config, content_hash, frozen_at | Immutable once frozen; a version change starts a new baseline |
| **Query** | id, query_set_id, text, intent_type, is_brand_named | First-class table (not an array) so raw observations can reference individual queries |
| **Provider / ProviderModel** | id, name, tier, resolved_version, daily_quota | Model version resolved and stored per call, not just the alias |
| **AnalysisJob** | id, brand_id, query_set_id, status, correlation_id | status ∈ {queued, running, partial, completed, failed} |
| **RawObservation** | id, job_id, provider_model_id, query_id, sample_index, response_text, model_version | One row per sampled call, never overwritten |
| **EntityMention** | id, observation_id, entity_id, rank, char_start/end, prominence_band | The evidence chain — every score number decomposes into rows here |
| **AnalysisResult** | id, job_id, coverage, prominence, share_of_voice, composite_score, ci_low, ci_high, breakdown_json | Includes per-provider split; links back to contributing observations |
| **Gap** | id, job_id, type (presence / prominence / representation / competitive / source), evidence_refs, is_inferred | Type set per §11.3 |
| **Recommendation** | id, gap_id (NOT NULL), type, priority, reasoning, evidence_refs, decision_status | No recommendation exists without a traceable origin |
| **DistributionEvent** | id, recommendation_id, channel, content, approval_status, outcome | Logged regardless of success/failure |
| **TrackingSnapshot** | id, brand_id, job_id, comparability_key, composite_score, ci_low, ci_high, breakdown_json | Powers trend view; groups strictly by comparability key |
| **ProviderUsageLedger** | id, provider_id, usage_date, calls_made, cost_incurred, credit_remaining | Durable quota/cost accounting, incl. the finite Anthropic credit |
| **AuditLogEntry** | id, actor, action, target_ref, timestamp, context | Admin actions, approvals, retries, publishing attempts |

---

## 15. Error Handling

### 15.1 General Principles
- Detect and report errors at the smallest practical workflow stage.
- Preserve partial results rather than discarding an entire run.
- Distinguish user input errors, provider/source failures, and internal processing failures.
- Return clear, actionable error messages to the user.
- Log all errors with enough context for debugging and audit, without leaking secrets.

### 15.2 Incomplete or Invalid Input
- Reject requests with missing required fields, naming which fields are incomplete.
- Request additional context if the brand name/profile is too vague to analyze meaningfully.
- Proceed without competitor input only when comparison is optional; otherwise reject.

### 15.3 Ambiguous Brand Identity
- Flag ambiguity if multiple brands match the same name before analysis proceeds.
- Request disambiguating information (domain, description, category, location, competitors).
- Stop rather than produce misleading results if ambiguity can't be resolved automatically.

### 15.4 Provider / Source Failure
- Continue with remaining available providers/sources if one fails.
- Mark the job partial/degraded, not failed, when useful results still exist.
- Retry transient failures within configured limits; stop and record the reason after the limit.
- Specific case — **Anthropic credit exhausted**: provider marked unavailable; system continues on Gemini/Groq/OpenRouter. Since the credit is reserved for benchmark/demo use only, this should never occur during the scheduled loop by design, but the system does not depend on that discipline holding.
- Specific case — **OpenRouter per-model quota exhausted**: expected to be the most frequently hit quota ceiling given its tight daily cap; the circuit breaker opens for that model for the remainder of the run without blocking other providers.

### 15.5 Comparability Events
- A model version change, a query-set version change, or a sampling-phase switch (§8.2) is treated as a **comparability event**, not an error: logged, recorded on the new baseline's comparability key, and rendered as a visible discontinuity marker in the trend view — never silently plotted as continuous history.

### 15.6 Rate Limiting & Quota Exhaustion
- Detect rate limits, back off/retry per configuration.
- Stop further calls to a provider for the current run once its quota is exhausted.
- Surface quota exhaustion in job status, logs, and the admin cost/usage view.
- Avoid uncontrolled retry loops when quota is unavailable.

### 15.7 Distribution & Publishing Failure
- Never publish externally without required approval.
- Record failure and preserve generated content if Dev.to is unavailable or rejects the request.
- Allow manual retry or export where supported.

### 15.8 Internal Processing Failure
- Preserve all completed intermediate data if normalization, extraction, recommendation, or tracking fails mid-run.
- Explicitly mark the failed stage in the job record.
- Allow reprocessing from a valid checkpoint.
- Never silently overwrite previously valid results with incomplete data.

### 15.9 User-Facing Failure Behavior
- Show failed, partial, queued, running, and completed states clearly in the UI.
- Indicate whether a failure is recoverable, and how.
- Expose a job-level summary of what succeeded and what failed, per source.

### 15.10 Logging & Audit
- Every error logged with timestamp, workflow stage, correlation ID, and relevant provider/job identifier.
- No sensitive data written to logs.
- Audit logs record administrative actions, approval events, retries, and publishing attempts.

---

## 16. Acceptance Criteria

| # | Requirement | Acceptance Criteria |
|---|---|---|
| AC-1 | Brand analysis input | Accepts valid input · creates brand record · rejects invalid/empty input with a clear error |
| AC-2 | Multi-source data collection | Queries all configured providers/sources · stores each response separately with provider, resolved model version, timestamp, query context |
| AC-3 | Sampled collection | Coverage computed over the unprompted subset only, as a rate not a binary; prompted subset stored and used for identity/gap analysis, never the score |
| AC-4 | Raw observation storage | Retrievable after ingestion · includes metadata · kept separate from derived data |
| AC-5 | Visibility scoring | Composite computed per §10.6 · component breakdown and confidence interval always available · traceable to individual mention-level evidence |
| AC-6 | Gap identification | Gap items produced from one of the five detection-driven types (§11.3) · each has supporting evidence · observed vs. inferred explicitly distinguished |
| AC-7 | Recommendation reasoning | Every recommendation traceable to its originating gap and evidence · priority derived from a counterfactual score-impact simulation, not model judgment |
| AC-8 | Visibility tracking | Runs on demand and on schedule · historical runs grouped strictly by comparability key · trend direction computed via cluster bootstrap CI, never a bare point-estimate comparison |
| AC-9 | Failure handling | One provider/source failure does not invalidate the job · partial results preserved · failure visible in logs and job status |
| AC-10 | Distribution approval gate | No external publish occurs without explicit user approval · every attempt logged regardless of outcome · Dev.to functions as the v1 channel with manual export fallback |
| AC-11 | Cost/quota visibility | Admin view shows per-provider usage and remaining quota/credit, including OpenRouter's per-model cap and the finite, non-renewing Anthropic credit |
| AC-12 | Detector reliability | Deterministic mention detector's output compared against human-labeled ground truth on a sampled subset · precision/recall and inter-annotator agreement (Cohen's kappa) computed and available |

---

## 17. External Requirements

- Consistent, complete web interface.
- Display job status, results, evidence, errors, and historical trends with confidence intervals.
- Common provider interface supporting multiple LLM providers and web/social sources (§8.1).
- Structured APIs for managing brands, analysis jobs, results, recommendations, distribution, and tracking.
- Normalization layer producing a common internal representation regardless of source.
- Timeouts and bounded retries on all external requests.
- Preservation of successful results when individual providers/sources fail.

---

## 18. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OpenRouter's tight per-model daily cap (~50 req) throttles job frequency | Slower iteration, especially during development | Phased sampling design (§8.2) keeps quota cost flat while improving trend power; cached-response fixtures used during development rather than live calls |
| Anthropic credit spent prematurely | Loses the benchmark provider before final validation | Explicitly reserved for validation/demo only (§8), never the scheduled loop; system functions fully without it regardless |
| Composite score change reported as real when it's sampling noise | False trend claims, undermines credibility | Cluster bootstrap confidence intervals on every score and trend (§10.7); direction reported only when CIs don't overlap |
| Model version drift or query-set change silently invalidates a trend | Misleading longitudinal claims | Comparability key (§10.5) groups trend data strictly; version/query-set changes render as visible discontinuities, never silently connected |
| Scoring formula changes after data collection begins | Invalidates historical trend comparisons | Formula locked after initial validation (§10.6); any change starts a new comparable baseline |
| Instagram data source expected but unavailable | Perceived scope gap in evaluation | Documented as excluded with technical/legal rationale (§9), positioned as future work |
| Distribution scope creep | Engineering time diverted from core analysis/scoring loop | v1 fixed to Dev.to only, chosen specifically for minimal OAuth friction; additional channels explicitly deprioritized |
| Tracking history not started early enough | Insufficient longitudinal data for the trend-view success criterion | Collection loop (Provider adapters + Scorer) starts running against the three pilot brands (§9.2) as soon as those components exist, independent of the rest of the pipeline being built |

---

## 19. Success Criteria

- End-to-end workflow (brand setup → analysis → recommendation → tracking) functions with all three scheduled providers (Gemini, Groq, OpenRouter) and all four web/social sources (blogs/web, YouTube, Google CSE, Brave) integrated.
- System demonstrably survives partial provider/source failure without crashing, visible in the UI.
- Visibility score is explainable — any given score can be traced back to specific supporting observations, down to individual mention-level evidence, on request.
- Demonstrable trend view across the three pilot brands, each showing a distinct visibility profile (weak / established-product / established-service), with confidence intervals and comparability-key grouping.
- Architecture and scoring methodology documented with explicit tradeoffs, suitable for technical evaluation and usable as the basis for a research paper if the team chooses to pursue one.

---

## 20. Explicitly Deferred to v2 / Future Work

- Sentiment and cross-provider consistency signals in the visibility score (§10.2).
- Instagram data collection, pending a viable access method.
- Reddit as a data source, should an approval-gated integration become worth revisiting.
- Multiple simultaneous distribution channels beyond Dev.to.
- Statistically-learned (rather than manually justified) scoring weights.
- Full historical backfill / long-term longitudinal tracking beyond what the pilot brands accumulate.
- Grounded/tool-use-enabled AI responses as a tracked axis, alongside the current tool-use-disabled v1 baseline.
- Vertical-conditional sources (Hacker News, Product Hunt) — addable as configuration if a future pilot brand's category calls for them.

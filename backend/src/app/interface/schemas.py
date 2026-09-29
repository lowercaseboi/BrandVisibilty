"""Pydantic request/response models for the HTTP API (docs/CONTRACT.md §2, §7).

Snapshots are built as plain dicts: the stored record is already contract-shaped
(CONTRACT §5) and `app.interface.snapshots.normalize_snapshot` fills legacy gaps. The
`Snapshot*` / `Observation*` models below describe those payloads for OpenAPI; they allow
extra keys and their routes use `response_model_exclude_unset`, so nothing the normaliser
emits is dropped or added.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

JobStatus = Literal["queued", "running", "completed", "partial", "failed", "cancelled", "interrupted"]


class BrandSummary(BaseModel):
    brand_key: str = Field(examples=["gajanan_vada_pav"])
    brand: str = Field(description="Display name", examples=["Gajanan Vada Pav"])
    has_data: bool = Field(description="True when at least one snapshot is stored for this brand")
    is_pilot: bool = Field(description="True for the three built-in pilot brands")
    question_count: int | None = Field(
        default=None,
        description="Scored questions the next run would ask (same as the question set's scored_count); "
        "null for a brand that only has stored snapshots and no setup",
        examples=[20],
    )


class CreateBrandRequest(BaseModel):
    """Brand setup (PRD §13.2). Validation beyond shape (AC-1) happens in `create_brand`."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Ashok Vada Pav",
                    "category": "vada pav stall",
                    "cities": ["Mumbai"],
                    "audiences": ["office workers", "college students"],
                    "competitors": ["Gajanan Vada Pav", "Aaram Vada Pav"],
                    "aliases": ["Ashok VP"],
                    "jobs_to_be_done": ["get a quick breakfast near the station"],
                    "use_cases": ["office party catering"],
                    "tasks": ["cater vada pav for a birthday party"],
                }
            ]
        }
    )

    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    cities: list[str] = Field(default_factory=list)
    audiences: list[str] = Field(default_factory=list)
    competitors: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    jobs_to_be_done: list[str] = Field(
        default_factory=list,
        description="What customers come to the brand for, e.g. 'get a quick breakfast near the station' "
        "(max 10). Each one adds questions, so a brand with none gets a thin question set.",
    )
    use_cases: list[str] = Field(
        default_factory=list,
        description="Occasions the product is bought for, e.g. 'office party catering' (max 10)",
    )
    tasks: list[str] = Field(
        default_factory=list,
        description="Jobs a customer might hire the brand to do, e.g. 'cater vada pav for a birthday party' (max 10)",
    )


class BrandDeleteResponse(BaseModel):
    brand_key: str
    deleted: bool = True


class BrandProfile(BaseModel):
    """A brand's full saved setup (PRD §13.2). Returned by `GET /brands/{brand_key}` for a
    pilot (read from its built-in config) or a user-created brand (read from
    `brands.json`); a legacy brand that only has stored snapshots has no profile (404)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "brand_key": "gajanan_vada_pav",
                    "brand": "Gajanan Vada Pav",
                    "is_pilot": True,
                    "category": "vada pav outlet",
                    "cities": ["Mumbai"],
                    "competitors": ["Ashok Vada Pav", "Aaram Vada Pav", "Graduate Vada Pav", "Jumbo King", "Goli Vada Pav"],
                    "aliases": ["Gajanan"],
                    "audiences": ["street food lovers", "office-goers", "students"],
                    "jobs_to_be_done": ["find a quick, tasty street food snack in Mumbai"],
                }
            ]
        }
    )

    brand_key: str = Field(examples=["gajanan_vada_pav"])
    brand: str = Field(description="Display name", examples=["Gajanan Vada Pav"])
    is_pilot: bool = Field(description="True for the three built-in pilot brands (read-only)")
    category: str
    cities: list[str]
    competitors: list[str]
    aliases: list[str] = Field(description="Extra names for the brand itself, beyond its display name")
    audiences: list[str]
    jobs_to_be_done: list[str]


class UpdateBrandRequest(BaseModel):
    """`PUT /brands/{brand_key}` body. Validated exactly like `CreateBrandRequest`; 403 for
    a pilot brand, 404 unknown, 422 invalid. `brand_key` itself never changes, even when
    `name` does. Changing `competitors` or `aliases` starts a new trend baseline
    (comparability_key) for runs made after the edit — see `tracking.snapshot.comparability_key`."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Ashok Vada Pav",
                    "category": "vada pav stall",
                    "cities": ["Mumbai", "Thane"],
                    "audiences": ["office workers", "college students"],
                    "competitors": ["Gajanan Vada Pav", "Aaram Vada Pav"],
                    "aliases": ["Ashok VP"],
                    "jobs_to_be_done": ["get a quick breakfast near the station"],
                }
            ]
        }
    )

    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    cities: list[str] = Field(default_factory=list)
    audiences: list[str] = Field(default_factory=list)
    competitors: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    jobs_to_be_done: list[str] = Field(default_factory=list)


class RunRequest(BaseModel):
    providers: str = Field(
        default="auto",
        description='"auto" = every configured live provider (falls back to "synthetic" if none); '
        'or a comma-separated list such as "gemini,groq" or "synthetic".',
        examples=["auto", "synthetic", "gemini,groq"],
    )
    samples: int = Field(
        default=3,
        ge=1,
        le=10,
        description="How many times each question is asked per provider. AI answers vary from one ask to the "
        "next, so more answers give a steadier score and a narrower confidence range, at the cost of more API calls.",
    )
    round: int | None = Field(
        default=None,
        ge=1,
        description="Synthetic demo data only: which simulated week to generate. Omit (null) to pick the next "
        "round automatically; real providers ignore it.",
    )


QuestionSource = Literal["template", "custom"]


class QuestionIn(BaseModel):
    text: str = Field(description="The question, as a customer would type it (3-200 characters)")
    intent_type: str = Field(default="custom", description='A template intent type, or "custom"')
    source: QuestionSource = "custom"
    enabled: bool = True


class SaveQuestionsRequest(BaseModel):
    questions: list[QuestionIn]


class Question(BaseModel):
    id: int = Field(description="Position in the list (stable until the list is saved again)")
    text: str
    intent_type: str
    source: QuestionSource
    enabled: bool
    names_brand: bool = Field(description="True when the question mentions the brand itself")
    scored: bool = Field(description="enabled and not names_brand: counts toward Coverage, Prominence and SoV")


class QuestionSet(BaseModel):
    brand_key: str
    customized: bool = Field(description="True when the brand has a saved (edited) question list")
    questions: list[Question]
    scored_count: int = Field(description="Enabled questions that count toward scores")
    unscored_count: int = Field(description="Enabled questions that name the brand: asked, but not scored")
    content_hash: str = Field(
        description="Content hash of the query set the next run would use. Equals that run's snapshot "
        "query_set_content_hash; differs from the latest snapshot's when the questions changed since"
    )


ProviderState = Literal["queued", "running", "waiting", "skipped", "done"]


class ProviderProgress(BaseModel):
    """One provider's share of a running job (CONTRACT §7)."""

    provider_id: str = Field(examples=["groq"])
    label: str = Field(examples=["Groq"])
    done: int = Field(description="Planned calls finished for this provider (skipped calls count as done)")
    total: int = Field(description="Planned calls for this provider")
    succeeded: int
    failed: int
    state: ProviderState
    note: str | None = Field(
        default=None,
        description="Short human status, e.g. 'waiting 40s — rate limited' or "
        "'auto-skipped after 2 min without an answer'",
    )
    wait_seconds: int | None = Field(
        default=None,
        description="While state is 'waiting': the current retry wait in whole seconds (rounded up); "
        "otherwise null",
        examples=[40, None],
    )
    skip_reason: Literal["user", "auto", "failures", "unavailable"] | None = Field(
        default=None, description='Why the provider was skipped (state == "skipped"), else null'
    )


class Job(BaseModel):
    job_id: str
    brand_key: str
    status: JobStatus
    message: str
    done: int
    total: int
    run_id: str | None = None
    error: str | None = None
    providers: list[ProviderProgress] = Field(default_factory=list)


class SkipRequest(BaseModel):
    provider_id: str | None = Field(
        default=None,
        description="Provider to stop calling; null = skip every remaining call and score what was collected",
        examples=["groq", None],
    )


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ProviderInfoOut(BaseModel):
    provider_id: str
    label: str
    configured: bool
    model: str | None
    kind: Literal["live", "offline"]


TrendStatus = Literal[
    "insufficient_data", "no_change_detected", "change_detected", "no_clear_trend", "improving", "declining"
]


class TrendVerdict(BaseModel):
    """AC-8 / PRD §11.6: what may honestly be said about the score's movement, computed only
    over the latest comparable segment (same comparability key), admissible runs only.
    All scores and slopes are on the 0–100 composite scale."""

    status: TrendStatus = Field(
        description='"insufficient_data" (<2 comparable runs); 2–3 runs: "change_detected" / '
        '"no_change_detected" by CI overlap of the last two; 4+ runs: "improving" / "declining" only when '
        'the Theil–Sen slope\'s bootstrap CI excludes 0, else "no_clear_trend"'
    )
    method: Literal["none", "ci_overlap", "theil_sen"]
    direction: Literal["up", "down"] | None
    n_points: int = Field(description="Admissible runs in the latest comparable segment (the ones analysed)")
    n_excluded: int = Field(description="Inadmissible runs in that segment, left out")
    comparability_key: str | None
    first_run_id: str | None = None
    last_run_id: str | None = None
    previous_score: float | None = None
    previous_ci_low: float | None = None
    previous_ci_high: float | None = None
    latest_score: float | None = None
    latest_ci_low: float | None = None
    latest_ci_high: float | None = None
    delta: float | None = Field(default=None, description="latest_score - previous_score (ci_overlap only)")
    x_unit: Literal["day", "run"] | None = Field(
        default=None,
        description='"day" = days since the segment\'s first run; "run" = run index, used when runs are '
        "packed less than a day apart",
    )
    slope: float | None = Field(default=None, description="Theil–Sen slope, points per x_unit")
    slope_ci_low: float | None = None
    slope_ci_high: float | None = None
    slope_per_week: float | None = Field(default=None, description='slope × 7 (x_unit "day" only)')
    slope_per_week_ci_low: float | None = None
    slope_per_week_ci_high: float | None = None
    span_days: float | None = None
    bootstrap_iterations: int | None = None
    valid_resamples: int | None = None


BoardColumn = Literal["suggested", "saved", "in_progress", "done", "rejected"]


class BoardCardState(BaseModel):
    """Where one grouped suggestion sits on the recommendation board (PRD §11.4). Card keys
    are the frontend's stable suggestion-group key (`action|competitor_id`), which survives
    across runs, so they aren't part of this model — they're the `BoardState.cards` keys."""

    column: BoardColumn
    order: int = Field(description="Position within its column, ascending")
    updated_at: str = Field(description="ISO-8601 timestamp of the last move", examples=["2026-09-28T10:00:00+00:00"])


class BoardState(BaseModel):
    """`GET`/`PUT /brands/{brand_key}/board`. `cards` is `{}` when nothing has been saved
    yet. On `PUT`, `brand_key` here must match the path's brand_key (422 otherwise)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "brand_key": "gajanan_vada_pav",
                    "cards": {
                        "run_more_evidence|ashok_vada_pav": {
                            "column": "in_progress", "order": 0, "updated_at": "2026-09-28T10:00:00+00:00",
                        }
                    },
                }
            ]
        }
    )

    brand_key: str
    cards: dict[str, BoardCardState] = Field(default_factory=dict)


# --------------------------------------------------------------------------- snapshots
# Response models for GET /brands/{k}/snapshots/latest, /snapshots, /runs and
# /snapshots/{run_id}/observations. They mirror `normalize_snapshot`'s output exactly: every
# model allows extra keys (the payload is additive by contract), and the routes serialise with
# `response_model_exclude_unset=True`, so optional fields absent from a record stay absent.


class _OpenModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class SamplingConfig(_OpenModel):
    temperature: float | None = None
    system_prompt: str | None = None
    samples_per_query: int


class ProviderCoverage(_OpenModel):
    provider_id: str
    coverage: float = Field(description="0–1 fraction")
    observation_count: int
    mentioned_count: int


class SnapshotAnalysis(_OpenModel):
    """Scales: `coverage` / `prominence` / `share_of_voice` are 0–1 fractions;
    `composite_score` / `ci_low` / `ci_high` are 0–100 points. The composite is renormalised
    over whichever components are defined (not null)."""

    coverage: float = Field(description="0–1; share of scored responses that mention the brand")
    prominence: float | None = Field(description="0–1; null when the brand is never mentioned")
    share_of_voice: float | None = Field(description="0–1; null when no response names the brand or a competitor")
    composite_score: float = Field(description="0–100 points")
    ci_low: float = Field(description="0–100 points (bootstrap 95% CI)")
    ci_high: float = Field(description="0–100 points (bootstrap 95% CI)")
    per_provider_coverage: list[ProviderCoverage]


class SnapshotGap(_OpenModel):
    gap_id: str
    gap_type: str
    evidence_refs: list[str]
    detail: dict[str, Any]
    is_inferred: bool


class SnapshotRecommendation(_OpenModel):
    recommendation_id: str
    gap_id: str = Field(description="Never null (PRD AC-7): every recommendation traces to a gap")
    action: str | None = None
    action_class: str | None = None
    priority: float | None = None
    delta_composite: float | None = None
    confidence: float | None = None
    effort: int | None = None
    reasoning: str | None = None
    evidence_refs: list[str] | None = None
    drafted_by: str | None = None


class SnapshotAdmission(_OpenModel):
    admissible: bool
    status: str
    reasons: list[str]
    query_coverage: float
    sample_completeness: float
    missing_query_ids: list[str]
    missing_providers: list[str]
    collection_span_days: int
    policy_version: str


class MentionCounts(_OpenModel):
    answers_mentioning: int
    answers_ranked_first: int


class MentionSummaryOut(_OpenModel):
    total_answers: int
    entities: dict[str, MentionCounts]


class Snapshot(_OpenModel):
    """One tracking run, without its raw observations (CONTRACT §5)."""

    brand_key: str
    brand: str
    run_id: str
    status: str = Field(examples=["completed", "partial"])
    data_origin: str = Field(examples=["live", "synthetic", "replay"])
    providers: list[str]
    comparability_key: str
    collection_started_at: str
    collection_completed_at: str
    collection_span_days: int
    query_set_content_hash: str
    query_set_template_version: str
    sampling_config: SamplingConfig
    observation_count: int
    unscored_observation_count: int
    mentioned_count: int
    cluster_count: int
    analysis_result: SnapshotAnalysis
    gaps: list[SnapshotGap]
    recommendations: list[SnapshotRecommendation]
    admission: SnapshotAdmission
    entities: dict[str, str]
    mention_summary: MentionSummaryOut
    trend_verdict: TrendVerdict | None = Field(
        default=None, description="Only on the newest snapshot of a list (and on /snapshots/latest)"
    )


class ObservationMention(_OpenModel):
    entity_id: str
    entity_kind: str
    rank: int | None = None
    is_passing_mention: bool | None = None
    char_start: int | None = None
    char_end: int | None = None


class Observation(_OpenModel):
    observation_id: str
    provider_id: str
    query_id: str
    query_text: str
    intent_type: str | None
    model_version: str | None
    response_text: str
    mentions: list[ObservationMention]
    scored: bool = Field(description="False for brand-named questions: shown, never scored")


class ObservationsResponse(_OpenModel):
    """`GET /brands/{brand_key}/snapshots/{run_id}/observations` — the evidence behind every gap."""

    brand_key: str
    run_id: str
    entities: dict[str, str]
    raw_observations: list[Observation]

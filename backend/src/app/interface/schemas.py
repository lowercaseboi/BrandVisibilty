"""Pydantic request/response models for the HTTP API (docs/CONTRACT.md §2, §7).

Snapshots are returned as plain dicts: the stored record is already contract-shaped
(CONTRACT §5) and `app.interface.snapshots.normalize_snapshot` fills legacy gaps.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

JobStatus = Literal["queued", "running", "completed", "partial", "failed", "cancelled"]


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

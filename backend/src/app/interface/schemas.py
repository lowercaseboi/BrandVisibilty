"""Pydantic request/response models for the HTTP API (docs/CONTRACT.md §2, §7).

Snapshots are returned as plain dicts: the stored record is already contract-shaped
(CONTRACT §5) and `app.interface.snapshots.normalize_snapshot` fills legacy gaps.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

JobStatus = Literal["queued", "running", "completed", "partial", "failed"]


class BrandSummary(BaseModel):
    brand_key: str = Field(examples=["gajanan_vada_pav"])
    brand: str = Field(description="Display name", examples=["Gajanan Vada Pav"])
    has_data: bool = Field(description="True when at least one snapshot is stored for this brand")
    is_pilot: bool = Field(description="True for the three built-in pilot brands")


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
                    "jobs_to_be_done": ["quick breakfast"],
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
    samples: int = Field(default=3, ge=1, le=10, description="Samples per unprompted query per provider")
    round: int = Field(default=1, ge=1, description="Round number (synthetic provider uses it to vary output)")


class Job(BaseModel):
    job_id: str
    brand_key: str
    status: JobStatus
    message: str
    done: int
    total: int
    run_id: str | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ProviderInfoOut(BaseModel):
    provider_id: str
    label: str
    configured: bool
    model: str | None
    kind: Literal["live", "offline"]

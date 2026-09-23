"""Diagnostic matrix (DESIGN_v1 §5.3): Gap -> (diagnosis text, action class, bounded action).

Pure deterministic dispatch, no LLM — reads only the numbers `GapDetector` already put in
`Gap.detail`, never re-derives coverage/prominence/SoV itself.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.analysis.types import Gap
from app.recommendation.action_vocabulary import ActionClass

_SEVERE_PRESENCE_THRESHOLD = 0.02


@dataclass(frozen=True)
class Diagnosis:
    text: str
    action_class: ActionClass
    action: str


def diagnose(gap: Gap) -> Diagnosis:
    if gap.gap_type == "presence":
        coverage = gap.detail.get("coverage", 0.0)
        if coverage <= _SEVERE_PRESENCE_THRESHOLD:
            return Diagnosis(
                text="No category association exists",
                action_class="distribution",
                action="Submit to directory",
            )
        return Diagnosis(
            text="Weak but present category association",
            action_class="content",
            action="Publish use-case page",
        )

    if gap.gap_type == "prominence":
        return Diagnosis(
            text="Present but buried — rank is poor despite adequate coverage",
            action_class="content",
            action="Publish comparison page",
        )

    if gap.gap_type == "competitive":
        competitor_id = gap.detail.get("competitor_id", "a competitor")
        return Diagnosis(
            text=f"Consistently outranked by {competitor_id} on shared queries",
            action_class="content",
            action="Publish comparison page",
        )

    if gap.gap_type == "representation":
        return Diagnosis(
            text="Model claims disagree with the brand's actual profile, or with each other",
            action_class="messaging",
            action="Correct outdated description",
        )

    if gap.gap_type == "source":
        return Diagnosis(
            text="Dominant category sources don't mention the brand",
            action_class="distribution",
            action="Pitch inclusion in listicle",
        )

    raise ValueError(f"unhandled gap_type {gap.gap_type!r}")

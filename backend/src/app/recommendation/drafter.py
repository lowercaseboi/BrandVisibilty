"""Optional Stage B recommendation drafter (DESIGN_v1 §5.1).

Stage A (gap detection + the template recommendations in `engine.py`) is fully
deterministic and is what the system actually claims. Stage B may rewrite a
recommendation's `reasoning` prose with an LLM for fluency — it must never add,
remove or re-rank recommendations, change the action (closed vocabulary, §5.5)
or touch evidence. It is OFF by default: the MVP ships template reasoning
(`drafted_by="template"`) and no implementation here calls an LLM.

A future implementation returns the new prose; the caller then stores it with
`dataclasses.replace(rec, reasoning=..., drafted_by=<provider_id>)` and re-runs
the validation gate.
"""

from __future__ import annotations

from typing import Protocol

from app.analysis.types import Gap
from app.recommendation.engine import Recommendation


class Drafter(Protocol):
    """Rewrites one recommendation's reasoning prose. Fluency only; non-load-bearing."""

    def draft(self, rec: Recommendation, gap: Gap) -> str: ...

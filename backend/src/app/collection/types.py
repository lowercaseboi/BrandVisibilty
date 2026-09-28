"""The two collection interfaces from DESIGN_v1 §1.3 (resolves C-4).

`LLMProvider` and `SourceCollector` both return the shared `CollectionResult`
envelope so swapping a provider/source is a configuration change, not a code
change to the layers above (PRD §8.1). Only the LLM side is implemented here
for now — it's what the query-template generator's phrasing-expansion step
needs (DESIGN §3.1); `SourceCollector` and the web/social adapters come with
the rest of L2.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol


@dataclass(frozen=True)
class SamplingParams:
    """Reproducibility controls recorded per call (DESIGN §3.5). Temperature is the
    provider default, not 0 — the point is to observe what a typical user sees."""

    temperature: float | None = None  # None = provider default
    system_prompt: str | None = None
    max_output_tokens: int | None = None


@dataclass(frozen=True)
class CollectionResult:
    source_id: str
    source_kind: Literal["llm", "web", "social"]
    model_version: str | None  # resolved, not the alias (C-3)
    payload: str
    latency_ms: int
    token_usage: dict | None = None
    raw_meta: dict = field(default_factory=dict)  # provider-specific, never parsed by L4


@dataclass(frozen=True)
class QuotaState:
    remaining_today: int | None
    daily_limit: int | None
    exhausted: bool = False


class LLMProvider(Protocol):
    def query(self, prompt: str, params: SamplingParams) -> CollectionResult: ...

    def quota_state(self) -> QuotaState: ...


class QuotaExhausted(Exception):
    """A provider's long-window quota (daily tokens/requests) is used up.

    Raised instead of retrying: the quota won't come back within this run, so waiting on it
    only stalls the run and every further call is another rejected request. `resets_in` is
    the provider's Retry-After in seconds when it sent one. The message is safe to show
    (never the request, URL or key).
    """

    def __init__(self, message: str = "daily quota used up", resets_in: float | None = None):
        super().__init__(message)
        self.resets_in = resets_in

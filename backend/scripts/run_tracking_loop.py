"""Minimal real tracking-loop runner (DESIGN_v1 §6.8).

"Tracking history is the only deliverable in this project that cannot be built at the
end... the collection loop (Provider adapters + Scorer) needs to start running against
2-3 real brands as soon as those two pieces exist, independent of whether the
recommendation engine, distribution module, or UI are built yet." Both prerequisites
already exist — this script is the loop, deliberately minimal: no DB, no orchestration,
no Celery. It exists only to stop losing tracking history while the rest of the system
gets built, and is meant to be replaced by the real AnalysisJob/JobService pipeline once
the DB/orchestration layers exist — not a parallel permanent design.

Run: uv run python scripts/run_tracking_loop.py --brand gajanan_vada_pav --samples 2
"""

from __future__ import annotations

import argparse
import json
import random
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.analysis.gap_detector import detect_gaps
from app.analysis.mention_detector import detect_mentions
from app.analysis.scorer import score
from app.analysis.types import EntityAlias, Observation
from app.collection.providers.gemini import GeminiAdapter
from app.collection.types import SamplingParams
from app.config.settings import Settings
from app.querysets.generator import freeze, generate_draft
from app.querysets.templates import BrandParams

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "tracking"

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 4
_BACKOFF_BASE_SECONDS = 2.0
_BACKOFF_CAP_SECONDS = 20.0

SELF_ENTITY_ID = "self"

# PRD §9.2 pilot roster. Only brands with publicly disclosed names/details are wired up
# here — the perfume brand's real identity isn't in the docs, so it's not included yet.
PILOT_BRANDS: dict[str, tuple[BrandParams, tuple[EntityAlias, ...]]] = {
    "gajanan_vada_pav": (
        BrandParams(
            brand="Gajanan Vada Pav",
            category="vada pav outlet",
            audiences=("street food lovers", "office-goers", "students"),
            jobs_to_be_done=("find a quick, tasty street food snack in Mumbai",),
            cities=("Mumbai",),
            tasks=("cater street food for a small event",),
        ),
        (EntityAlias(SELF_ENTITY_ID, "self", ("Gajanan Vada Pav", "Gajanan")),),
    ),
}


def _query_gemini_with_retry(
    adapter: GeminiAdapter, prompt: str, params: SamplingParams
) -> httpx.Response | None:
    """Bounded retry for transient failures (PRD §15.4): timeout/429/5xx retries with
    backoff; anything else propagates immediately — retrying a permanent error just
    burns quota."""
    last_error: Exception = RuntimeError("unreachable")
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return adapter.query(prompt, params)
        except httpx.HTTPStatusError as exc:
            last_error = exc
            if exc.response.status_code not in _RETRYABLE_STATUS or attempt == _MAX_ATTEMPTS:
                raise
        except httpx.TimeoutException as exc:
            last_error = exc
            if attempt == _MAX_ATTEMPTS:
                raise
        backoff = min(_BACKOFF_CAP_SECONDS, _BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
        backoff += random.uniform(0, backoff * 0.25)
        print(f"  transient error ({last_error!r}), retrying in {backoff:.1f}s (attempt {attempt}/{_MAX_ATTEMPTS})")
        time.sleep(backoff)
    raise last_error


def run(brand_key: str, samples: int) -> Path:
    if brand_key not in PILOT_BRANDS:
        raise ValueError(f"Unknown pilot brand {brand_key!r}; known: {sorted(PILOT_BRANDS)}")
    params, alias_table = PILOT_BRANDS[brand_key]

    settings = Settings()
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not configured (checked .env.local/.env) — cannot run a live loop")
    adapter = GeminiAdapter(api_key=settings.gemini_api_key, model=settings.gemini_model)
    sampling_params = SamplingParams()

    # No llm_provider here: skip phrasing expansion for this run to keep call volume down.
    draft = generate_draft(params)
    query_set = freeze(draft)
    unprompted_queries = [q for q in query_set.queries if not q.is_brand_named]

    observations: list[Observation] = []
    raw_records: list[dict] = []
    for query_index, query in enumerate(unprompted_queries):
        for sample_index in range(samples):
            observation_id = f"q{query_index}-s{sample_index}"
            print(f"[{observation_id}] {query.text!r}")
            try:
                result = _query_gemini_with_retry(adapter, query.text, sampling_params)
            except Exception as exc:  # noqa: BLE001 - one failed sample must not kill the run
                print(f"  FAILED after retries: {exc!r}")
                continue

            mentions = detect_mentions(result.payload, alias_table)
            observations.append(
                Observation(
                    observation_id=observation_id,
                    query_id=f"q{query_index}",
                    provider_id="gemini",
                    mentions=mentions,
                    intent_type=query.intent_type,
                )
            )
            raw_records.append(
                {
                    "observation_id": observation_id,
                    "query_text": query.text,
                    "intent_type": query.intent_type,
                    "model_version": result.model_version,
                    "response_text": result.payload,
                    "mentions": [asdict(m) for m in mentions],
                }
            )

    competitor_entity_ids: frozenset[str] = frozenset()
    analysis_result = score(observations, SELF_ENTITY_ID, competitor_entity_ids, rng=random.Random())
    # Best-effort: no prompted subset or source landscape collected by this script yet,
    # so only PRESENCE/PROMINENCE/COMPETITIVE can fire.
    gaps = detect_gaps(observations, SELF_ENTITY_ID, competitor_entity_ids)

    snapshot = {
        "brand_key": brand_key,
        "brand": params.brand,
        "collected_at": datetime.now(UTC).isoformat(),
        "query_set_content_hash": query_set.content_hash,
        "query_set_template_version": query_set.template_set_version,
        "sampling_config": {**query_set.sampling_config, "samples_per_query": samples},
        "observation_count": analysis_result.observation_count,
        "mentioned_count": analysis_result.mentioned_count,
        "analysis_result": {
            "coverage": analysis_result.coverage,
            "prominence": analysis_result.prominence,
            "share_of_voice": analysis_result.share_of_voice,
            "composite_score": analysis_result.composite_score,
            "ci_low": analysis_result.ci_low,
            "ci_high": analysis_result.ci_high,
            "per_provider_coverage": [asdict(b) for b in analysis_result.per_provider_coverage],
        },
        "gaps": [asdict(g) for g in gaps],
        "raw_observations": raw_records,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / f"{brand_key}.jsonl"
    with out_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(snapshot) + "\n")

    print(f"\nWrote snapshot to {out_path}")
    print(
        f"Coverage={analysis_result.coverage:.3f} Prominence={analysis_result.prominence} "
        f"SoV={analysis_result.share_of_voice} Composite={analysis_result.composite_score:.1f} "
        f"CI=[{analysis_result.ci_low:.1f}, {analysis_result.ci_high:.1f}]"
    )
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one real tracking-loop snapshot for a pilot brand.")
    parser.add_argument("--brand", default="gajanan_vada_pav", choices=sorted(PILOT_BRANDS))
    parser.add_argument(
        "--samples",
        type=int,
        default=2,
        help="Samples per unprompted query (default 2, kept low given current API flakiness; §8.2's real N=5 is for once the loop is running smoothly)",
    )
    args = parser.parse_args()
    run(args.brand, args.samples)


if __name__ == "__main__":
    main()

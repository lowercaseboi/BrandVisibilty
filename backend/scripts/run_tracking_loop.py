"""Real tracking-loop runner (DESIGN_v1 §6.8), now backed by the full collection stack
(§1.5 resilience, §3.4 multi-provider, §6.x admissibility) instead of an inline retry loop.

Thin glue only: brand roster, CLI, progress printing, snapshot assembly. All the actual
work — pacing, retry classification, resumable storage, sample-major fan-out, and the
admissibility gate that keeps an incomplete run out of the trend series — lives in
`app.collection` / `app.orchestration` / `app.tracking` and is unit-tested there.

Run: uv run python scripts/run_tracking_loop.py --brand gajanan_vada_pav --samples 5
Replay from disk with zero network calls: add --offline.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from app.analysis.gap_detector import detect_gaps
from app.analysis.scorer import score
from app.analysis.types import EntityAlias
from app.collection.ledger import FileUsageLedger
from app.collection.registry import build_providers
from app.collection.store import FileResponseStore
from app.collection.types import SamplingParams
from app.config.settings import Settings
from app.normalization.observations import to_observations, to_prompted_observations
from app.orchestration.collection_runner import CollectionPlan, collect
from app.querysets.generator import freeze, generate_draft
from app.querysets.templates import BrandParams
from app.tracking.snapshot import AdmissibilityPolicy, comparability_key, evaluate_admission, model_fingerprint

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data" / "tracking"

SELF_ENTITY_ID = "self"

# PRD §9.2 pilot roster. The perfume brand's real identity isn't disclosed in the docs
# (per the original script comment), so it stays unwired here as before. Gajanan Vada Pav
# and V.A. Mayekar Opticians both now carry `competitors` — filling this in is itself a
# comparability event (DESIGN §4.5): it changes `query_set.content_hash` (the
# `alternative_seeking` template was instantiating to zero queries without it, silently
# leaving the unprompted set at Q=17 instead of the specified Q=20) and gives Share of
# Voice a real denominator instead of collapsing to {self}. Doing it now, while the trend
# series holds zero admissible snapshots, is the only free moment (see the hardening plan).
# Keep this key set in sync with app.interface.brand_registry.PILOT_BRANDS.
PILOT_BRANDS: dict[str, tuple[BrandParams, tuple[EntityAlias, ...]]] = {
    "gajanan_vada_pav": (
        BrandParams(
            brand="Gajanan Vada Pav",
            category="vada pav outlet",
            audiences=("street food lovers", "office-goers", "students"),
            competitors=("Ashok Vada Pav", "Aaram Vada Pav", "Anand Stall"),
            jobs_to_be_done=("find a quick, tasty street food snack in Mumbai",),
            cities=("Mumbai", "Thane"),
            tasks=("cater street food for a small event",),
        ),
        (
            EntityAlias(SELF_ENTITY_ID, "self", ("Gajanan Vada Pav", "Gajanan")),
            EntityAlias("competitor_ashok", "competitor", ("Ashok Vada Pav",)),
            EntityAlias("competitor_aaram", "competitor", ("Aaram Vada Pav",)),
            EntityAlias("competitor_anand", "competitor", ("Anand Stall",)),
        ),
    ),
    "mayekar_opticians": (
        BrandParams(
            brand="V.A. Mayekar Opticians",
            category="optician / eyewear store",
            audiences=("eyeglass wearers", "contact lens users", "office-goers"),
            competitors=("Lawrence & Mayo", "Titan Eye+", "Lenskart"),
            jobs_to_be_done=("get an eye checkup and new prescription glasses",),
            cities=("Thane", "Mumbai"),
            tasks=("get prescription glasses for the whole family",),
            use_cases=("everyday prescription glasses", "progressive lenses"),
        ),
        (
            EntityAlias(SELF_ENTITY_ID, "self", ("V.A. Mayekar Opticians", "Mayekar Opticians", "Mayekar")),
            EntityAlias("competitor_lawrence_mayo", "competitor", ("Lawrence & Mayo",)),
            EntityAlias("competitor_titan_eye", "competitor", ("Titan Eye+", "Titan Eye Plus")),
            EntityAlias("competitor_lenskart", "competitor", ("Lenskart",)),
        ),
    ),
}


def _default_run_id() -> str:
    return datetime.now(UTC).strftime("%G-W%V")  # ISO week, e.g. "2026-W36"


def run(
    brand_key: str,
    *,
    samples: int,
    run_id: str,
    provider_ids: tuple[str, ...] | None,
    replay_only: bool,
) -> None:
    if brand_key not in PILOT_BRANDS:
        raise ValueError(f"Unknown pilot brand {brand_key!r}; known: {sorted(PILOT_BRANDS)}")
    params, alias_table = PILOT_BRANDS[brand_key]
    competitor_entity_ids = frozenset(
        entry.entity_id for entry in alias_table if entry.entity_kind == "competitor"
    )

    settings = Settings()
    if provider_ids is not None:
        settings = settings.model_copy(update={"enabled_providers": ",".join(provider_ids)})

    ledger = FileUsageLedger(REPO_ROOT / settings.usage_ledger_path)
    providers = build_providers(settings, ledger=ledger)
    if not providers and not replay_only:
        raise RuntimeError(
            "No provider has a configured API key (checked .env.local/.env for "
            "GEMINI_API_KEY / GROQ_API_KEY) — cannot run a live loop. Use --offline to "
            "replay from an existing store instead."
        )

    # No llm_provider here: skip phrasing expansion to keep call volume down. Canonical
    # (template-filled) text is a valid, reviewable query set on its own.
    draft = generate_draft(params)
    query_set = freeze(draft)

    plan = CollectionPlan(
        brand_key=brand_key,
        run_id=run_id,
        query_set=query_set,
        sampling_params=SamplingParams(),
        providers=providers,
        samples_per_query=samples,
        include_prompted=True,
    )

    store = FileResponseStore(REPO_ROOT / settings.response_store_root / brand_key)

    def on_progress(outcome) -> None:
        print(f"  [{outcome.key.provider_id}:{outcome.key.query_id}-s{outcome.key.sample_index}] {outcome.status}")

    print(f"Collecting {'(replay only) ' if replay_only else ''}run_id={run_id} brand={brand_key} "
          f"providers={[h.limits.provider_id for h in providers]} samples={samples}")
    report = collect(plan, store, replay_only=replay_only, on_progress=on_progress)

    print(
        f"\nCollection done: planned={report.planned} from_cache={report.from_cache} "
        f"newly_collected={report.newly_collected} failed={report.failed} skipped={report.skipped}"
    )
    for key, stats in sorted(report.per_provider.items()):
        print(f"  {key}: planned={stats.planned} ok={stats.ok} cached={stats.cached} "
              f"failed={stats.failed} skipped={stats.skipped} stop_reason={stats.stop_reason}")

    records = list(store.iter_run(run_id=run_id, query_set_hash=query_set.content_hash))
    observations = to_observations(records, alias_table, unprompted_only=True)
    prompted_observations = to_prompted_observations(records)

    analysis_result = score(list(observations), SELF_ENTITY_ID, competitor_entity_ids)
    gaps = detect_gaps(
        list(observations),
        SELF_ENTITY_ID,
        competitor_entity_ids,
        prompted_observations=list(prompted_observations),
    )

    policy = AdmissibilityPolicy()
    admission = evaluate_admission(report, policy)
    fingerprint = model_fingerprint(report.resolved_model_versions)
    comp_key = comparability_key(query_set.content_hash, query_set.sampling_config, fingerprint)

    snapshot = {
        "brand_key": brand_key,
        "brand": params.brand,
        "run_id": run_id,
        "status": admission.status,
        "comparability_key": comp_key,
        "collection_started_at": report.started_at.isoformat(),
        "collection_completed_at": report.completed_at.isoformat(),
        "collection_span_days": admission.collection_span_days,
        "query_set_content_hash": query_set.content_hash,
        "query_set_template_version": query_set.template_set_version,
        "sampling_config": {**query_set.sampling_config, "samples_per_query": samples},
        "observation_count": analysis_result.observation_count,
        "mentioned_count": analysis_result.mentioned_count,
        "cluster_count": analysis_result.cluster_count,
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
        "admission": asdict(admission),
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    runs_path = DATA_DIR / f"{brand_key}.runs.jsonl"
    with runs_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(snapshot) + "\n")
    print(f"\nWrote run record to {runs_path} (status={admission.status})")

    if admission.admissible:
        trend_path = DATA_DIR / f"{brand_key}.jsonl"
        with trend_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(snapshot) + "\n")
        print(f"Admissible — appended to trend series {trend_path}")
    else:
        print(f"NOT admissible — kept out of the trend series. Reasons:")
        for reason in admission.reasons:
            print(f"  - {reason}")

    print(
        f"\nCoverage={analysis_result.coverage:.3f} Prominence={analysis_result.prominence} "
        f"SoV={analysis_result.share_of_voice} Composite={analysis_result.composite_score:.1f} "
        f"CI=[{analysis_result.ci_low:.1f}, {analysis_result.ci_high:.1f}] "
        f"clusters={analysis_result.cluster_count}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one real tracking-loop snapshot for a pilot brand.")
    parser.add_argument("--brand", default="gajanan_vada_pav", choices=sorted(PILOT_BRANDS))
    parser.add_argument(
        "--samples",
        type=int,
        default=5,  # DESIGN §3.4/§6.3 Phase 1: N=5, Q=20 — the validation phase this project is in
        help="Samples per query (default 5, DESIGN §6.3 Phase 1 validation setting)",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Collection run discriminator (default: current ISO week, e.g. 2026-W36). "
        "Resuming within the same run_id skips already-collected samples for free; a new "
        "run_id forces a full re-collection (§4.5 comparability — a new run is a new "
        "observation, not a replay of the last one).",
    )
    parser.add_argument(
        "--providers",
        default=None,
        help="Comma-separated provider ids to use, overriding Settings.enabled_providers "
        "(e.g. --providers gemini or --providers gemini,groq).",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Replay only from the existing response store; never calls a live provider "
        "(DESIGN §3.4's cached-fixture-set guidance as a flag).",
    )
    args = parser.parse_args()

    run(
        args.brand,
        samples=args.samples,
        run_id=args.run_id or _default_run_id(),
        provider_ids=tuple(args.providers.split(",")) if args.providers else None,
        replay_only=args.offline,
    )


if __name__ == "__main__":
    main()

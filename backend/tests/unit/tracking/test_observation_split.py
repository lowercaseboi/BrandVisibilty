"""Snapshot/observation storage split: light snapshot lines + one observations file per run."""

import importlib.util
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app import paths
from app.analysis.types import AnalysisResult, ProviderBreakdown
from app.interface.snapshots import normalize_snapshot
from app.tracking import store
from app.tracking.snapshot import build_snapshot

_SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "migrate_split_observations.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("migrate_split_observations", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _raw(q: int, s: int, *, scored: bool = True, text_len: int = 1500) -> dict:
    return {
        "observation_id": f"synthetic:q{q}-s{s}", "query_id": f"q{q}", "query_text": f"best vada pav {q}",
        "intent_type": "local", "provider_id": "synthetic", "model_version": "m-1",
        "response_text": ("Gajanan Vada Pav near Thane station is great. " * 40)[:text_len],
        "mentions": [{"entity_id": "self", "entity_kind": "self", "rank": 1, "span": [0, 16]},
                     {"entity_id": "rival", "entity_kind": "competitor", "rank": 2, "span": [60, 70]}],
        "scored": scored,
    }


def _snapshot(n_queries: int = 3, samples: int = 2) -> dict:
    now = datetime.now(UTC)
    raws = [_raw(q, s) for q in range(n_queries) for s in range(samples)]
    result = AnalysisResult(0.5, 0.7, 0.4, 55.0, 40.0, 70.0, (ProviderBreakdown("synthetic", 0.5, len(raws), 2),),
                            len(raws), 2, ("synthetic",))
    snap = build_snapshot(
        brand_key="demo", brand_name="Demo", entities={"self": "Demo", "rival": "Rival"}, providers=["synthetic"],
        query_ids=[f"q{q}" for q in range(n_queries)], samples_per_query=samples, query_set_content_hash="abc",
        query_set_template_version="v1", sampling_config={"temperature": None, "system_prompt": None},
        raw_observations=raws, analysis_result=result, gaps=[], recommendations=[], started_at=now, completed_at=now,
    )
    snap["raw_observations"] = [*snap["raw_observations"], _raw(9, 0, scored=False)]
    snap["unscored_observation_count"] = 1
    return snap


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


def _lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_append_writes_light_line_and_observations_file(data_dir):
    snap = _snapshot()
    store.append_snapshot(snap)
    assert "raw_observations" in snap  # caller's record is not mutated

    [line] = _lines(data_dir / "tracking" / "demo.jsonl")
    assert "raw_observations" not in line
    assert line["observations_file"] == f"{snap['run_id']}.observations.jsonl"
    assert line["observation_count"] == 6 and line["unscored_observation_count"] == 1
    assert line["analysis_result"] == snap["analysis_result"]

    obs_file = data_dir / "tracking" / "demo" / f"{snap['run_id']}.observations.jsonl"
    assert _lines(obs_file) == snap["raw_observations"]
    assert store.brand_keys_with_data() == {"demo"}  # the per-brand dir is not a brand


def test_load_snapshots_is_light_and_observations_load_per_run(data_dir):
    first, second = _snapshot(), _snapshot(2, 1)
    store.append_snapshot(first)
    store.append_snapshot(second)

    loaded = store.load_snapshots("demo")
    assert [s["run_id"] for s in loaded] == [first["run_id"], second["run_id"]]
    assert all("raw_observations" not in s for s in loaded)

    assert store.load_observations("demo", second["run_id"]) == second["raw_observations"]
    assert store.load_observations("demo", "nope") is None
    assert store.get_snapshot("demo", first["run_id"])["raw_observations"] == first["raw_observations"]
    assert "raw_observations" not in store.get_snapshot("demo", first["run_id"], include_raw=False)
    with_raw = store.load_snapshots("demo", include_raw=True)
    assert [s["raw_observations"] for s in with_raw] == [first["raw_observations"], second["raw_observations"]]


def test_snapshot_line_stays_small(data_dir):
    snap = _snapshot(n_queries=12, samples=3)  # 36 answers of ~1.5KB each
    store.append_snapshot(snap)
    inline_size = len(json.dumps(snap, ensure_ascii=False).encode("utf-8"))
    line_size = (data_dir / "tracking" / "demo.jsonl").stat().st_size
    assert inline_size > 50_000
    assert line_size < 15_000


def test_legacy_inline_lines_still_work(data_dir):
    snap = _snapshot()
    path = data_dir / "tracking" / "demo.jsonl"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(snap) + "\n", encoding="utf-8")

    assert store.legacy_inline_brands() == ["demo"]
    [light] = store.load_snapshots("demo")
    assert "raw_observations" not in light
    assert store.load_observations("demo", snap["run_id"]) == snap["raw_observations"]
    # Same API payload as normalising the original inline record.
    assert normalize_snapshot(light) == normalize_snapshot(snap)


def _write_legacy_history(data_dir: Path) -> tuple[Path, list[dict]]:
    """Mixed legacy file: two contract records, one pre-contract record (no run_id), a corrupt line."""
    records = [_snapshot(), _snapshot(2, 1)]
    pre_contract = {"brand_key": "demo", "collected_at": "2025-01-01T00:00:00+00:00", "coverage": 0.2,
                    "raw_observations": [{"observation_id": "q0-s0", "query_text": "x", "response_text": "y",
                                          "mentions": [{"entity_id": "self", "rank": 1}]}]}
    path = data_dir / "tracking" / "demo.jsonl"
    path.parent.mkdir(parents=True)
    body = [json.dumps(records[0]), json.dumps(pre_contract), '{"truncated": ', json.dumps(records[1])]
    path.write_text("\n".join(body) + "\n", encoding="utf-8")
    return path, [records[0], pre_contract, records[1]]


def _api_view(brand_key: str) -> tuple[list[dict], list[list[dict]]]:
    snaps = [normalize_snapshot(r) for r in store.load_snapshots(brand_key)]
    obs = [normalize_snapshot(store.get_snapshot(brand_key, s["run_id"]), include_raw=True)["raw_observations"]
           for s in snaps]
    return snaps, obs


def test_migration_round_trip_and_idempotence(data_dir):
    migration = _load_migration()
    path, originals = _write_legacy_history(data_dir)
    before_snaps, before_obs = _api_view("demo")

    [result] = migration.migrate(data_dir)
    assert result["split"] == 3 and result["backup"] == "demo.jsonl.bak"
    assert (data_dir / "tracking" / "demo.jsonl.bak").exists()
    assert store.legacy_inline_brands() == []
    assert '{"truncated": ' in path.read_text(encoding="utf-8")  # corrupt line kept verbatim
    assert all("raw_observations" not in line for line in _lines_ok(path))

    after_snaps, after_obs = _api_view("demo")
    assert after_snaps == before_snaps  # scores, gaps, derived legacy run id: identical
    assert after_obs == before_obs
    assert store.load_observations("demo", originals[0]["run_id"]) == originals[0]["raw_observations"]
    legacy = after_snaps[1]
    assert legacy["admission"]["policy_version"] == "legacy" and len(legacy["run_id"]) == 40

    text = path.read_text(encoding="utf-8")
    obs_files = {p.name: p.read_bytes() for p in (data_dir / "tracking" / "demo").iterdir()}
    [again] = migration.migrate(data_dir)
    assert again["split"] == 0 and again["backup"] is None
    assert path.read_text(encoding="utf-8") == text
    assert {p.name: p.read_bytes() for p in (data_dir / "tracking" / "demo").iterdir()} == obs_files
    assert sorted(p.name for p in (data_dir / "tracking").glob("demo.jsonl*")) == ["demo.jsonl", "demo.jsonl.bak"]

    # New runs append in the new layout next to migrated ones.
    store.append_snapshot(_snapshot())
    assert len(store.load_snapshots("demo")) == 4


def test_migration_dry_run_writes_nothing(data_dir):
    migration = _load_migration()
    path, _ = _write_legacy_history(data_dir)
    text = path.read_text(encoding="utf-8")
    [result] = migration.migrate(data_dir, dry_run=True)
    assert result["split"] == 3 and result["bytes_after"] < result["bytes_before"]
    assert path.read_text(encoding="utf-8") == text
    assert not (data_dir / "tracking" / "demo").exists()


def test_delete_brand_data_removes_observation_files(data_dir):
    store.append_snapshot(_snapshot())
    store.delete_brand_data("demo")
    assert not (data_dir / "tracking" / "demo").exists()
    assert store.load_snapshots("demo") == []


def _lines_ok(path: Path) -> list[dict]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out

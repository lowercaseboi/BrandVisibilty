"""Campaign service end to end with a fake image generator and fake channel adapters:
create → edit → approve → publish (one channel failing) → events + audit logged → board card."""

from __future__ import annotations

import io
import threading
import time
import zipfile

import pytest

from app import paths
from app.distribution import gate, service, store
from app.tracking import board

from .campaign_helpers import BRAND, FakeAdapter, install_fakes, store_snapshot


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    store_snapshot()
    gen, adapters = install_fakes(monkeypatch)
    return gen, adapters


def _create(rec="rec-comp"):
    campaign, job = service.create_campaign(BRAND, rec)
    assert job is None
    return campaign


def test_create_builds_copy_images_and_keeps_gap_id(env):
    gen, _ = env
    c = _create()
    assert c.status == "ready" and c.drafted_by == "template"
    assert c.recommendation_id == "rec-comp" and c.gap_id == "gap-comp"  # AC-7
    assert c.suggestion_key == "comparison_page|ashok_vada_pav"
    assert {v.channel for v in c.variants} == {"facebook_page", "instagram", "x", "linkedin", "google_business", "whatsapp", "sandbox", "export"}
    assert {a.format for a in c.assets} == {"square", "landscape", "gbp", "story"}
    assert all(v.asset_id for v in c.variants)
    x = next(v for v in c.variants if v.channel == "x")
    assert next(a for a in c.assets if a.asset_id == x.asset_id).format == "landscape"
    assert {d.kind for d in c.deliverables} == {"article", "faq"}
    assert "Ashok Vada Pav" in c.deliverables[0].title  # competitor resolved from the gap
    assert all(call["brand_name"] == "Gajanan Vada Pav" for call in gen.calls)
    # board card moved to "in progress"
    assert board.load_board(BRAND)["cards"][c.suggestion_key]["column"] == "in_progress"
    assert [e.action for e in store.load_audit(BRAND)] == ["campaign.create", "campaign.generate"]


def test_recommendation_without_gap_id_is_refused(env):
    with pytest.raises(ValueError, match="AC-7"):
        service.create_campaign(BRAND, "rec-nogap")


def test_unknown_recommendation(env):
    with pytest.raises(service.RecommendationNotFound):
        service.create_campaign(BRAND, "rec-missing")


def test_export_only_kit_and_review_qr(env):
    listing = _create("rec-dir")
    assert [v.channel for v in listing.variants] == ["export"]
    assert listing.deliverables[0].kind == "listing"
    review = _create("rec-review")
    rr = next(d for d in review.deliverables if d.kind == "review_request")
    assert rr.extra["qr_asset_id"] in {a.asset_id for a in review.assets}


def test_full_flow_with_a_failing_channel(env):
    _, adapters = env
    adapters["x"].ok = False
    c = _create()

    # publishing before approval is blocked — and logged (AC-10)
    c = service.publish(BRAND, c.campaign_id, ["facebook_page"], public_base_url="https://pub.example")
    assert c.events[-1].outcome == "blocked" and "approve" in c.events[-1].error.lower()
    assert adapters["facebook_page"].calls == []

    c = service.edit_variant(BRAND, c.campaign_id, "facebook_page", {"text": "Gajanan Vada Pav: hot vada pav in Mumbai."})
    c = service.approve(BRAND, c.campaign_id)
    assert c.status == "approved"

    # an edit after approval revokes it
    c = service.edit_variant(BRAND, c.campaign_id, "facebook_page", {"hashtags": ["VadaPav"]})
    assert c.status == "ready" and c.approved_at is None
    fb = next(v for v in c.variants if v.channel == "facebook_page")
    assert fb.hashtags == ["#VadaPav"]
    c = service.approve(BRAND, c.campaign_id)

    c = service.publish(
        BRAND, c.campaign_id, ["facebook_page", "x", "instagram", "whatsapp", "google_business", "sandbox"],
        public_base_url="https://pub.example",
    )
    outcomes = {e.channel: e.outcome for e in c.events[-6:]}
    assert outcomes == {
        "facebook_page": "published", "x": "failed", "instagram": "published",
        "whatsapp": "exported", "google_business": "exported", "sandbox": "published",
    }
    assert c.status == "partially_published"
    failed = next(e for e in c.events if e.channel == "x" and e.outcome == "failed")
    assert failed.error == "x said no" and failed.content_hash
    published = next(e for e in c.events if e.channel == "facebook_page" and e.outcome == "published")
    fb_now = next(v for v in c.variants if v.channel == "facebook_page")
    assert published.external_url and published.content_hash == gate.content_hash(fb_now) == fb_now.approved_hash

    # image inputs: a local path always; instagram gets a public JPEG URL
    fb_call = adapters["facebook_page"].calls[-1]
    assert fb_call["image_path"].is_file()
    ig_call = adapters["instagram"].calls[-1]
    assert ig_call["image_url"].startswith("https://pub.example/media/") and ig_call["image_url"].endswith(".jpg")
    assert ig_call["image_path"].suffix == ".jpg" and ig_call["image_path"].is_file()

    # every attempt is in the audit log too, blocked ones included
    publish_entries = [e for e in store.load_audit(BRAND) if e.action == "campaign.publish"]
    assert len(publish_entries) == len(c.events) == 7
    assert board.load_board(BRAND)["cards"][c.suggestion_key]["column"] == "done"

    # retry the failed channel once it works → published
    adapters["x"].ok = True
    c = service.publish(BRAND, c.campaign_id, ["x"], public_base_url=None)
    assert c.status == "published"


def test_only_exports_do_not_mark_done(env):
    c = _create()
    c = service.publish(BRAND, c.campaign_id, ["export", "whatsapp"])
    assert [e.outcome for e in c.events] == ["exported", "exported"]  # allowed without approval
    assert c.status == "ready"
    assert board.load_board(BRAND)["cards"][c.suggestion_key]["column"] == "in_progress"


def test_validation_issues_and_disabled_channels_are_blocked(env):
    _, adapters = env
    adapters["facebook_page"].issues = ["too long"]
    c = _create()
    c = service.edit_variant(BRAND, c.campaign_id, "instagram", {"enabled": False})
    c = service.approve(BRAND, c.campaign_id)
    c = service.publish(BRAND, c.campaign_id, ["facebook_page", "instagram"])
    assert [(e.channel, e.outcome) for e in c.events] == [("facebook_page", "blocked"), ("instagram", "blocked")]
    assert "too long" in c.events[0].error
    assert adapters["facebook_page"].calls == [] and adapters["instagram"].calls == []
    assert c.status == "approved"  # blocked attempts sent nothing, so status is unchanged


def test_blocked_attempts_do_not_count_toward_status(env):
    _, adapters = env
    c = _create()
    service.approve(BRAND, c.campaign_id)
    c = service.publish(
        BRAND, c.campaign_id, ["facebook_page", "sandbox"], refused={"facebook_page": "Set ADMIN_TOKEN"}
    )
    assert [(e.channel, e.outcome) for e in c.events] == [("facebook_page", "blocked"), ("sandbox", "published")]
    assert c.events[0].error == "Set ADMIN_TOKEN" and adapters["facebook_page"].calls == []
    assert c.status == "published"
    assert len([e for e in store.load_audit(BRAND) if e.action == "campaign.publish"]) == 2  # both logged


def test_adapter_exception_becomes_a_failed_event(env):
    class Boom(FakeAdapter):
        def publish(self, **kw):
            raise RuntimeError("adapter bug")

    _, adapters = env
    adapters["sandbox"] = Boom("sandbox")
    c = _create()
    service.approve(BRAND, c.campaign_id)
    c = service.publish(BRAND, c.campaign_id, ["sandbox"])
    assert c.events[-1].outcome == "failed" and "adapter bug" in c.events[-1].error


def test_record_blocked_logs_refused_attempts(env):
    c = _create()
    c = service.record_blocked(BRAND, c.campaign_id, ["facebook_page", "x"], "Set ADMIN_TOKEN", actor="user")
    assert [e.outcome for e in c.events] == ["blocked", "blocked"]
    assert len([e for e in store.load_audit(BRAND) if e.action == "campaign.publish"]) == 2


def test_regenerate_image_swaps_the_format_and_revokes_approval(env):
    gen, _ = env
    c = _create()
    c = service.approve(BRAND, c.campaign_id)
    old_x = next(v for v in c.variants if v.channel == "x").asset_id
    c = service.regenerate_image(BRAND, c.campaign_id, format="landscape", style="vibrant")
    new_x = next(v for v in c.variants if v.channel == "x").asset_id
    assert new_x != old_x and old_x in {a.asset_id for a in c.assets}
    assert gen.calls[-1]["style"] == "vibrant" and gen.calls[-1]["seed"] is not None
    assert c.status == "ready"  # the approved image changed
    # the facebook variant (square) was untouched
    with pytest.raises(ValueError):
        service.regenerate_image(BRAND, c.campaign_id, format="poster")


def test_patch_asset_must_exist_and_unknown_channel(env):
    c = _create("rec-dir")
    with pytest.raises(ValueError):
        service.edit_variant(BRAND, c.campaign_id, "export", {"asset_id": "nope"})
    with pytest.raises(LookupError):
        service.edit_variant(BRAND, c.campaign_id, "x", {"text": "hi"})


def test_edit_deliverable_does_not_revoke_approval(env):
    c = _create()
    c = service.approve(BRAND, c.campaign_id)
    c = service.edit_deliverable(BRAND, c.campaign_id, 0, {"body": "# New"})
    assert c.deliverables[0].body == "# New" and c.status == "approved"
    with pytest.raises(LookupError):
        service.edit_deliverable(BRAND, c.campaign_id, 9, {"body": "x"})


def test_export_zip_contents(env):
    c = _create()
    zf = zipfile.ZipFile(io.BytesIO(service.export_zip(BRAND, c.campaign_id)))
    names = set(zf.namelist())
    assert "README.md" in names and "events.json" in names
    assert {f"copy/{v.channel}.txt" for v in c.variants} <= names
    assert len([n for n in names if n.startswith("images/")]) == len(c.assets)
    assert any(n.endswith(".jsonld.json") for n in names)
    assert "gap-comp" in zf.read("README.md").decode()


def test_delete_campaign(env):
    c = _create()
    assert (paths.DATA_DIR / "media" / c.campaign_id).is_dir()
    assert service.delete_campaign(BRAND, c.campaign_id) is True
    assert not (paths.DATA_DIR / "media" / c.campaign_id).exists()
    with pytest.raises(service.CampaignNotFound):
        service.get_campaign(BRAND, c.campaign_id)


def test_campaign_job_runs_on_the_job_manager(env):
    from app.interface.jobs import JobManager

    manager = JobManager(lambda: None)
    campaign, job = service.create_campaign(BRAND, "rec-comp", jobs=manager)
    assert job["kind"] == "campaign" and job["campaign_id"] == campaign.campaign_id
    for _ in range(250):
        if manager.get(job["job_id"])["status"] in ("completed", "failed"):
            break
        time.sleep(0.02)
    final = manager.get(job["job_id"])
    assert final["status"] == "completed", final
    assert final["done"] == final["total"] > 0
    stored = service.get_campaign(BRAND, campaign.campaign_id)
    assert stored.status == "ready" and stored.job_id is None


def test_generation_failure_marks_campaign_failed(env, monkeypatch):
    from app.distribution import service as svc

    def boom(*a, **k):
        raise RuntimeError("no copy")

    monkeypatch.setattr(svc, "draft_campaign", boom)
    with pytest.raises(RuntimeError):
        service.create_campaign(BRAND, "rec-comp")
    (c,) = service.list_campaigns(BRAND)
    assert c.status == "failed"


def test_edit_while_generating_is_refused_and_restart_recovers(env):
    c = _create()
    c.status = "generating"
    store.save_campaign(c)
    with pytest.raises(service.CampaignBusy):
        service.edit_variant(BRAND, c.campaign_id, "x", {"text": "x"})
    assert service.recover_stale_generating() == 1
    assert service.get_campaign(BRAND, c.campaign_id).status == "ready"


def test_concurrent_edits_do_not_lose_updates(env):
    c = _create()
    channels = ["facebook_page", "instagram", "x", "google_business", "whatsapp", "sandbox"]
    threads = [
        threading.Thread(target=service.edit_variant, args=(BRAND, c.campaign_id, ch, {"text": f"Gajanan Vada Pav {ch}"}))
        for ch in channels
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    stored = service.get_campaign(BRAND, c.campaign_id)
    assert all(v.text == f"Gajanan Vada Pav {v.channel}" for v in stored.variants if v.channel in channels)


# --------------------------------------------------------------------------- audit regressions
# (recommendation → campaign → publish → board, across runs and concurrent requests)


def _later_run(recommendations, gaps, run_id="run-2"):
    """A newer stored run for the same brand (the helpers' SNAPSHOT is run-1)."""
    from .campaign_helpers import SNAPSHOT

    store_snapshot({**SNAPSHOT, "run_id": run_id, "recommendations": recommendations, "gaps": gaps})


def _hold_drafting(monkeypatch):
    """Make campaign drafting block until the returned event is set (keeps it "generating")."""
    release = threading.Event()
    real = service.draft_campaign

    def slow(*args, **kwargs):
        assert release.wait(10)
        return real(*args, **kwargs)

    monkeypatch.setattr(service, "draft_campaign", slow)
    return release


def _wait_job(manager, job_id):
    for _ in range(500):
        if manager.get(job_id)["status"] in ("completed", "failed"):
            return manager.get(job_id)
        time.sleep(0.01)
    raise AssertionError("job did not finish")


def test_concurrent_creates_for_one_recommendation_share_one_campaign(env, monkeypatch):
    from app.interface.jobs import JobManager

    release = _hold_drafting(monkeypatch)
    manager = JobManager(lambda: None)
    results = []
    threads = [
        threading.Thread(target=lambda: results.append(service.create_campaign(BRAND, "rec-comp", jobs=manager)))
        for _ in range(4)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len({c.campaign_id for c, _ in results}) == 1
    assert len({job["job_id"] for _, job in results}) == 1  # everyone gets the live job to poll
    assert len(service.list_campaigns(BRAND)) == 1
    assert [e.action for e in store.load_audit(BRAND)] == ["campaign.create"]
    release.set()
    assert _wait_job(manager, results[0][1]["job_id"])["status"] == "completed"
    assert service.get_campaign(BRAND, results[0][0].campaign_id).status == "ready"


def test_concurrent_synchronous_creates_share_one_campaign(env, monkeypatch):
    release = _hold_drafting(monkeypatch)
    results = []
    first = threading.Thread(target=lambda: results.append(service.create_campaign(BRAND, "rec-comp")))
    first.start()
    for _ in range(500):  # until the first campaign exists and is drafting
        if service.list_campaigns(BRAND):
            break
        time.sleep(0.01)
    second, job = service.create_campaign(BRAND, "rec-comp")
    assert job is None and second.status == "generating"
    release.set()
    first.join()
    assert results[0][0].campaign_id == second.campaign_id
    assert len(service.list_campaigns(BRAND)) == 1


def test_stale_generating_campaign_does_not_block_a_new_one(env):
    from dataclasses import replace as dc_replace

    from app.interface.jobs import JobManager

    old = _create()
    store.save_campaign(dc_replace(old, status="generating", job_id="job-that-no-longer-exists"))
    manager = JobManager(lambda: None)
    fresh, job = service.create_campaign(BRAND, "rec-comp", jobs=manager)
    assert fresh.campaign_id != old.campaign_id and job is not None
    _wait_job(manager, job["job_id"])
    # synchronous callers: a "generating" campaign from long ago is a crash leftover, not in flight
    store.save_campaign(dc_replace(old, status="generating", job_id=None, updated_at="2020-01-01T00:00:00+00:00"))
    again, _ = service.create_campaign(BRAND, "rec-comp")
    assert again.campaign_id not in (old.campaign_id, fresh.campaign_id)


def test_failed_campaign_can_be_created_again(env, monkeypatch):
    real = service.draft_campaign

    def boom(*a, **k):
        raise RuntimeError("no copy")

    monkeypatch.setattr(service, "draft_campaign", boom)
    with pytest.raises(RuntimeError):
        service.create_campaign(BRAND, "rec-comp")
    monkeypatch.setattr(service, "draft_campaign", real)
    retry = _create()  # the Studio's "try again" on a failed campaign
    assert retry.status == "ready"
    assert sorted(c.status for c in service.list_campaigns(BRAND)) == ["failed", "ready"]


def test_campaign_for_a_recommendation_missing_from_the_latest_run(env):
    """A campaign made before a new run dropped its recommendation still opens, approves and
    publishes, and so does one created afterwards from the older run; the board card (a ghost
    in the latest run) still moves to done."""
    from .campaign_helpers import SNAPSHOT

    before = _create("rec-comp")
    _later_run(
        recommendations=[{"recommendation_id": "rec-dir", "gap_id": "gap-local", "action": "submit_to_directory",
                          "action_class": "distribution"}],
        gaps=[g for g in SNAPSHOT["gaps"] if g["gap_id"] == "gap-local"],
    )
    _, gap, _ = service.find_recommendation(BRAND, "rec-comp")  # found in run-1
    assert gap["gap_id"] == "gap-comp"
    after, _ = service.create_campaign(BRAND, "rec-comp")
    assert after.gap_id == "gap-comp" and after.suggestion_key == before.suggestion_key
    for c in (before, after):
        assert service.get_campaign(BRAND, c.campaign_id).status == "ready"
        service.approve(BRAND, c.campaign_id)
        published = service.publish(BRAND, c.campaign_id, ["sandbox"], public_base_url=None)
        assert published.status == "published"
    assert board.load_board(BRAND)["cards"]["comparison_page|ashok_vada_pav"]["column"] == "done"


def test_board_card_never_moves_back_from_done(env):
    _, adapters = env
    c = _create()
    service.approve(BRAND, c.campaign_id)
    service.publish(BRAND, c.campaign_id, ["sandbox"], public_base_url=None)
    key = c.suggestion_key
    assert board.load_board(BRAND)["cards"][key]["column"] == "done"
    # a second campaign for the same suggestion, and a failed publish of it, keep the card done
    second = _create()
    assert board.load_board(BRAND)["cards"][key]["column"] == "done"
    adapters["sandbox"].ok = False
    service.approve(BRAND, second.campaign_id)
    assert service.publish(BRAND, second.campaign_id, ["sandbox"], public_base_url=None).status == "failed"
    assert board.load_board(BRAND)["cards"][key]["column"] == "done"


def test_concurrent_board_moves_are_not_lost(env):
    keys = [f"faq_page|c{i}" for i in range(30)]
    threads = [threading.Thread(target=service._set_board_column, args=(BRAND, k, "in_progress")) for k in keys]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    cards = board.load_board(BRAND)["cards"]
    assert set(keys) <= set(cards)
    assert sorted(cards[k]["order"] for k in keys) == list(range(30))


def test_board_move_survives_a_corrupt_card(env):
    board.save_board(BRAND, {"x|": "not-a-card", "y|": {"column": "in_progress", "order": "7"}})
    service._set_board_column(BRAND, "faq_page|", "in_progress")
    card = board.load_board(BRAND)["cards"]["faq_page|"]
    assert (card["column"], card["order"]) == ("in_progress", 0)


def test_video_recommendation_becomes_a_script_campaign(env):
    from .campaign_helpers import SNAPSHOT

    gap = {"gap_id": "gap-howto", "gap_type": "presence", "evidence_refs": ["o3"],
           "detail": {"scope": "intent", "intent_type": "problem_first", "coverage": 0.0}, "is_inferred": False}
    rec = {"recommendation_id": "rec-video", "gap_id": "gap-howto", "action": "video", "action_class": "content",
           "reasoning": "How-to answers never name the brand."}
    _later_run([*SNAPSHOT["recommendations"], rec], [*SNAPSHOT["gaps"], gap])
    c, _ = service.create_campaign(BRAND, "rec-video")
    assert c.status == "ready" and c.gap_id == "gap-howto" and c.suggestion_key == "video|"
    assert "video_script" in {d.kind for d in c.deliverables}

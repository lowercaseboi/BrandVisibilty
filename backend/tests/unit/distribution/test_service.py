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
    assert {v.channel for v in c.variants} == {"facebook_page", "instagram", "x", "google_business", "whatsapp", "sandbox", "export"}
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

import pytest

from app import paths
from app.distribution import store
from app.distribution.types import (
    Asset,
    AuditLogEntry,
    Campaign,
    Deliverable,
    DistributionEvent,
    Variant,
)


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path)
    return tmp_path


def _campaign(cid="cmp-abc", created="2026-09-30T10:00:00+00:00") -> Campaign:
    return Campaign(
        campaign_id=cid, brand_key="demo", recommendation_id="rec-1", gap_id="gap-1", action="faq_page",
        suggestion_key="faq_page|", status="ready", created_at=created, updated_at=created, headline="H",
        variants=[Variant(channel="x", text="t", hashtags=["#a"], issues=["i"])],
        assets=[Asset(asset_id="a1", format="square", path=f"{cid}/a1.png", provider="template", prompt="p", seed=3)],
        deliverables=[Deliverable(kind="faq", title="F", body="b", extra={"jsonld": "{}"})],
        events=[DistributionEvent(event_id="e1", campaign_id=cid, recommendation_id="rec-1", channel="x",
                                  outcome="blocked", at=created, error="nope")],
        drafted_by="template",
    )


def test_round_trip(data_dir):
    c = _campaign()
    store.save_campaign(c)
    assert store.get_campaign("demo", c.campaign_id) == c
    assert (data_dir / "campaigns" / "demo" / "cmp-abc.json").exists()
    assert list((data_dir / "campaigns" / "demo").glob("*.tmp")) == []


def test_from_dict_ignores_unknown_keys():
    data = store.campaign_to_dict(_campaign())
    data["future_field"] = 1
    data["variants"][0]["future"] = 2
    assert store.campaign_from_dict(data) == _campaign()


def test_list_newest_first_and_delete_removes_media(data_dir):
    store.save_campaign(_campaign("cmp-old", "2026-09-01T00:00:00+00:00"))
    store.save_campaign(_campaign("cmp-new", "2026-09-02T00:00:00+00:00"))
    assert [c.campaign_id for c in store.list_campaigns("demo")] == ["cmp-new", "cmp-old"]
    media = data_dir / "media" / "cmp-old"
    media.mkdir(parents=True)
    (media / "a1.png").write_bytes(b"x")
    assert store.delete_campaign("demo", "cmp-old") is True
    assert not media.exists() and store.get_campaign("demo", "cmp-old") is None
    assert store.delete_campaign("demo", "cmp-old") is False


@pytest.mark.parametrize("bad", ["../x", "a/b", ".hidden", "", "a b", "x.json"])
def test_unsafe_ids_are_rejected(bad):
    assert store.get_campaign("demo", bad) is None
    with pytest.raises(ValueError):
        store.campaign_path("demo", bad)


def test_audit_log_is_append_only(data_dir):
    for i in range(3):
        store.append_audit("demo", AuditLogEntry(entry_id=f"e{i}", actor="admin", action="a", target_ref="t", at="now"))
    assert [e.entry_id for e in store.load_audit("demo")] == ["e0", "e1", "e2"]
    assert len((data_dir / "audit" / "demo.jsonl").read_text().splitlines()) == 3


def test_brand_delete_removes_campaigns_media_and_audit(data_dir):
    from app.tracking import store as tracking_store

    store.save_campaign(_campaign())
    (data_dir / "media" / "cmp-abc").mkdir(parents=True)
    store.append_audit("demo", AuditLogEntry(entry_id="e", actor="admin", action="a", target_ref="t", at="now"))
    other = _campaign()
    other.brand_key = "keep"
    store.save_campaign(other)

    tracking_store.delete_brand_data("demo")
    assert store.list_campaigns("demo") == []
    assert not (data_dir / "media" / "cmp-abc").exists()
    assert store.load_audit("demo") == []
    assert store.list_campaigns("keep")  # other brands untouched

from dataclasses import replace

import pytest

from app.distribution import gate
from app.distribution.types import Campaign, Variant

NOW = "2026-09-30T10:00:00+00:00"


def _campaign(**kw) -> Campaign:
    variants = [
        Variant(channel="facebook_page", text="Hello", hashtags=["#A"], asset_id="a1"),
        Variant(channel="x", text="Hi", asset_id="a2"),
        Variant(channel="instagram", text="Insta", enabled=False),
        Variant(channel="whatsapp", text="Fwd"),
        Variant(channel="export", text="All"),
    ]
    base = {
        "campaign_id": "cmp-1", "brand_key": "b", "recommendation_id": "rec-1", "gap_id": "gap-1", "action": "faq_page",
        "suggestion_key": "faq_page|", "status": "ready", "created_at": NOW, "updated_at": NOW, "variants": variants,
    }
    base.update(kw)
    return Campaign(**base)


def test_content_hash_covers_text_hashtags_link_asset_and_alt_text():
    v = Variant(channel="x", text="Hi", hashtags=["#a"], link="https://l", asset_id="a1", alt_text="alt")
    h = gate.content_hash(v)
    assert h == gate.content_hash(replace(v))
    for change in ({"text": "Hi!"}, {"hashtags": ["#b"]}, {"link": None}, {"asset_id": "a2"}, {"alt_text": "x"}):
        assert gate.content_hash(replace(v, **change)) != h
    # not part of the content: enabled / issues / approved_hash
    assert gate.content_hash(replace(v, enabled=False, issues=["x"], approved_hash="z")) == h


def test_no_publish_without_approval():
    c = _campaign()
    ok, reason = gate.can_publish(c, "facebook_page")
    assert not ok and "approve" in reason.lower()
    approved = gate.approve(c, now=NOW)
    assert approved.status == "approved" and approved.approved_at == NOW
    assert gate.can_publish(approved, "facebook_page") == (True, "Approved")
    assert c.status == "ready"  # approve() does not mutate its input


def test_edit_after_approval_revokes_it():
    approved = gate.approve(_campaign(), now=NOW)
    edited = replace(approved, variants=[replace(approved.variants[0], text="Changed"), *approved.variants[1:]])
    # even before revalidate, the gate refuses the changed channel
    ok, reason = gate.can_publish(edited, "facebook_page")
    assert not ok and "edited" in reason.lower()
    revoked = gate.revalidate(edited, now=NOW)
    assert revoked.status == "ready" and revoked.approved_at is None
    assert all(v.approved_hash is None for v in revoked.variants)
    assert not gate.can_publish(revoked, "x")[0]  # the whole campaign needs re-approval


def test_revalidate_keeps_approval_when_content_unchanged_or_channel_disabled():
    approved = gate.approve(_campaign(), now=NOW)
    assert gate.revalidate(approved, now=NOW) is approved
    disabled = replace(approved, variants=[replace(approved.variants[0], enabled=False), *approved.variants[1:]])
    assert gate.revalidate(disabled, now=NOW).status == "approved"


def test_enabling_an_unapproved_channel_revokes_approval():
    approved = gate.approve(_campaign(), now=NOW)
    variants = [replace(v, enabled=True) if v.channel == "instagram" else v for v in approved.variants]
    assert gate.revalidate(replace(approved, variants=variants), now=NOW).status == "ready"


def test_disabled_variant_is_never_publishable():
    approved = gate.approve(_campaign(), now=NOW)
    ok, reason = gate.can_publish(approved, "instagram")
    assert not ok and "off" in reason
    assert gate.can_publish(approved, "google_business")[0] is False  # no such variant


def test_export_and_whatsapp_allowed_without_approval():
    c = _campaign()
    assert gate.can_publish(c, "export")[0]
    assert gate.can_publish(c, "whatsapp")[0]
    assert not gate.can_publish(replace(c, status="generating"), "export")[0]


def test_cannot_approve_while_generating_or_with_nothing_enabled():
    with pytest.raises(gate.GateError):
        gate.approve(_campaign(status="generating"), now=NOW)
    c = _campaign()
    with pytest.raises(gate.GateError):
        gate.approve(replace(c, variants=[replace(v, enabled=False) for v in c.variants]), now=NOW)

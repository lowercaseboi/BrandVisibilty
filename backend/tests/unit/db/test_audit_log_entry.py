from __future__ import annotations

from app.models.admin import AuditLogEntry


def test_insert_and_query_round_trip(session):
    session.add(AuditLogEntry(actor="admin", action="approve_recommendation", target_ref="recommendation:42", context={"note": "ok"}))
    session.commit()

    fetched = session.query(AuditLogEntry).filter_by(target_ref="recommendation:42").one()
    assert fetched.actor == "admin"
    assert fetched.context == {"note": "ok"}
    assert fetched.timestamp is not None

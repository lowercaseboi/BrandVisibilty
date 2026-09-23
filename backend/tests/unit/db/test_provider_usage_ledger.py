from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.collection.ledger import DailyUsage
from app.models.admin import ProviderUsageLedger
from app.models.provider import Provider, ProviderModel


def _provider_model(session):
    provider = Provider(name="gemini")
    session.add(provider)
    session.flush()
    pm = ProviderModel(provider_id=provider.id, model_id="gemini-3.6-flash")
    session.add(pm)
    session.flush()
    return pm


def test_shape_compatible_with_daily_usage(session):
    usage = DailyUsage(day="2026-09-23", requests=13, successes=6, rate_limited=0, errors=7, prompt_tokens=100, completion_tokens=50)
    pm = _provider_model(session)
    session.add(
        ProviderUsageLedger(
            provider_model_id=pm.id,
            usage_date=date.fromisoformat(usage.day),
            requests=usage.requests,
            successes=usage.successes,
            rate_limited=usage.rate_limited,
            errors=usage.errors,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
        )
    )
    session.commit()

    fetched = session.query(ProviderUsageLedger).filter_by(provider_model_id=pm.id).one()
    assert fetched.requests == 13
    assert fetched.errors == 7


def test_unique_provider_model_and_date(session):
    pm = _provider_model(session)
    day = date(2026, 9, 23)
    session.add(ProviderUsageLedger(provider_model_id=pm.id, usage_date=day))
    session.commit()

    session.add(ProviderUsageLedger(provider_model_id=pm.id, usage_date=day))
    with pytest.raises(IntegrityError):
        session.commit()

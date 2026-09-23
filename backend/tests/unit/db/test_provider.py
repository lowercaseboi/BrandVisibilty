from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.provider import Provider, ProviderModel


def test_provider_model_round_trip(session):
    provider = Provider(name="gemini")
    session.add(provider)
    session.flush()
    session.add(ProviderModel(provider_id=provider.id, model_id="gemini-3.6-flash", rpm=10, rpd=1500, daily_budget=1200))
    session.commit()

    fetched = session.query(Provider).filter_by(name="gemini").one()
    assert len(fetched.models) == 1
    assert fetched.models[0].rpm == 10


def test_provider_model_unique_pair(session):
    provider = Provider(name="groq")
    session.add(provider)
    session.flush()
    session.add(ProviderModel(provider_id=provider.id, model_id="openai/gpt-oss-20b"))
    session.commit()

    session.add(ProviderModel(provider_id=provider.id, model_id="openai/gpt-oss-20b"))
    with pytest.raises(IntegrityError):
        session.commit()

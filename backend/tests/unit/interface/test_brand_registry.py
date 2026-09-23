from __future__ import annotations

from app.interface.brand_registry import PILOT_BRANDS


def test_pilot_brands_non_empty() -> None:
    assert PILOT_BRANDS


def test_pilot_brands_known_keys() -> None:
    assert PILOT_BRANDS["gajanan_vada_pav"] == "Gajanan Vada Pav"
    assert PILOT_BRANDS["mayekar_opticians"] == "V.A. Mayekar Opticians"


def test_pilot_brands_keys_are_strings() -> None:
    assert all(isinstance(key, str) and isinstance(value, str) for key, value in PILOT_BRANDS.items())

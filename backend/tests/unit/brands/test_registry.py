import pytest

from app.brands import registry
from app.querysets.generator import generate_draft
from app.tracking import store


@pytest.fixture(autouse=True)
def tmp_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    return tmp_path


def test_pilots_produce_about_twenty_distinct_unprompted_queries():
    for key in ("gajanan_vada_pav", "va_mayekar_opticians", "perfume_pilot"):
        brand = registry.get_brand(key)
        unprompted = [q.text for q in generate_draft(brand.params).queries if not q.is_brand_named]
        # Up to 20 slots (§3.3); repeats are dropped, so pilots land at 17-18 distinct questions.
        assert 15 <= len(unprompted) <= 20, key
        assert len(set(unprompted)) == len(unprompted), key
        assert brand.alias_table()[0].entity_id == "self"
        assert "lenskart" in registry.get_brand("va_mayekar_opticians").competitor_ids()


def test_create_brand_validates_and_persists(tmp_data_dir):
    for bad, msg in [
        ({"name": "", "category": "cafe", "cities": ["Pune"]}, "name"),
        ({"name": "x" * 81, "category": "cafe", "cities": ["Pune"]}, "80"),
        ({"name": "Chai Point", "category": " ", "cities": ["Pune"]}, "category"),
        ({"name": "Chai Point", "category": "cafe", "cities": []}, "cities"),
        ({"name": "Chai Point", "category": "cafe", "cities": ["Pune"], "competitors": [f"c{i}" for i in range(11)]}, "10"),
    ]:
        with pytest.raises(ValueError, match=msg):
            registry.create_brand(bad)

    brand = registry.create_brand(
        {"name": "Chai Point", "category": "cafe", "cities": ["Pune"], "competitors": ["Chaayos", "Starbucks"]}
    )
    assert brand.brand_key == "chai_point" and not brand.is_pilot
    assert brand.competitor_ids() == frozenset({"chaayos", "starbucks"})
    assert (tmp_data_dir / "brands.json").exists()
    assert registry.get_brand("chai_point").params.cities == ("Pune",)
    with pytest.raises(ValueError, match="already exists"):
        registry.create_brand({"name": "chai point", "category": "cafe", "cities": ["Pune"]})
    with pytest.raises(KeyError):
        registry.get_brand("nope")


def test_devanagari_only_names_get_a_stable_ascii_key(tmp_data_dir):
    brand = registry.create_brand(
        {"name": "शर्मा किराणा", "category": "किराणा दुकान", "cities": ["मुंबई"], "competitors": ["पटेल स्टोअर्स"]}
    )
    assert brand.brand_key.isascii() and brand.brand_key.startswith("u")
    assert registry.get_brand(brand.brand_key).name == "शर्मा किराणा"
    assert registry.slugify("शर्मा किराणा") == registry.slugify("  शर्मा   किराणा ")
    assert registry.slugify("Sharma Kirana") == "sharma_kirana"
    assert registry.slugify("!!!") == ""

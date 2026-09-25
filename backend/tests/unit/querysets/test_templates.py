from app.querysets.templates import (
    ALL_TEMPLATES,
    PROMPTED_TEMPLATES,
    UNPROMPTED_TEMPLATES,
    BrandParams,
    instantiate,
)

PARAMS = BrandParams(
    brand="Acme Perfume",
    category="perfume brand",
    audiences=("young professionals", "gift buyers"),
    competitors=("Rival Scents", "Fragrance Co"),
    jobs_to_be_done=("find a signature scent",),
    cities=("Mumbai",),
    tasks=("choose a wedding fragrance",),
    use_cases=("everyday wear", "special occasions"),
)


def test_unprompted_weights_sum_to_twenty():
    assert sum(t.weight for t in UNPROMPTED_TEMPLATES) == 20


def test_no_query_in_unprompted_set_names_the_brand():
    for template in UNPROMPTED_TEMPLATES:
        for cq in instantiate(template, PARAMS):
            assert not cq.is_brand_named
            assert PARAMS.brand not in cq.text


def test_every_prompted_query_names_the_brand():
    for template in PROMPTED_TEMPLATES:
        for cq in instantiate(template, PARAMS):
            assert cq.is_brand_named
            assert PARAMS.brand in cq.text


def test_category_discovery_uses_each_audience_once():
    template = next(t for t in UNPROMPTED_TEMPLATES if t.intent_type == "category_discovery")
    queries = instantiate(template, PARAMS)
    assert [q.text for q in queries] == [
        "best perfume brand for young professionals",
        "best perfume brand for gift buyers",
    ]


def test_instantiate_does_not_cycle_a_short_value_list():
    template = next(t for t in UNPROMPTED_TEMPLATES if t.intent_type == "local_contextual")
    assert template.weight == 3
    assert [q.text for q in instantiate(template, PARAMS)] == ["perfume brand in Mumbai"]


def test_instantiate_caps_at_weight():
    params = BrandParams(brand="X", category="tool", cities=("A", "B", "C", "D", "E"))
    template = next(t for t in UNPROMPTED_TEMPLATES if t.intent_type == "local_contextual")
    assert [q.text for q in instantiate(template, params)] == ["tool in A", "tool in B", "tool in C"]


def test_instantiate_skips_repeated_values():
    params = BrandParams(brand="X", category="tool", cities=("Pune", "Pune", "Goa", "Pune", "Nashik"))
    template = next(t for t in UNPROMPTED_TEMPLATES if t.intent_type == "local_contextual")
    assert [q.text for q in instantiate(template, params)] == ["tool in Pune", "tool in Goa", "tool in Nashik"]


def test_attribute_constrained_uses_extra_values_not_a_brand_param():
    template = next(t for t in UNPROMPTED_TEMPLATES if t.intent_type == "attribute_constrained")
    queries = instantiate(template, PARAMS)
    texts = {q.text for q in queries}
    assert texts == {
        "most affordable perfume brand",
        "fastest perfume brand",
        "easiest perfume brand",
    }


def test_fixed_form_template_produces_exactly_one_query():
    template = next(t for t in PROMPTED_TEMPLATES if t.template == "how much does {brand} cost")
    queries = instantiate(template, PARAMS)
    assert len(queries) == 1
    assert queries[0].text == "how much does Acme Perfume cost"


def test_instantiate_returns_empty_when_param_list_missing():
    params_without_cities = BrandParams(brand="X", category="tool", cities=())
    template = next(t for t in UNPROMPTED_TEMPLATES if t.intent_type == "local_contextual")
    assert instantiate(template, params_without_cities) == []


def test_all_templates_is_union_of_both_subsets():
    assert set(ALL_TEMPLATES) == set(UNPROMPTED_TEMPLATES) | set(PROMPTED_TEMPLATES)

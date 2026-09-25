"""Intent template taxonomy (DESIGN_v1 §3.3) — the versioned instrument, not hand-written
per-brand queries (§3.1). Templates are parameterized by `BrandParams`; instantiation is
deterministic and auditable, distinct from the LLM phrasing-expansion step in generator.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field

TEMPLATE_SET_VERSION = "v2"  # v2: no cycling, no duplicate texts


@dataclass(frozen=True)
class BrandParams:
    """Parameter set for one brand (PRD §13.2 Brand Setup)."""

    brand: str
    category: str
    audiences: tuple[str, ...] = ()
    competitors: tuple[str, ...] = ()
    jobs_to_be_done: tuple[str, ...] = ()
    cities: tuple[str, ...] = ()
    tasks: tuple[str, ...] = ()
    use_cases: tuple[str, ...] = ()


@dataclass(frozen=True)
class IntentTemplate:
    intent_type: str
    template: str  # Python format-string, fields drawn from BrandParams attributes
    is_brand_named: bool
    weight: int  # number of query slots this intent gets (§3.3)
    param_field: str | None  # BrandParams attribute this template iterates over, if any
    extra_values: tuple[str, ...] = field(default=())  # for templates like attribute_constrained


# Unprompted (~20 queries): weights 4/4/3/3/3/3 sum to 20 (§3.3)
UNPROMPTED_TEMPLATES: tuple[IntentTemplate, ...] = (
    IntentTemplate("category_discovery", "best {category} for {audience}", False, 4, "audiences"),
    IntentTemplate("problem_first", "how do I {job_to_be_done}", False, 4, "jobs_to_be_done"),
    IntentTemplate("alternative_seeking", "alternatives to {competitor}", False, 3, "competitors"),
    IntentTemplate(
        "attribute_constrained",
        "{attribute} {category}",
        False,
        3,
        None,
        extra_values=("most affordable", "fastest", "easiest"),
    ),
    IntentTemplate("local_contextual", "{category} in {city}", False, 3, "cities"),
    IntentTemplate("recommendation_seeking", "who should I hire to {task}", False, 3, "tasks"),
)

# Prompted (~10 queries) (§3.3)
PROMPTED_TEMPLATES: tuple[IntentTemplate, ...] = (
    IntentTemplate("identity", "what is {brand}", True, 1, None),
    IntentTemplate("identity", "what does {brand} do", True, 1, None),
    IntentTemplate("fit", "is {brand} good for {use_case}", True, 2, "use_cases"),
    IntentTemplate("commercial", "how much does {brand} cost", True, 1, None),
    IntentTemplate("head_to_head", "{brand} vs {competitor}", True, 2, "competitors"),
    IntentTemplate("trust", "is {brand} reliable", True, 1, None),
    IntentTemplate("trust", "is {brand} legitimate", True, 1, None),
    IntentTemplate("sourcing", "where can I find reviews of {brand}", True, 1, None),
)

ALL_TEMPLATES: tuple[IntentTemplate, ...] = UNPROMPTED_TEMPLATES + PROMPTED_TEMPLATES


@dataclass(frozen=True)
class CanonicalQuery:
    """One instantiated (not yet phrasing-expanded) template binding."""

    text: str
    intent_type: str
    is_brand_named: bool


def instantiate(template: IntentTemplate, params: BrandParams) -> list[CanonicalQuery]:
    """Bind a template to a brand's params, producing up to `template.weight` canonical
    queries — one per *distinct* value in the template's iterated param list, or a single
    fixed-form query when the template has no iterated param.

    Values are never cycled to fill `weight`: asking the same question twice would
    double-count one cluster of answers and make the confidence interval look tighter
    than it is. Repeated values (and values that render to the same text) are skipped.
    """
    field_kwargs = {"brand": params.brand, "category": params.category}

    if template.extra_values:
        values = template.extra_values
        key = "attribute"
    elif template.param_field:
        values = getattr(params, template.param_field)
        key = _SINGULAR.get(template.param_field, template.param_field)
    else:
        values = None
        key = None

    if values is None:
        text = template.template.format(**field_kwargs)
        return [CanonicalQuery(text, template.intent_type, template.is_brand_named)]

    queries: list[CanonicalQuery] = []
    seen: set[str] = set()
    for value in values:
        if len(queries) >= template.weight:
            break
        text = template.template.format(**field_kwargs, **{key: value})
        if text in seen:
            continue
        seen.add(text)
        queries.append(CanonicalQuery(text, template.intent_type, template.is_brand_named))
    return queries


_SINGULAR = {
    "audiences": "audience",
    "competitors": "competitor",
    "jobs_to_be_done": "job_to_be_done",
    "cities": "city",
    "tasks": "task",
    "use_cases": "use_case",
}

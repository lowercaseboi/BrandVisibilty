"""Brand registry (CONTRACT §2, PRD §13.2 Brand Setup, AC-1).

Pilot brands (PRD §9.2) are defined in code; user-created brands are persisted to
`DATA_DIR/brands.json`. A `BrandConfig` bundles the template parameters that drive
query-set generation with the alias table MentionDetector needs.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from app.analysis.types import EntityAlias
from app.querysets.templates import BrandParams
from app.tracking import store

SELF_ENTITY_ID = "self"

_MAX_NAME_LEN = 80
_MAX_COMPETITORS = 10
_MAX_LIST_ITEM_LEN = 120


@dataclass(frozen=True)
class BrandConfig:
    brand_key: str
    params: BrandParams
    self_aliases: tuple[str, ...]
    competitors: dict[str, tuple[str, ...]]  # competitor entity_id -> aliases (first = display name)
    is_pilot: bool

    @property
    def name(self) -> str:
        return self.params.brand

    def alias_table(self) -> tuple[EntityAlias, ...]:
        table = [EntityAlias(SELF_ENTITY_ID, "self", self.self_aliases)]
        table.extend(EntityAlias(cid, "competitor", aliases) for cid, aliases in self.competitors.items())
        return tuple(table)

    def competitor_ids(self) -> frozenset[str]:
        return frozenset(self.competitors)

    def entity_names(self) -> dict[str, str]:
        names = {SELF_ENTITY_ID: self.params.brand}
        names.update({cid: aliases[0] for cid, aliases in self.competitors.items()})
        return names


def slugify(text: str) -> str:
    # NFKD splits accented letters into base letter + mark, so "Café Mocha" -> "cafe_mocha"
    # instead of "caf_mocha"; scripts with no ASCII equivalent fall through to the hash below.
    ascii_text = unicodedata.normalize("NFKD", text.casefold()).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_text).strip("_")
    if not slug and any(ch.isalnum() for ch in text):
        # Names written only in Devanagari (or any non-Latin script) still need a stable,
        # URL- and filename-safe key: derive one from the name itself.
        slug = "u" + hashlib.sha1(" ".join(text.casefold().split()).encode("utf-8")).hexdigest()[:10]
    return slug


def _competitor_map(*alias_groups: tuple[str, ...]) -> dict[str, tuple[str, ...]]:
    return {slugify(group[0]): group for group in alias_groups}


def _pilot(
    brand_key: str, params: BrandParams, self_aliases: tuple[str, ...], competitors: dict[str, tuple[str, ...]]
) -> BrandConfig:
    params = BrandParams(
        brand=params.brand,
        category=params.category,
        audiences=params.audiences,
        competitors=tuple(aliases[0] for aliases in competitors.values()),
        jobs_to_be_done=params.jobs_to_be_done,
        cities=params.cities,
        tasks=params.tasks,
        use_cases=params.use_cases,
    )
    return BrandConfig(brand_key, params, self_aliases, competitors, is_pilot=True)


# PRD §9.2 pilot roster. Each produces 20 unprompted queries (weights 4/4/3/3/3/3, §3.3).
_PILOTS: tuple[BrandConfig, ...] = (
    _pilot(
        "gajanan_vada_pav",
        BrandParams(
            brand="Gajanan Vada Pav",
            category="vada pav outlet",
            audiences=("street food lovers", "office-goers", "students"),
            jobs_to_be_done=(
                "find a quick, tasty street food snack in Mumbai",
                "find the best vada pav near a railway station in Mumbai",
                "get a cheap and filling breakfast in Mumbai",
                "find authentic Maharashtrian street food",
            ),
            cities=("Mumbai",),
            tasks=(
                "cater street food for a small event",
                "supply vada pav for an office party",
                "set up a live vada pav counter at a wedding",
            ),
            use_cases=("a quick breakfast", "office party catering"),
        ),
        ("Gajanan Vada Pav", "Gajanan"),
        _competitor_map(
            ("Ashok Vada Pav", "Kirti College Vada Pav"),
            ("Aaram Vada Pav", "Aaram"),
            ("Graduate Vada Pav",),
            ("Jumbo King", "Jumboking"),
            ("Goli Vada Pav",),
        ),
    ),
    _pilot(
        "va_mayekar_opticians",
        BrandParams(
            brand="V.A. Mayekar Opticians",
            category="optician",
            audiences=("families", "senior citizens", "working professionals", "school children"),
            jobs_to_be_done=(
                "get my eyes tested and buy new glasses",
                "find progressive lenses that suit me",
                "choose spectacle frames for my face shape",
                "get my child's eyesight checked",
            ),
            cities=("Mumbai",),
            tasks=(
                "do a proper eye test and make prescription glasses",
                "fit progressive lenses for my parents",
                "supply safety eyewear for my office staff",
            ),
            use_cases=("progressive lenses", "kids' glasses"),
        ),
        ("V.A. Mayekar Opticians", "V.A. Mayekar", "VA Mayekar", "Mayekar Opticians"),
        _competitor_map(
            ("Lenskart",),
            ("Titan Eye Plus", "Titan Eyeplus", "Titan Eye+"),
            ("GKB Opticals", "GKB"),
            ("Lawrence & Mayo", "Lawrence and Mayo"),
        ),
    ),
    _pilot(
        "perfume_pilot",
        BrandParams(
            # Placeholder: the pilot perfume brand's real name isn't in the docs yet (CONTRACT §2).
            brand="Local Perfume Brand",
            category="perfume brand",
            audiences=("young professionals", "gift shoppers", "college students", "men"),
            jobs_to_be_done=(
                "find a long-lasting perfume under 1000 rupees",
                "choose a perfume as a gift",
                "find a perfume that works in humid Mumbai weather",
                "pick a signature fragrance for daily office wear",
            ),
            cities=("Mumbai",),
            tasks=(
                "curate perfume gift hampers for a corporate event",
                "create a custom fragrance for my wedding",
                "supply perfumes as return gifts for a party",
            ),
            use_cases=("daily office wear", "gifting"),
        ),
        ("Local Perfume Brand",),
        _competitor_map(
            ("Bella Vita", "Bella Vita Organic"),
            ("The Man Company",),
            ("Wild Stone", "Wildstone"),
            ("Fogg",),
        ),
    ),
)

_PILOTS_BY_KEY: dict[str, BrandConfig] = {b.brand_key: b for b in _PILOTS}


# --- user-created brands (DATA_DIR/brands.json) ---------------------------------------


def _brands_path():
    return store.DATA_DIR / "brands.json"


def _load_user_specs() -> list[dict]:
    path = _brands_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [d for d in data if isinstance(d, dict) and d.get("brand_key")] if isinstance(data, list) else []


def _config_from_spec(spec: dict) -> BrandConfig:
    name = spec["name"]
    category = spec["category"]
    competitors = _competitor_map(*[(c,) for c in spec.get("competitors", [])])
    self_aliases = tuple(dict.fromkeys([name, *spec.get("aliases", [])]))
    params = BrandParams(
        brand=name,
        category=category,
        audiences=tuple(spec.get("audiences") or ("everyday customers",)),
        competitors=tuple(aliases[0] for aliases in competitors.values()),
        jobs_to_be_done=tuple(spec.get("jobs_to_be_done") or (f"find a good {category}",)),
        cities=tuple(spec["cities"]),
        tasks=tuple(spec.get("tasks") or (f"help me choose a {category}",)),
        use_cases=tuple(spec.get("use_cases") or ()),
    )
    return BrandConfig(spec["brand_key"], params, self_aliases, competitors, is_pilot=False)


def _clean_list(spec: dict, field: str, *, required: bool = False, max_items: int | None = None) -> list[str]:
    raw = spec.get(field)
    if raw is None:
        raw = []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, (list, tuple)):
        raise ValueError(f"'{field}' must be a list of strings")
    items: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            raise ValueError(f"'{field}' must be a list of strings")
        item = item.strip()
        if not item:
            continue
        if len(item) > _MAX_LIST_ITEM_LEN:
            raise ValueError(f"'{field}' entries must be at most {_MAX_LIST_ITEM_LEN} characters")
        if item not in items:
            items.append(item)
    if required and not items:
        raise ValueError(f"'{field}' needs at least one non-empty entry")
    if max_items is not None and len(items) > max_items:
        raise ValueError(f"'{field}' can have at most {max_items} entries (got {len(items)})")
    return items


def _validate_spec(spec: Any) -> dict:
    if not isinstance(spec, dict):
        raise ValueError("Brand spec must be an object")
    name = spec.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("'name' is required and must be a non-empty string")
    name = " ".join(name.split())
    if len(name) > _MAX_NAME_LEN:
        raise ValueError(f"'name' must be at most {_MAX_NAME_LEN} characters (got {len(name)})")
    category = spec.get("category")
    if not isinstance(category, str) or not category.strip():
        raise ValueError("'category' is required and must be a non-empty string")
    category = " ".join(category.split())
    if len(category) > _MAX_NAME_LEN:
        raise ValueError(f"'category' must be at most {_MAX_NAME_LEN} characters")

    brand_key = slugify(name)
    if not brand_key:
        raise ValueError("'name' must contain at least one letter or digit")

    competitors = _clean_list(spec, "competitors", max_items=_MAX_COMPETITORS)
    if any(c.casefold() == name.casefold() for c in competitors):
        raise ValueError("A brand cannot list itself as a competitor")
    if len({slugify(c) for c in competitors}) != len(competitors) or not all(slugify(c) for c in competitors):
        raise ValueError("Competitor names must be distinct and contain at least one letter or digit")

    return {
        "brand_key": brand_key,
        "name": name,
        "category": category,
        "cities": _clean_list(spec, "cities", required=True, max_items=10),
        "audiences": _clean_list(spec, "audiences", max_items=10),
        "competitors": competitors,
        "aliases": _clean_list(spec, "aliases", max_items=10),
        "jobs_to_be_done": _clean_list(spec, "jobs_to_be_done", max_items=10),
        "tasks": _clean_list(spec, "tasks", max_items=10),
        "use_cases": _clean_list(spec, "use_cases", max_items=10),
    }


# --- public API -----------------------------------------------------------------------


def list_brands() -> list[BrandConfig]:
    """Pilots first, then user-created brands in creation order."""
    brands = list(_PILOTS)
    for spec in _load_user_specs():
        if spec["brand_key"] in _PILOTS_BY_KEY:
            continue
        try:
            brands.append(_config_from_spec(spec))
        except (KeyError, TypeError):
            continue  # skip a hand-corrupted entry rather than breaking the whole listing
    return brands


def get_brand(brand_key: str) -> BrandConfig:
    if brand_key in _PILOTS_BY_KEY:
        return _PILOTS_BY_KEY[brand_key]
    for brand in list_brands():
        if brand.brand_key == brand_key:
            return brand
    raise KeyError(brand_key)


def create_brand(spec: dict) -> BrandConfig:
    """Validate (AC-1), persist to DATA_DIR/brands.json and return the new brand.
    Raises ValueError with a human-readable message on invalid input or a duplicate key."""
    clean = _validate_spec(spec)
    existing = {b.brand_key for b in list_brands()}
    if clean["brand_key"] in existing:
        raise ValueError(f"A brand named {clean['name']!r} already exists (key {clean['brand_key']!r})")

    specs = _load_user_specs()
    specs.append(clean)
    path = _brands_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(specs, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)
    return _config_from_spec(clean)

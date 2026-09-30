"""Pure claim-token extractor (distribution/claims.py). No I/O, no LLM calls, no brand registry —
`facts` here is a plain dict, exactly like the duck-typed contract the module promises."""

import pytest

from app.distribution import claims as c

GAJANAN = {
    "name": "Gajanan Vada Pav",
    "aliases": ["Gajanan"],
    "category": "vada pav outlet",
    "cities": ["Mumbai"],
    "audiences": ["street food lovers", "office-goers", "students"],
    "jobs_to_be_done": [
        "find a quick, tasty street food snack in Mumbai",
        "find the best vada pav near a railway station in Mumbai",
        "get a cheap and filling breakfast in Mumbai",
        "find authentic Maharashtrian street food",
    ],
    "competitors": ["Ashok Vada Pav", "Aaram Vada Pav", "Graduate Vada Pav", "Jumbo King", "Goli Vada Pav"],
}


def _kinds(text: str, facts: dict = GAJANAN) -> list[str]:
    return [t.kind for t in c.unsupported_claims(text, facts)]


def _texts(text: str, facts: dict = GAJANAN) -> list[str]:
    return [t.text for t in c.unsupported_claims(text, facts)]


# --------------------------------------------------------------------------- adversarial: must flag


@pytest.mark.parametrize(
    "text,expected_kind",
    [
        ("open till 11pm", "time"),
        ("₹20 only", "price"),  # also flags a second, superlative, token — checked separately below
        ("since 1978", "founding"),
        ("50% off", "percentage"),
        ("सबसे स्वादिष्ट वडा पाव", "superlative"),
        ("#1 in Mumbai", "ordinal"),
        ("delivery in 10 minutes", "duration"),
        ("२० रुपये", "price"),  # Devanagari digits
    ],
)
def test_adversarial_copy_is_flagged(text, expected_kind):
    kinds = _kinds(text)
    assert expected_kind in kinds, (text, kinds)


def test_price_and_superlative_both_flagged_in_one_line():
    kinds = _kinds("₹20 only")
    assert "price" in kinds and "superlative" in kinds


def test_devanagari_digits_normalise_for_backing():
    # "20" is nowhere in the profile in either script, so both spellings are unsupported...
    assert c.unsupported_claims("₹20", GAJANAN)
    assert c.unsupported_claims("२० रुपये", GAJANAN)
    # ...but a Devanagari-digit price matching an ASCII-digit profile number is still backed.
    perfume = {**GAJANAN, "jobs_to_be_done": ["find a long-lasting perfume under 1000 rupees"]}
    assert not c.unsupported_claims("१००० रुपये में", perfume)


# --------------------------------------------------------------------------- profile-backed: must pass


def test_number_in_the_profile_is_backed():
    perfume = {
        "name": "Local Perfume Brand",
        "aliases": [],
        "category": "perfume brand",
        "cities": ["Mumbai"],
        "audiences": ["young professionals"],
        "jobs_to_be_done": ["find a long-lasting perfume under 1000 rupees"],
        "competitors": ["Bella Vita"],
    }
    assert c.unsupported_claims("A perfume under 1000 rupees, made for daily wear.", perfume) == []
    # a nearby but different number is NOT backed just because some number is in the profile
    assert c.unsupported_claims("A perfume under 100 rupees", perfume)


def test_city_name_backs_no_number():
    # "Mumbai" is in the profile; that must not make an unrelated number look supported.
    tokens = c.unsupported_claims("Mumbai's 5 star vada pav", GAJANAN)
    assert any(t.text == "5" for t in tokens)


def test_brand_name_containing_digits_backs_that_digit():
    facts = {
        "name": "Store24",
        "aliases": [],
        "category": "store",
        "cities": ["Pune"],
        "audiences": [],
        "jobs_to_be_done": [],
        "competitors": [],
    }
    assert c.unsupported_claims("Store24 is open now, visit us in Pune.", facts) == []
    # a number NOT embedded in the brand name is still unsupported
    assert c.unsupported_claims("Store24 has 30 branches", facts)


def test_job_backed_superlative_is_not_flagged_by_this_module():
    # "best" appears verbatim in Gajanan's own jobs_to_be_done line, so this module (unlike the
    # unconditional regex layer in copywriter.py) treats it as backed.
    assert c.unsupported_claims("Looking to find the best vada pav near a railway station", GAJANAN) == []


def test_empty_and_clean_text():
    assert c.unsupported_claims("", GAJANAN) == []
    assert c.unsupported_claims("Gajanan Vada Pav is a vada pav outlet in Mumbai.", GAJANAN) == []


# --------------------------------------------------------------------------- extraction mechanics


def test_extract_tokens_does_not_double_count_overlaps():
    tokens = c.extract_tokens("50% off today, since 1978")
    spans = [(t.start, t.end) for t in tokens]
    assert all(a[1] <= b[0] for a, b in zip(spans, spans[1:]))  # sorted, non-overlapping
    assert [t.kind for t in tokens] == ["percentage", "founding"]


def test_issue_message_names_the_token_and_reason():
    tokens = c.extract_tokens("₹20 only")
    msg = c.issue_message(tokens[0])
    assert "₹20" in msg and "brand profile" in msg

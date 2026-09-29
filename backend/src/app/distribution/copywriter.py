"""Campaign copywriter — the one place the distribution module may use an LLM (CLAUDE.md: only
drafting uses an LLM; what was found and why stays deterministic).

Inputs are ONLY brand-profile facts (name, category, cities, competitors, aliases, audiences,
jobs, use cases) plus the gap and recommendation that justify the campaign. Output: headline,
overlay text, one Variant per channel, the image prompt and the kit's deliverables.

Two paths, same output shape:
- **LLM** (Gemini or Groq through the existing provider adapters, strict JSON prompt). Every field
  is parsed and validated; anything missing or malformed falls back to the template value.
- **Template** (deterministic): used when no provider is configured, COPY_PROVIDER=template, or the
  LLM call / parse fails. Tests use this path.

Validation (both paths): per-channel TEXT_LIMITS (hashtags and link included), hashtag
normalisation and caps, and a claim check — superlatives ("best", "#1", "award-winning"…), prices
and discounts are not in any brand profile, so they're flagged in `variant.issues` (LLM hashtags
carrying such claims are dropped) instead of being silently kept.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.distribution.kits import Kit, image_prompt
from app.distribution.types import TEXT_LIMITS, ChannelId, Deliverable, Variant

log = logging.getLogger(__name__)

# Max hashtags per channel (GBP and WhatsApp don't use them).
HASHTAG_CAPS: dict[str, int] = {
    "facebook_page": 3,
    "instagram": 8,
    "x": 2,
    "google_business": 0,
    "whatsapp": 0,
    "export": 8,
    "sandbox": 3,
}
MAX_HASHTAG_LEN = 30
HEADLINE_MAX = 70
OVERLAY_MAX = 48

# (pattern, label). Case-insensitive. None of these can be backed by a brand profile.
_CLAIM_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bbest\b", "superlative 'best'"),
    (r"(?:#\s?1\b|\bno\.?\s?1\b|\bnumber\s+(?:one|1)\b)", "ranking claim '#1'"),
    (r"\btop[- ]?rated\b", "'top-rated'"),
    (r"\b(?:cheapest|lowest[- ]price[ds]?)\b", "price claim"),
    (r"\baward[- ]?winning\b", "award claim"),
    (r"\bguarantee[ds]?\b", "guarantee"),
    (r"\b100\s?%", "'100%' claim"),
    (r"\bworld[- ]class\b", "'world-class'"),
    (r"\bmost\s+(?:popular|famous|trusted|loved|visited)\b", "popularity claim"),
    (r"\b(?:famous|legendary|iconic)\b", "fame claim"),
    (r"\bleading\b", "'leading'"),
    (r"(?:₹|\brs\.?\s?\d|\binr\s?\d|\$\s?\d)", "price"),
    (r"\b\d+\s?%\s*off\b", "discount"),
    (r"\b(?:discounts?|coupons?|promo\s*codes?|cashback)\b", "discount/offer"),
    (r"\bfree\s+(?:delivery|shipping|gift|trial|sample)s?\b", "free offer"),
)
_CLAIMS = tuple((re.compile(p, re.IGNORECASE), label) for p, label in _CLAIM_PATTERNS)
_PLACEHOLDER = re.compile(r"\[[^\]]{2,}\]")


# --------------------------------------------------------------------------- inputs / outputs


@dataclass(frozen=True)
class BrandFacts:
    """The only brand facts copy may state (from the brand profile, PRD §13.2)."""

    name: str
    category: str
    cities: tuple[str, ...] = ()
    competitors: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    audiences: tuple[str, ...] = ()
    jobs: tuple[str, ...] = ()
    use_cases: tuple[str, ...] = ()

    @classmethod
    def from_config(cls, cfg: Any) -> BrandFacts:
        p = cfg.params
        aliases = tuple(a for a in getattr(cfg, "self_aliases", ()) if a != p.brand)
        return cls(
            name=p.brand,
            category=p.category,
            cities=tuple(p.cities),
            competitors=tuple(p.competitors),
            aliases=aliases,
            audiences=tuple(p.audiences),
            jobs=tuple(p.jobs_to_be_done),
            use_cases=tuple(getattr(p, "use_cases", ()) or ()),
        )

    @property
    def city(self) -> str:
        return self.cities[0] if self.cities else ""

    def as_prompt_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "cities": list(self.cities),
            "competitors": list(self.competitors),
            "aliases": list(self.aliases),
            "audiences": list(self.audiences),
            "jobs_to_be_done": list(self.jobs),
            "use_cases": list(self.use_cases),
        }


@dataclass
class Draft:
    headline: str
    overlay_text: str
    image_prompt: str
    variants: list[Variant]
    deliverables: list[Deliverable]
    drafted_by: str
    notes: list[str] = field(default_factory=list)  # why the LLM path was not (fully) used


# (prompt, system_prompt) -> (raw text, resolved model version)
LLMCall = Callable[[str, str], tuple[str, str]]


# --------------------------------------------------------------------------- small helpers


def _join(items: tuple[str, ...] | list[str], conj: str = "and") -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return f"{', '.join(items[:-1])} {conj} {items[-1]}"


def _a(word: str) -> str:
    return ("an " if word[:1].lower() in "aeiou" else "a ") + word


def camel_tag(text: str) -> str:
    """'vada pav outlet' -> '#VadaPavOutlet'. Keeps Unicode letters (Devanagari tags work)."""
    words = re.findall(r"\w+", text, flags=re.UNICODE)
    body = "".join(w[:1].upper() + w[1:] for w in words)
    return f"#{body[:MAX_HASHTAG_LEN]}" if body else ""


def normalize_hashtags(tags: list[str]) -> list[str]:
    """Leading '#', no spaces/punctuation, de-duplicated case-insensitively, order kept."""
    out: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        if not isinstance(tag, str):
            continue
        body = "".join(re.findall(r"\w+", tag.lstrip("#"), flags=re.UNICODE))[:MAX_HASHTAG_LEN]
        if body and body.lower() not in seen:
            seen.add(body.lower())
            out.append("#" + body)
    return out


def compose(variant: Variant) -> str:
    """What the channel posts: text, then link (unless already in the text), then hashtags."""
    parts = [variant.text.strip()]
    if variant.link and variant.link not in variant.text:
        parts.append(variant.link.strip())
    if variant.hashtags:
        parts.append(" ".join(variant.hashtags))
    return "\n\n".join(p for p in parts if p)


def find_claims(text: str) -> list[str]:
    """Unsupported claims found in `text`, as 'label ("matched text")'."""
    found: list[str] = []
    for pattern, label in _CLAIMS:
        m = pattern.search(text)
        if m:
            found.append(f'{label} ("{m.group(0).strip()}")')
    return found


def tag_claims(tag: str) -> list[str]:
    """Claims inside a hashtag: CamelCase and digits are split into words first
    ('#BestInMumbai' -> 'Best In Mumbai'), and '#1' style tags are checked as written."""
    body = tag.lstrip("#")
    words = re.sub(r"(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Za-z])", " ", body).replace("_", " ")
    return find_claims(words) or find_claims(tag)


def _trim_to(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: max(0, limit - 1)]
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,.;:-") + "…"


def validate_variant(variant: Variant, facts: BrandFacts, *, fix: bool = False) -> Variant:
    """Recompute `variant.issues` (mutates and returns the variant).

    With `fix=True` (drafting): hashtags are normalised, claim-bearing hashtags dropped, the
    hashtag count capped per channel and over-long text trimmed — each fix is noted in `issues`.
    With `fix=False` (a human's edit): nothing is changed, problems are only reported."""
    issues: list[str] = []
    channel = variant.channel
    cap = HASHTAG_CAPS.get(channel, 8)
    limit = TEXT_LIMITS.get(channel, 1_000_000)

    if fix:
        tags = normalize_hashtags(variant.hashtags)
        kept: list[str] = []
        for tag in tags:
            if tag_claims(tag):
                issues.append(f"Removed hashtag {tag}: unsupported claim")
            else:
                kept.append(tag)
        if len(kept) > cap:
            kept = kept[:cap]
        variant.hashtags = kept
    elif len(variant.hashtags) > cap >= 0:
        issues.append(f"More than {cap} hashtags for {channel}" if cap else f"{channel} posts don't use hashtags")

    if not variant.text.strip():
        issues.append("The post text is empty")

    over = len(compose(variant)) - limit
    if over > 0 and fix:
        while variant.hashtags and len(compose(variant)) > limit:
            variant.hashtags = variant.hashtags[:-1]
        over = len(compose(variant)) - limit
        if over > 0:
            variant.text = _trim_to(variant.text, len(variant.text) - over)
        issues.append(f"Shortened to fit the {limit}-character limit")
    elif over > 0:
        issues.append(f"Too long: {len(compose(variant))}/{limit} characters (hashtags and link included)")

    for claim in find_claims(variant.text):
        issues.append(f"Unsupported claim — {claim} is not in the brand profile; remove it or verify it")
    if not fix:
        for tag in variant.hashtags:
            if tag_claims(tag):
                issues.append(f"Hashtag {tag} carries an unsupported claim")
    if _PLACEHOLDER.search(variant.text):
        issues.append("Contains a [placeholder] — replace it before approving")
    lowered = variant.text.lower()
    for comp in facts.competitors:
        if comp and comp.lower() in lowered:
            issues.append(f"Names competitor {comp} — keep any comparison factual and checkable")
    variant.issues = issues
    return variant


# --------------------------------------------------------------------------- template copy


def _safe_job(facts: BrandFacts) -> str | None:
    """First customer job whose wording carries no claim (profile jobs are search phrasings like
    'find the best vada pav…', which would read as our own superlative)."""
    for job in facts.jobs:
        if job and not find_claims(job):
            return job[:1].lower() + job[1:]
    return None


def _headline(kit: Kit, facts: BrandFacts, competitor: str | None) -> str:
    n, cat, city = facts.name, facts.category, facts.city
    in_city = f" in {city}" if city else ""
    audience = facts.audiences[0] if facts.audiences else "you"
    by_action = {
        "comparison_page": f"Choosing {_a(cat)}{in_city}?",
        "use_case_page": f"{n} for {audience}",
        "faq_page": f"Your {cat} questions, answered",
        "video": f"Meet {n}",
        "clarify_category_descriptor": f"{n}: {cat}{in_city}",
        "add_attribute_claim": f"What makes {n} different",
        "correct_outdated_description": f"{n}, as we are today",
        "seek_review_coverage": f"Reviews help others find {n}",
    }
    return by_action.get(kit.action, f"{n}: {cat}{in_city}")[:HEADLINE_MAX]


def _core_sentences(kit: Kit, facts: BrandFacts, competitor: str | None) -> list[str]:
    n, cat = facts.name, facts.category
    where = _join(facts.cities)
    is_a = f"{n} is {_a(cat)}" + (f" in {where}." if where else ".")
    job = _safe_job(facts)
    audiences = _join(facts.audiences[:3])
    angle = {
        # The competitor is named only in the long-form comparison, never in a social post.
        "comparison_page": f"Comparing {cat} options? Here is what {n} offers, so you can decide for yourself.",
        "use_case_page": f"Made for {audiences}." if audiences else f"Here is who {n} is for.",
        "faq_page": f"We answered the questions people ask most about {n}.",
        "video": f"Watch our new short video about {n}.",
        "clarify_category_descriptor": f"In one line: {is_a}",
        "add_attribute_claim": f"Ask us what makes {n} different.",
        "correct_outdated_description": "If you have seen older details about us online, this is the current picture.",
        "seek_review_coverage": f"Visited {n}? A short, honest review helps others find us. Thank you!",
    }.get(kit.action, "")
    sentences = [f"Looking to {job}?" if job else "", is_a, angle]
    if kit.action == "clarify_category_descriptor":
        sentences = [f"Looking to {job}?" if job else "", angle]
    return [s for s in sentences if s]


def _cta(channel: ChannelId, facts: BrandFacts) -> str:
    city = facts.city
    return {
        "facebook_page": f"Visit us{f' in {city}' if city else ''} and tell us what you think.",
        "instagram": "Save this post and share it with a friend.",
        "x": "",
        "google_business": "Visit us or message us for details.",
        "whatsapp": "Forward this to someone who'd like it.",
        "sandbox": "",
        "export": "",
    }.get(channel, "")


def _template_hashtags(facts: BrandFacts) -> list[str]:
    tags = [camel_tag(facts.name), camel_tag(facts.category)]
    if facts.city:
        tags += [camel_tag(facts.city), camel_tag(f"{facts.city} {facts.category}")]
    for aud in facts.audiences[:2]:
        tags.append(camel_tag(aud))
    return normalize_hashtags([t for t in tags if t])


def _alt_text(kit: Kit, facts: BrandFacts) -> str:
    where = f" in {facts.city}" if facts.city else ""
    return f"Photo for {facts.name}, {_a(facts.category)}{where}."


def _template_variants(kit: Kit, facts: BrandFacts, competitor: str | None, headline: str) -> list[Variant]:
    core = _core_sentences(kit, facts, competitor)
    tags = _template_hashtags(facts)
    variants: list[Variant] = []
    for channel in kit.variant_channels:
        if channel == "x":
            text = " ".join(core[1:2] + core[2:3]) if len(core) > 2 else " ".join(core)
        elif channel == "whatsapp":
            text = "\n\n".join([f"*{headline}*", " ".join(core), _cta(channel, facts)])
        else:
            text = "\n\n".join(s for s in [headline, " ".join(core), _cta(channel, facts)] if s)
        variant = Variant(
            channel=channel,
            text=text.strip(),
            hashtags=list(tags),
            alt_text=_alt_text(kit, facts),
        )
        variants.append(validate_variant(variant, facts, fix=True))
    return variants


# --- deliverables -------------------------------------------------------------------------------


def faq_pairs(facts: BrandFacts, competitor: str | None) -> list[tuple[str, str]]:
    n, cat, where = facts.name, facts.category, _join(facts.cities)
    pairs = [
        (f"What is {n}?", f"{n} is {_a(cat)}" + (f" in {where}." if where else ".")),
        (
            f"Where is {n}?",
            f"{n} serves customers in {where}. [Add your address and opening hours.]"
            if where
            else f"[Add {n}'s address and opening hours.]",
        ),
    ]
    for job in [j for j in facts.jobs if not find_claims(j)][:3]:
        q = job[:1].lower() + job[1:]
        pairs.append((f"Can I {q} at {n}?", f"Yes. {n} is {_a(cat)} for people who want to {q}. [Add one specific detail.]"))
    for aud in facts.audiences[:2]:
        pairs.append((f"Is {n} a good fit for {aud}?", f"{n} serves {aud}. [Add what you offer them specifically.]"))
    if competitor:
        pairs.append(
            (
                f"How is {n} different from {competitor}?",
                f"[Add one or two checkable differences — what you offer, location, hours.] "
                f"{n} is {_a(cat)}" + (f" in {where}." if where else "."),
            )
        )
    return pairs


def faq_jsonld(pairs: list[tuple[str, str]]) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs
        ],
    }
    return json.dumps(data, indent=2, ensure_ascii=False)


def _faq_deliverable(facts: BrandFacts, pairs: list[tuple[str, str]]) -> Deliverable:
    body = f"# Frequently asked questions about {facts.name}\n\n" + "\n\n".join(f"## {q}\n\n{a}" for q, a in pairs)
    body += (
        "\n\n---\n\nPaste the JSON-LD snippet (in `extra.jsonld`) into the page's `<head>` inside "
        '`<script type="application/ld+json">` so search engines and AI assistants can read the answers.'
    )
    return Deliverable(kind="faq", title=f"FAQ: {facts.name}", body=body, extra={"jsonld": faq_jsonld(pairs)})


def _article(kit: Kit, facts: BrandFacts, competitor: str | None) -> Deliverable:
    n, cat, where = facts.name, facts.category, _join(facts.cities)
    if kit.action == "comparison_page" and competitor:
        title = f"{n} vs {competitor}: choosing {_a(cat)}" + (f" in {where}" if where else "")
    else:
        aud = facts.audiences[0] if facts.audiences else "you"
        title = f"{n}: {_a(cat)} for {aud}"
    lines = [f"# {title}", "", f"{n} is {_a(cat)}" + (f" in {where}." if where else "."), ""]
    if facts.audiences:
        lines += ["## Who it's for", "", *[f"- {a}" for a in facts.audiences], ""]
    jobs = [j for j in facts.jobs if not find_claims(j)]
    if jobs:
        lines += ["## What people come to us for", "", *[f"- {j[:1].upper() + j[1:]}" for j in jobs], ""]
    if facts.use_cases:
        lines += ["## Occasions", "", *[f"- {u}" for u in facts.use_cases], ""]
    if kit.action == "comparison_page" and competitor:
        lines += [
            f"## {n} and {competitor}",
            "",
            f"Both come up when people look for {_a(cat)}"
            + (f" in {where}" if where else "")
            + ". [Add a fair, checkable comparison: what each offers, location, hours, price range.]",
            "",
        ]
    lines += [
        "## Visit us",
        "",
        "[Add address, opening hours, phone and a map link.]",
    ]
    return Deliverable(kind="article", title=title, body="\n".join(lines).strip())


def _profile_copy(facts: BrandFacts) -> Deliverable:
    n, cat, where = facts.name, facts.category, _join(facts.cities)
    is_a = f"{n} is {_a(cat)}" + (f" in {where}." if where else ".")
    aud = _join(facts.audiences[:3])
    job = _safe_job(facts)
    gbp = " ".join(s for s in [is_a, f"We serve {aud}." if aud else "", f"Come to us to {job}." if job else ""] if s)
    ig_bio = f"{cat[:1].upper() + cat[1:]}" + (f" · {facts.city}" if facts.city else "")
    about = "\n\n".join(s for s in [is_a, f"Our customers include {aud}." if aud else "", "[Add your story: when you started and what you're known for — facts only.]"] if s)
    body = (
        f"# Profile copy for {n}\n\nUse the same category wording everywhere the brand is listed.\n\n"
        f"## Google Business Profile description (max 750 characters)\n\n{gbp[:750]}\n\n"
        f"## Instagram bio (max 150 characters)\n\n{ig_bio[:150]}\n\n"
        f"## Website 'About' section\n\n{about}"
    )
    return Deliverable(
        kind="profile_copy",
        title=f"Profile copy: {n}",
        body=body,
        extra={"gbp_description": gbp[:750], "ig_bio": ig_bio[:150], "about": about},
    )


def _video_script(facts: BrandFacts, headline: str) -> Deliverable:
    n, cat, city = facts.name, facts.category, facts.city
    job = _safe_job(facts)
    body = "\n".join(
        [
            f"# 30-second video: {headline}",
            "",
            f"Title: {n} — {cat}" + (f" in {city}" if city else ""),
            f"Description: {n} is {_a(cat)}" + (f" in {city}." if city else ".") + " [Add address and hours.]",
            "",
            "## Script",
            "",
            f"0-3s — Hook: {'Looking to ' + job + '?' if job else f'Looking for {_a(cat)}?'}",
            f"3-15s — Show the product and the place. Voice-over: \"This is {n}.\"",
            "15-25s — One real customer moment. [Add one checkable detail about what you offer.]",
            f"25-30s — End card: {n}" + (f", {city}" if city else "") + ". Say the name clearly.",
            "",
            "## Shot list",
            "",
            "1. Exterior / counter, wide",
            "2. Product close-up",
            "3. Customer being served (ask permission)",
            "4. End card with the name",
        ]
    )
    return Deliverable(kind="video_script", title=f"Video script: {n}", body=body)


def whatsapp_link(message: str) -> str:
    return "https://wa.me/?text=" + urllib.parse.quote(message)


def _review_request(facts: BrandFacts) -> Deliverable:
    n = facts.name
    message = (
        f"Hi! Thank you for choosing {n}. If you have a minute, an honest review would help others "
        "find us: [paste your Google review link]. Thank you!"
    )
    body = (
        f"# Review request for {n}\n\nSend this to customers who have visited (never offer anything in "
        f"return for a review).\n\n## Message\n\n{message}\n\n## Share link\n\n{whatsapp_link(message)}\n\n"
        "Replace the placeholder with your Google review link, then print it as a QR code for the counter."
    )
    return Deliverable(
        kind="review_request",
        title=f"Review request: {n}",
        body=body,
        extra={"message": message, "wa_link": whatsapp_link(message), "review_link": "[paste your Google review link]"},
    )


def _listing(facts: BrandFacts) -> Deliverable:
    n, cat, where = facts.name, facts.category, _join(facts.cities)
    desc = f"{n} is {_a(cat)}" + (f" in {where}." if where else ".")
    if facts.audiences:
        desc += f" We serve {_join(facts.audiences[:3])}."
    keywords = ", ".join(dict.fromkeys([cat, *(f"{cat} {c}" for c in facts.cities), *facts.use_cases]))
    body = "\n".join(
        [
            f"# Directory listing: {n}",
            "",
            "Use exactly the same name, category and description on every listing.",
            "",
            f"- **Name:** {n}",
            f"- **Category:** {cat}",
            f"- **City:** {where or '[add city]'}",
            "- **Address / phone / hours:** [add — must match your Google Business Profile exactly]",
            f"- **Description:** {desc}",
            f"- **Keywords:** {keywords}",
            "",
            (
                "Suggested directories: Google Business Profile, Bing Places, Apple Business Connect, Justdial, "
                "and the main directory for your category."
            ),
        ]
    )
    return Deliverable(kind="listing", title=f"Listing: {n}", body=body, extra={"description": desc, "keywords": keywords})


def _outreach_email(facts: BrandFacts) -> Deliverable:
    n, cat, city = facts.name, facts.category, facts.city
    in_city = f" in {city}" if city else ""
    subject = f"Suggestion for your {cat} roundup{in_city}: {n}"
    body_text = (
        f"Hi [name],\n\nI enjoyed your roundup of {cat} options{in_city}. I'd like to suggest {n}, "
        f"{_a(cat)}{in_city}"
        + (f" that {_join(facts.audiences[:2])} come to" if facts.audiences else "")
        + ".\n\n[Add one or two checkable facts: what you offer, location, hours.]\n\n"
        "Happy to share photos or answer questions.\n\nThanks,\n[your name]\n" + n
    )
    body = f"# Outreach email\n\n**Subject:** {subject}\n\n{body_text}"
    return Deliverable(kind="outreach_email", title=subject, body=body, extra={"subject": subject})


def _community_answer(facts: BrandFacts) -> Deliverable:
    n, cat, city = facts.name, facts.category, facts.city
    answer = (
        f"If you're looking for {_a(cat)}" + (f" in {city}" if city else "") + f", {n} is one option. "
        "[Answer the actual question first, in your own words, with specifics.]\n\n"
        f"Disclosure: I'm associated with {n}."
    )
    body = (
        f"# Community answer\n\nPost only where it genuinely answers the question, and always keep the "
        f"disclosure. This is never posted automatically.\n\n{answer}"
    )
    return Deliverable(kind="community_answer", title=f"Community answer: {n}", body=body, extra={"answer": answer})


def _template_deliverables(kit: Kit, facts: BrandFacts, competitor: str | None, headline: str) -> list[Deliverable]:
    out: list[Deliverable] = []
    for kind in kit.deliverables:
        if kind == "social_post":
            continue  # the social post IS the variants
        if kind == "article":
            out.append(_article(kit, facts, competitor))
        elif kind == "faq":
            out.append(_faq_deliverable(facts, faq_pairs(facts, competitor)))
        elif kind == "profile_copy":
            out.append(_profile_copy(facts))
        elif kind == "video_script":
            out.append(_video_script(facts, headline))
        elif kind == "review_request":
            out.append(_review_request(facts))
        elif kind == "listing":
            out.append(_listing(facts))
        elif kind == "outreach_email":
            out.append(_outreach_email(facts))
        elif kind == "community_answer":
            out.append(_community_answer(facts))
    return out


def template_draft(kit: Kit, facts: BrandFacts, *, competitor: str | None = None) -> Draft:
    headline = _headline(kit, facts, competitor)
    return Draft(
        headline=headline,
        overlay_text=headline[:OVERLAY_MAX],
        image_prompt=image_prompt(
            kit, category=facts.category, cities=facts.cities, audiences=facts.audiences, competitor=competitor
        ),
        variants=_template_variants(kit, facts, competitor, headline),
        deliverables=_template_deliverables(kit, facts, competitor, headline),
        drafted_by="template",
    )


# --------------------------------------------------------------------------- LLM path

SYSTEM_PROMPT = (
    "You are a careful marketing copywriter for a small local business. You write honest, specific "
    "social posts and web copy. You state ONLY facts given to you. You never invent prices, discounts, "
    "offers, awards, rankings, addresses, phone numbers, opening hours or statistics, and you never use "
    "superlatives such as 'best', '#1', 'top-rated', 'famous' or 'cheapest'. Where a fact is needed but "
    "not given, write a [bracketed placeholder] — only in long-form deliverables, never in social posts. "
    "You reply with one JSON object and nothing else."
)


def _gap_summary(gap: dict[str, Any], competitor: str | None) -> str:
    detail = gap.get("detail") or {}
    bits = [f"type={gap.get('gap_type', '')}"]
    for key in ("scope", "intent_type", "provider_id", "coverage", "mean_rank", "beat_rate"):
        if key in detail:
            bits.append(f"{key}={detail[key]}")
    if competitor:
        bits.append(f"competitor={competitor}")
    return ", ".join(bits)


def build_prompt(
    kit: Kit, facts: BrandFacts, *, gap: dict[str, Any], recommendation: dict[str, Any], competitor: str | None
) -> str:
    channels = {c: {"max_chars": TEXT_LIMITS[c], "max_hashtags": HASHTAG_CAPS.get(c, 8)} for c in kit.variant_channels}
    long_form = [k for k in kit.deliverables if k not in ("social_post", "faq")]
    schema = {
        "headline": f"string, <= {HEADLINE_MAX} chars",
        "overlay_text": f"string, <= {OVERLAY_MAX} chars, drawn on the image",
        "image_scene": "string: a photo scene for an image model. Describe only the scene; no text, letters, logos or brand names",
        "variants": {c: {"text": "string", "hashtags": ["string"], "alt_text": "string"} for c in kit.variant_channels},
        "faq": [{"q": "string", "a": "string"}] if "faq" in kit.deliverables else [],
        "deliverables": {k: {"title": "string", "body": "markdown string, <= 350 words"} for k in long_form},
    }
    return "\n".join(
        [
            f"Brand facts (the ONLY facts you may state): {json.dumps(facts.as_prompt_dict(), ensure_ascii=False)}",
            f"Why this campaign exists (AI-visibility gap): {_gap_summary(gap, competitor)}",
            f"Recommendation: {kit.label}. {recommendation.get('reasoning', '')}",
            f"Campaign angle: {kit.angle}. The brand name must appear in every post and deliverable.",
            f"Channels and limits (limits include hashtags): {json.dumps(channels)}",
            "WhatsApp text is a message people forward; X text must be short; Google Business posts use no hashtags.",
            "Return exactly this JSON shape (no markdown fences, no commentary):",
            json.dumps(schema, ensure_ascii=False),
        ]
    )


def parse_json_object(raw: str) -> dict[str, Any]:
    """The first JSON object in `raw` (tolerates ```json fences and leading chatter)."""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the reply")
    data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("reply is not a JSON object")  # noqa: TRY004 - a bad reply, handled like any parse error
    return data


def _str(value: Any, max_len: int | None = None) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    return value[:max_len] if max_len else value


def merge_llm(base: Draft, data: dict[str, Any], kit: Kit, facts: BrandFacts, competitor: str | None) -> tuple[Draft, int]:
    """Overlay validated LLM fields onto the template draft. Returns (draft, fields used)."""
    used = 0
    headline = _str(data.get("headline"), HEADLINE_MAX)
    if headline and not find_claims(headline):
        base.headline, used = headline, used + 1
    overlay = _str(data.get("overlay_text"), OVERLAY_MAX)
    if overlay and not find_claims(overlay):
        base.overlay_text, used = overlay, used + 1
    elif headline and base.headline == headline:
        base.overlay_text = headline[:OVERLAY_MAX]
    scene = _str(data.get("image_scene"), 600)
    if scene:
        base.image_prompt = f"{scene.rstrip('.')}. No text, no letters, no logos in the image."
        used += 1

    variants_in = data.get("variants") if isinstance(data.get("variants"), dict) else {}
    for i, variant in enumerate(base.variants):
        got = variants_in.get(variant.channel)
        if not isinstance(got, dict):
            continue
        text = _str(got.get("text"))
        if not text or _PLACEHOLDER.search(text):
            continue
        tags = got.get("hashtags") if isinstance(got.get("hashtags"), list) else []
        new = Variant(
            channel=variant.channel,
            text=text,
            hashtags=[t for t in tags if isinstance(t, str)],
            alt_text=_str(got.get("alt_text"), 400) or variant.alt_text,
        )
        base.variants[i] = validate_variant(new, facts, fix=True)
        used += 1

    pairs_in = data.get("faq")
    if "faq" in kit.deliverables and isinstance(pairs_in, list):
        pairs = [
            (q, a)
            for item in pairs_in
            if isinstance(item, dict) and (q := _str(item.get("q"), 300)) and (a := _str(item.get("a"), 1500))
        ]
        if len(pairs) >= 3:
            base.deliverables = [_faq_deliverable(facts, pairs) if d.kind == "faq" else d for d in base.deliverables]
            used += 1

    dels_in = data.get("deliverables") if isinstance(data.get("deliverables"), dict) else {}
    for i, d in enumerate(base.deliverables):
        if d.kind == "faq":
            continue
        got = dels_in.get(d.kind)
        if not isinstance(got, dict):
            continue
        body = _str(got.get("body"), 12_000)
        if not body:
            continue
        base.deliverables[i] = Deliverable(kind=d.kind, title=_str(got.get("title"), 200) or d.title, body=body, extra=dict(d.extra))
        used += 1
    return base, used


def resolve_copy_provider(settings: Any | None = None) -> str | None:
    """'gemini' | 'groq' | None (template). COPY_PROVIDER=auto → first of gemini/groq with a key."""
    if settings is None:
        from app.config.settings import Settings

        settings = Settings()
    choice = (getattr(settings, "copy_provider", "auto") or "auto").strip().lower()
    configured = {"gemini": bool(getattr(settings, "gemini_api_key", None)), "groq": bool(getattr(settings, "groq_api_key", None))}
    if choice == "template":
        return None
    if choice in configured:
        return choice if configured[choice] else None
    return next((pid for pid in ("gemini", "groq") if configured[pid]), None)


def _provider_call(provider_id: str) -> LLMCall:
    from app.collection.registry import build_provider
    from app.collection.types import SamplingParams

    provider = build_provider(provider_id)

    def call(prompt: str, system: str) -> tuple[str, str]:
        result = provider.query(prompt, SamplingParams(temperature=0.7, system_prompt=system, max_output_tokens=4096))
        return result.payload, result.model_version or ""

    return call


def draft_campaign(
    kit: Kit,
    facts: BrandFacts,
    *,
    gap: dict[str, Any],
    recommendation: dict[str, Any],
    competitor: str | None = None,
    provider_id: str | None | bool = True,
    llm: LLMCall | None = None,
) -> Draft:
    """Draft the whole campaign. Never raises for LLM problems: falls back to the template.

    `provider_id=True` resolves from settings (COPY_PROVIDER); `None`/`False` forces the template;
    `llm` injects the call (tests)."""
    draft = template_draft(kit, facts, competitor=competitor)
    pid = resolve_copy_provider() if provider_id is True else (provider_id or None)
    if llm is None and not pid:
        return draft
    try:
        call = llm or _provider_call(str(pid))
        raw, model = call(build_prompt(kit, facts, gap=gap, recommendation=recommendation, competitor=competitor), SYSTEM_PROMPT)
        data = parse_json_object(raw)
    except Exception as exc:  # noqa: BLE001 - any provider/parse failure → template copy
        log.warning("Campaign copy drafting fell back to the template: %s", type(exc).__name__)
        draft.notes.append(f"LLM drafting failed ({type(exc).__name__}); template copy used")
        return draft
    draft, used = merge_llm(draft, data, kit, facts, competitor)
    if used:
        draft.drafted_by = f"{pid or 'llm'}:{model}" if model else str(pid or "llm")
    else:
        draft.notes.append("LLM reply had no usable fields; template copy used")
    return draft


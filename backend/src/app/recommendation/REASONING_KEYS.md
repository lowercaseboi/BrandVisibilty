# Recommendation reasoning keys

Every recommendation carries its English `reasoning` string (unchanged, for the API and CLI)
**and** a translatable form of the same text:

- `reasoning_key: str` — the key of the *finding* sentence (what the data shows).
- `reasoning_params: dict[str, str | int | float]` — every value the sentences need, plus two
  more keys that name the other two sentences:
  - `reasoning_params.action_key` — the *recommended action* sentence.
  - `reasoning_params.assumption_key` — the *simulated impact* sentence.

The English `reasoning` is exactly:

```
render(reasoning_key) + " " + render(params.action_key) + " " + render(params.assumption_key)
```

where `render(key)` replaces every `{name}` in the template below with `params[name]`
(plain string substitution, no extra formatting). The source of truth is
`app/recommendation/reasoning.py::TEMPLATES`; `tests/unit/recommendation/test_reasoning.py`
checks that this file matches it and that rendering reproduces the engine's English string.

Old snapshots (written before these fields existed) have no `reasoning_key`: fall back to the
English `reasoning` string.

## Param types and formatting

| param | type | meaning |
|---|---|---|
| `brand` | str | The brand's display name |
| `evidence_count` | int | Number of AI answers behind the gap (the *n* in confidence = min(1, n/10), floor 0.2) |
| `coverage_pct` | int | Brand coverage within the gap's answers, whole percent (0–100) |
| `provider` | str | Provider id, e.g. `gemini`, `groq` (the English shows the raw id) |
| `intent` | str | Raw intent id, e.g. `problem_first`, `local_contextual`, `custom` |
| `intent_label` | str | `intent` with `_` replaced by spaces, e.g. `problem first` |
| `intent_example` | str | English example phrase for the intent (table below). Translate by `intent`, not by this text |
| `mean_rank` | str | Average list position, one decimal, e.g. `4.3` |
| `competitor` | str | Competitor display name (falls back to its id) |
| `competitor_id` | str | Competitor entity id |
| `co_occurrence_pct` | int | Share of answers naming both, whole percent |
| `beat_pct` | int | Of those, share where the competitor ranks ahead, whole percent |
| `disagreement_pct` | int | Share of brand-named answers that contradict the profile, whole percent |
| `non_mentioning_count` | int | Dominant web/video sources that never mention the brand |
| `dominant_source_count` | int | Dominant web/video sources for the category |
| `gap_type` | str | Raw gap type (only for `finding.generic`) |
| `changed_count` | int | Answers changed in the simulation |
| `closure_rank` | int | Rank the simulation assumes (3 for presence, 2 for prominence) |
| `delta` | str | Simulated score change in points, one decimal, e.g. `1.3` |
| `action` | str | The action id (closed vocabulary) |
| `action_key` | str | Key of the action sentence (see "Action sentences") |
| `assumption_key` | str | Key of the impact sentence (see "Impact sentences") |

Percent params are integers; the `%` sign is part of the template.

`intent_example` values (English), by `intent`:

| intent | intent_example |
|---|---|
| `category_discovery` | `'best for ...'` |
| `problem_first` | `'how do I ...'` |
| `alternative_seeking` | `'alternatives to ...'` |
| `attribute_constrained` | `'most affordable / fastest ...'` |
| `local_contextual` | `'... in <city>'` |
| `recommendation_seeking` | `'who should I go to for ...'` |

Any other intent (e.g. `custom`, or a brand-named type such as `identity`) has no example and
uses the `_generic` finding keys.

## Finding sentences (`reasoning_key`)

| key | English template | params used |
|---|---|---|
| `finding.presence_overall_none` | `{brand} is not named in any of {evidence_count} AI answers about its category; assistants don't associate it with the category yet.` | brand, evidence_count |
| `finding.presence_overall_partial` | `{brand} is named in only {coverage_pct}% of {evidence_count} AI answers about its category; assistants don't associate it with the category yet.` | brand, coverage_pct, evidence_count |
| `finding.presence_provider_none` | `{provider} never names {brand} in any of its {evidence_count} answers, so this assistant's sources don't know the brand yet.` | provider, brand, evidence_count |
| `finding.presence_provider_partial` | `{provider} names {brand} in only {coverage_pct}% of its {evidence_count} answers, so this assistant's sources don't know the brand yet.` | provider, brand, coverage_pct, evidence_count |
| `finding.presence_intent_none` | `{brand} never appears in {intent_example}-type answers (intent: {intent_label}), across {evidence_count} AI responses.` | brand, intent_example, intent_label, evidence_count |
| `finding.presence_intent_partial` | `{brand} appears in only {coverage_pct}% of {intent_example}-type answers (intent: {intent_label}), across {evidence_count} AI responses.` | brand, coverage_pct, intent_example, intent_label, evidence_count |
| `finding.presence_intent_none_generic` | `{brand} never appears in these answers (intent: {intent_label}), across {evidence_count} AI responses.` | brand, intent_label, evidence_count |
| `finding.presence_intent_partial_generic` | `{brand} appears in only {coverage_pct}% of answers (intent: {intent_label}), across {evidence_count} AI responses.` | brand, coverage_pct, intent_label, evidence_count |
| `finding.prominence` | `{brand} is mentioned in {coverage_pct}% of answers, but usually as an afterthought (average position {mean_rank} in the list, across {evidence_count} responses).` | brand, coverage_pct, mean_rank, evidence_count |
| `finding.competitive` | `{competitor} shows up alongside {brand} in {co_occurrence_pct}% of answers and is ranked ahead of it in {beat_pct}% of those ({evidence_count} responses).` | competitor, brand, co_occurrence_pct, beat_pct, evidence_count |
| `finding.representation` | `When asked about {brand} directly, {disagreement_pct}% of answers describe it inconsistently with its real profile.` | brand, disagreement_pct |
| `finding.representation_conflicting` | `When asked about {brand} directly, {disagreement_pct}% of answers describe it inconsistently with its real profile, and the assistants disagree with each other.` | brand, disagreement_pct |
| `finding.source` | `{non_mentioning_count} of the {dominant_source_count} web/video sources that dominate this category never mention {brand}.` | non_mentioning_count, dominant_source_count, brand |
| `finding.generic` | `A {gap_type} gap was detected for {brand}.` | gap_type, brand |

## Action sentences (`reasoning_params.action_key`)

| key | English template | params used |
|---|---|---|
| `action.comparison_page_vs` | `Recommended: publish a '{brand} vs {competitor}' comparison page that states where {brand} wins.` | brand, competitor |
| `action.comparison_page` | `Recommended: publish a '{brand} vs its main competitors' comparison page that states where {brand} wins.` | brand |
| `action.use_case_page_intent` | `Recommended: publish a use-case page for {intent_label} searches spelling out who {brand} is for and when to choose it.` | intent_label, brand |
| `action.use_case_page` | `Recommended: publish a use-case page spelling out who {brand} is for and when to choose it.` | brand |
| `action.faq_page` | `Recommended: publish an FAQ answering the exact questions people ask, naming {brand} in each answer.` | brand |
| `action.video` | `Recommended: produce a short video targeting these queries, with {brand} named in title and description.` | brand |
| `action.clarify_category_descriptor` | `Recommended: use one consistent category description of {brand} everywhere it is listed.` | brand |
| `action.add_attribute_claim` | `Recommended: claim one distinctive, checkable attribute (price, speed, speciality) for {brand} consistently.` | brand |
| `action.correct_outdated_description` | `Recommended: correct outdated or wrong descriptions of {brand} on its own pages and listings.` | brand |
| `action.submit_to_directory` | `Recommended: list {brand} on the directories and local listings AI assistants draw on (maps, review and category directories).` | brand |
| `action.pitch_listicle` | `Recommended: pitch {brand} for inclusion in 'best of' roundups and listicles for the category.` | brand |
| `action.seek_review_coverage_provider` | `Recommended: get {brand} reviewed by bloggers, food/local guides or press in sources {provider} is likely to read.` | brand, provider |
| `action.seek_review_coverage` | `Recommended: get {brand} reviewed by bloggers, food/local guides or press.` | brand |
| `action.community_answer` | `Recommended: answer real community questions (Reddit, Quora, local forums) where {brand} fits.` | brand |

## Impact sentences (`reasoning_params.assumption_key`)

| key | English template | params used |
|---|---|---|
| `assumption.presence` | `If this lifted presence in half of the answers that currently omit it ({changed_count} answers, as a rank-{closure_rank} mention), the visibility score would rise by ~{delta} points (simulated).` | changed_count, closure_rank, delta |
| `assumption.prominence` | `If this moved it up to position {closure_rank} in the {changed_count} answers where it ranks lower, the visibility score would rise by ~{delta} points (simulated).` | closure_rank, changed_count, delta |
| `assumption.competitive` | `If it ranked ahead of {competitor} in the {changed_count} answers where it currently trails, the visibility score would rise by ~{delta} points (simulated).` | competitor, changed_count, delta |
| `assumption.unscored` | `This gap isn't measured by the visibility score (it comes from brand-named questions or the web layer), so no score change is simulated; it is ranked on evidence alone.` | (none) |

`assumption.unscored` is what the UI's "Impact not scored" state corresponds to
(`delta_composite == 0` because the gap type isn't in the score model). A scored gap type can
also end up with `delta_composite == 0` (the simulation moved nothing); its assumption key is
then still `assumption.presence` / `prominence` / `competitive` with `delta` = `0.0`.

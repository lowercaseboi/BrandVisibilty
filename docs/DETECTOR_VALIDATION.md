# Detector validation (AC-12)

## Purpose

`MentionDetector` (`backend/src/app/analysis/mention_detector.py`) is a **deterministic**
alias-table matcher: the same response text and alias table always produce the same mentions,
which is what makes it testable, auditable and cheap (DESIGN_v1 §1.6, §4 — no I/O, no LLM calls).

**Determinism is not the same thing as accuracy.** A deterministic detector can still be
systematically wrong — missing paraphrased mentions, or over-matching a common word that happens
to equal a brand name. AC-12 exists to measure that gap directly: compare the detector's verdicts
against independent human judgment on a sampled subset, and report

- **precision / recall / F1** of the detector against human-labelled ground truth, and
- **Cohen's kappa** between the two human annotators (so a low precision/recall number can be told
  apart from "the humans themselves couldn't agree on this either").

This is a once-in-a-while calibration exercise, run by the team, not part of the live pipeline.

## Procedure (2 team members)

1. One person runs `export` to produce a labelling sheet and a hidden verdicts sidecar (below).
2. **Both** annotators independently fill in `annotator_a` and `annotator_b` for every row,
   *without* looking at each other's answers or at the sidecar file — the whole point of blind
   labelling is that neither annotator's judgment is anchored on the detector's or the other
   annotator's answer.
3. Wherever `annotator_a` and `annotator_b` disagree, a third read (or team discussion) fills in
   `adjudicated` with the final call. Rows left disagreeing with no `adjudicated` value are
   excluded from precision/recall (but still count toward inter-annotator disagreement).
4. Run `score` to compute the metrics and produce a markdown table for this document.

### What counts as a "mention" (blind labelling guidelines)

Label a row `yes` if the response text names that specific tracked entity (the brand itself, or
one specific competitor) — read the excerpt in `response_text` for the row's `entity_label` and
judge it the way a customer reading the answer would. In particular:

- **Possessives and plurals count.** "Gajanan's vada pav is great" or "several Aarams have opened
  nearby" both name the brand/competitor — mark `yes`.
- **Misspellings/near-misses that a reader would still recognize count** ("Jumboking" for "Jumbo
  King"), but a name that is merely *similar* to a different, unrelated business does not.
- **A generic word that happens to equal a brand name does *not* count** unless it's clearly being
  used as the brand name in context. E.g. "Goli" the competitor vs. an unrelated use of the word
  "goli"; "Fogg" the perfume competitor vs. weather fog. When in doubt, read the surrounding
  sentence, not just the matched word.
- **Parenthetical / incidental mentions still count as mentions** for this exercise (the detector
  flags them separately as `is_passing_mention` for scoring purposes, but a mention is a mention
  for AC-12 labelling — we're validating "did the detector see the name", not the passing-mention
  heuristic).
- **Known detector risk to watch for:** `mention_detector.py`'s alias pattern appends an optional
  `(?:'s|s)?` suffix to every alias to catch possessives and plurals — e.g. "Fogg" also matches
  "Foggs" or "Fogg's". This can over-match a word that merely *starts with* the alias followed by
  an `s`/`'s` and is otherwise unrelated. If a `yes` verdict looks like it hinges on that trailing
  `s`, look closely at whether the base word before the suffix is actually being used as the brand
  name — this is the detector's most likely source of false positives.

Do not use `detected_alias` or any other detector-provided column while labelling if present —
the default `export` mode (`--blind`) doesn't put it in the sheet at all, precisely so you aren't
biased by it.

## Commands

```bash
cd backend

# 1. Export a blind labelling sheet (default: 30 rows, sampled across every brand with stored
#    data, stratified to include both detected and not-detected rows).
uv run python scripts/validate_detector.py export --out sheet.csv

# Narrower / reproducible sample:
uv run python scripts/validate_detector.py export --brand gajanan_vada_pav --out sheet.csv --n 40 --seed 1

# 2. Both annotators fill in annotator_a / annotator_b (and, for disagreements, adjudicated)
#    in sheet.csv, independently, without looking at sheet.verdicts.json.

# 3. Score the filled sheet:
uv run python scripts/validate_detector.py score --sheet sheet.csv
```

`export` writes two files:

- **`sheet.csv`** — one row per (response text, tracked entity), with `annotator_a`,
  `annotator_b`, `adjudicated` and `notes` left blank for the team to fill in.
- **`sheet.verdicts.json`** (sidecar, written only in `--blind` mode, the default) — the
  detector's verdict and matched alias text per row, hidden from the sheet so annotators label
  blind. `score` reads it automatically (or pass `--sidecar` to point elsewhere).

`--no-blind` puts `detector_verdict` / `detected_alias` directly in the sheet instead — useful for
a quick sanity-check export, but **do not use it for a real labelling round**: it defeats the
purpose of blind annotation.

## Interpreting the results

### Precision / recall / F1

Computed per PRD §10.1 conventions, over the sampled subset, for the detector treated as a binary
classifier ("does entity X get mentioned in this response?") against the annotators'
adjudicated/consensus labels:

- **Precision** — of the rows the detector called `yes`, what fraction were actually mentions?
  Low precision means the detector over-matches (false positives) — the `(?:'s|s)?` suffix risk
  above is the leading suspect.
- **Recall** — of the rows that actually are mentions, what fraction did the detector catch? Low
  recall means the detector under-matches (missed paraphrases, unlisted aliases, etc).
- **F1** — harmonic mean of the two, reported alongside them rather than instead of them, since a
  single number can hide which failure mode dominates.

Reported **overall** and split by **entity kind** (self vs. competitor) — a detector that's
accurate on the brand's own name but weak on competitor aliases (or vice versa) is a different
problem to fix than one that's uniformly weak.

### Cohen's kappa (inter-annotator agreement)

Measures whether the two *human* annotators agree with each other, correcting for the agreement
expected by chance alone. Interpreted using the Landis & Koch (1977) bands:

| kappa       | agreement       |
|-------------|-----------------|
| < 0.00      | poor            |
| 0.00 – 0.20 | slight          |
| 0.21 – 0.40 | fair            |
| 0.41 – 0.60 | moderate        |
| 0.61 – 0.80 | substantial     |
| 0.81 – 1.00 | almost perfect  |

A **low kappa is a warning sign about the labelling task itself**, not (necessarily) about the
detector: if the humans can't agree on what counts as a mention, a low detector precision/recall
number is less meaningful, because "ground truth" itself is shaky. In that case, refine the
labelling guidelines above (with concrete disputed examples) and re-label before trusting the
precision/recall numbers.

## Results

*(Do not fabricate values here — fill this in only after a real labelling round with
`scripts/validate_detector.py score`.)*

- **Date:** _TBD_
- **Sample:** _TBD (brand(s), n rows, seed if any)_
- **Annotators:** _TBD_

| Scope | N | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| Overall | — | — | — | — |
| Self | — | — | — | — |
| Competitor | — | — | — | — |

Cohen's kappa: **—** (—) — n=—, po=—, pe=—

Disagreements: — of — rows (— unresolved / not yet adjudicated).

_Notes on any patterns in disagreements or detector errors (e.g. confirmed instances of the
`(?:'s|s)?` suffix over-matching):_ _TBD_

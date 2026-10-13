# Metrics v2: measuring AI visibility honestly, comparably and reproducibly

This document is the methodology for the second version of the analysis and recommendation metrics.
It explains:

- what was wrong with v1, using the project's own live data;
- what replaced it, and why;
- how to tell whether an action worked;
- how anyone can re-check every number.

The code is the source of truth. File references are given in each section.

All numbers below come from the live runs stored for the Gajanan Vada Pav pilot (25–30 Sep 2026): Gemini 3.1
Flash Lite and Groq `gpt-oss-120b`, 17 scored questions, 3 samples. They were recomputed with
`scripts/rescore_history.py` and `scripts/verify_bundle.py`.

---

## 1. Why v1 had to change

### 1.1 The headline overstated small brands

v1 composite = 0.4 · Coverage + 0.3 · Prominence + 0.3 · Share of Voice. It had two design choices that interact badly:

- **Prominence was conditional on being mentioned.** It averaged list position over the answers that named the brand.
  With 4 mentions, it is an average of 4 numbers.
- **Missing parts were renormalised away.** With 0 mentions, prominence is undefined and the weights are rescaled
  over coverage alone. So the score jumps from 0 to roughly 40–60 as soon as one answer names the brand near the top.

On the latest live run (`33293934`):

| | v1 | what it means |
|---|---|---|
| Coverage | 0.039 | named in 4 of 102 answers |
| Prominence | 0.525 | average band of those 4 answers |
| Share of voice | 0.071 | |
| **Composite** | **19.5 (CI 0–24.8)** | ~81% of it comes from prominence measured on 4 answers |

A brand named in 4% of answers reads as "about a fifth of the way to the top". The interval spans most of the
"rarely" and "sometimes" bands, so it can't separate anything. All five live runs scored 19–29 on v1.

### 1.2 Rank only counted tracked competitors

v1's rank was the order of first mention among the *tracked* entities. Consider an answer that lists six shops where
the brand is the only one tracked. The brand got "sole option" (1.0), even if it was sixth. Real answers name many
untracked places ("Shree Samarth", "Anand", "Dheeraj"), so this inflated every rank.

Questions that name a competitor ("alternatives to Ashok Vada Pav") also handed that competitor a first place. About 5
of Ashok's 28 "ranked first" answers came from such questions.

### 1.3 Share of voice and prominence depended on the competitor list

Adding or removing a competitor changed the brand's own score. So numbers could not be compared across setups, and
the comparability key had to change with every edit to the list.

### 1.4 Recommendation gains were simulated, not measured

v1 estimated a gain by *pretending* the gap closed: insert the brand at rank 3 in half the answers that omit it, then
re-score the composite. For the latest run this produced **"+44 points"** for a directory listing.

- Confidence was `min(1, evidence/10)`, which rises with sample size whether or not the gap was clear-cut.
- Both actions suggested for a gap got the same gain.

### 1.5 "Did it work?" could not fire

The "since your campaign" card was a raw score difference with no noise check. It ran in the browser only, and only for
the newest campaign. It also required an identical comparability key, which covers the questions, sampling, model
versions and aliases. The five live runs had **four different keys**: one run used one provider, a provider failed in
another, and questions were edited. So no two runs were ever "comparable".

### 1.6 Results could not be reproduced exactly

- The scorer's bootstrap fell back to an unseeded RNG.
- The seed, iteration count, gap thresholds and alias table were not stored with the run.
- There was no export and no verifier.

---

## 2. Design principles for v2

1. **Unconditional.** An answer that doesn't name you counts as 0, so the score can't be inflated by a few lucky
   mentions.
2. **Read the answer as a customer does.** Position means position in the answer's list of options, untracked
   options included.
3. **Compare like with like.** Compare runs on what they have in common, instead of requiring them to be identical.
4. **Say how sure we are, in plain words.** Every number carries an interval. Every change carries the smallest change
   that could have been detected. Small samples say "too little to compare" instead of guessing.
5. **Never claim cause.** Verdicts say "rose after", not "worked". Robustness checks are reported next to the
   estimate, never silently folded in.
6. **Reproducible bit for bit.** Every knob is stored with the run. Re-running the pure functions on the stored answers
   gives identical numbers.

---

## 3. List placement (`backend/src/app/analysis/list_parser.py`)

Assistants answer in markdown. The parser finds the answer's *items*:

- headings;
- numbered and bulleted list items;
- table data rows (the header row is dropped);
- header cells after the first column, because comparison tables put options in columns.

Each item has a **lead**, the part that names the option:

- **Heading:** the heading text.
- **List item:** the leading **bold** or *italic* label. When that label ends in ":" and an emphasised name follows,
  the lead extends over the name (`**Thane:** *Gajanan Vada Pav*`). Otherwise the lead is the first line up to ":" or
  a spaced dash.
- **Table row:** the first cell, plus every emphasised span in the row.

An item's **slot** is its position among items of the same kind (same heading level, list depth, or table row) in
reading order. That is how many options of that kind a reader passes before reaching it. Explicit numbers are
ignored, so lazy or restarted numbering ("1. 1. 1.") can't create ties.

| placement | when | weight |
|---|---|---|
| listed at slot *s* | the name is in an item's lead | `1/log2(1+s)`, slot capped at 10 |
| unlisted | the answer has a list, but the name only appears in an intro, another option's description or a tip | 0.2 |
| prose | the answer has fewer than 2 option items | weight of its order among tracked names (v1 rank) |
| passing | inside parentheses | × 0.25 |
| absent | | 0 |

An entity named in the *question* is excluded from that question's answers for that entity.

The weights are frozen as a 6-decimal table: 1, 0.631, 0.5, 0.431, 0.387, 0.356, 0.333, 0.315, 0.301, 0.289. That
keeps them identical on every platform.

**Behaviour on the live data:**

- All 169 Gemini answers were structured.
- 201 of 221 Groq answers were structured.
- The remaining 20 Groq answers were clarifying questions ("which city?") or refusals. They have no options, and the
  *answer rate* (§4) reports them.
- Real answers are used as test fixtures in `backend/tests/fixtures/answers/`. For example, in a Gemini answer with
  category headings and bulleted options, Gajanan is correctly read as the 9th option (v1 said rank 6).

---

## 4. The Visibility Index and related metrics (`backend/src/app/analysis/visibility.py`)

**Visibility Index** VI(e) = 100 × mean weight over the scored (unprompted) answers.

- **100** = named first in every answer. **0** = never named.
- It is monotone: being named more often, or higher, never lowers it.
- It decomposes as VI = 100 × presence × mean weight when named. That answers PRD §11.6's "which component drove
  the change".

| metric | definition | shown in |
|---|---|---|
| **Visibility Index** | as above, with a 95% interval | headline |
| **Market position** | your rank by VI among you and the tracked competitors, with a bootstrap rank interval ("#5–#6 of 6" unless ≥ 80% of resamples agree) | default view |
| **Question reach** | questions where you were named at all / in at least half of that question's answers ("reliably") | default view |
| **Leader in counts** | "Ashok Vada Pav is named in 36 answers, you in 4" (counts, not ratios of tiny numbers) | default view |
| Share of recommendations | your VI / sum of all tracked VIs (sums to 100% across them) | Analytical |
| Head-to-head | per competitor, answers where you are placed above it vs below it (ties not counted) | Analytical |
| Per AI, per question type | VI on each provider's / intent's answers | Analytical |
| Answer rate | share of answers that offered options at all | Analytical |
| MDE (design) | smallest change a rerun of the same questions and models could detect (within-run noise only, optimistic) | Analytical |
| Legacy composite | v1, kept for comparison | Analytical |

The rating word comes from the **low end** of the interval, on VI bands:

| VI | rating |
|---|---|
| ≥ 40 | top choice |
| ≥ 20 | often recommended |
| ≥ 8 | sometimes recommended |
| below 8 | rarely recommended |

The category leader in the pilot (Ashok) sits at 26–30.

**Uncertainty.** A seeded cluster bootstrap over questions: 1000 resamples, with the seed derived from (base seed,
run id). It resamples questions, not answers, because answers to the same question are correlated (DESIGN §6.1).

- `low_information` is set when you are named in fewer than 3 questions.
- When you are never named, the bootstrap collapses to [0, 0]. The interval is then widened by the rule of three to
  [0, 300/Q].

**Cells.** Everything is aggregated into one cell per (question, provider, model version). A cell holds per-entity
sums of weight, weight², times named, and times first, plus head-to-head counts. Cells are stored with the snapshot,
so comparisons, trends and impact checks need only the light snapshot records.

### 4.1 The same run under v1 and v2

`scripts/rescore_history.py --brand gajanan_vada_pav`:

| run | v1 composite | VI (95% interval) | named | position | questions reached | vs previous run (matched) |
|---|---|---|---|---|---|---|
| 30914086 (Groq only) | 20.3 | 0.6 (0.0–1.9) | 1/59 | 2/6 | 1/17 | — |
| 8dd474ba | 22.5 | 3.3 (0.8–6.7) | 8/111 | 6/6 | 5/17 | no detectable change (Δ −0.7, MDE 1.8, overlap 50%) |
| 10d17478 | 19.1 | 2.6 (0.4–5.5) | 6/102 | 6/6 | 4/17 | no detectable change (Δ −0.4, MDE 2.8, overlap 100%) |
| ea18f6a2 (partial) | 29.0 | 5.1 (0.0–13.6) | 2/16 | 6/6 | 1/3 | insufficient data (overlap 18%) |
| 33293934 | 19.5 | 2.1 (0.0–4.9) | 4/102 | 6/6 | 3/17 | insufficient data vs the partial run |

The competitors on the latest run: Ashok 26.5, Jumbo King 15.2, Goli 11.1, Graduate 8.8, Aaram 3.5, Gajanan 2.1.

### 4.2 Does the weighting choice matter?

On the latest run, the order is the same under every weighting tried:

| weights | order (VI) | Gajanan's position |
|---|---|---|
| DCG (chosen) | Ashok 26.5 > Jumbo King 15.2 > Goli 11.1 > Graduate 8.8 > Aaram 3.5 > Gajanan 2.1 | 6 |
| 1/slot | Ashok 24.6 > Jumbo King 12.4 > Goli 7.5 > Graduate 6.0 > Aaram 2.6 > Gajanan 1.6 | 6 |
| v1 bands as slot weights | Ashok 24.7 > Jumbo King 13.1 > Goli 9.7 > Graduate 9.1 > Aaram 3.8 > Gajanan 2.1 | 6 |
| plain presence | Ashok 37.5 > Jumbo King 28.4 > Goli 25.5 > Graduate 19.8 > Aaram 6.2 > Gajanan 3.9 | 6 |

The conclusions don't hinge on the weights. DCG was chosen because:

- It is the standard position discount in ranking evaluation.
- It falls off gently. A 3rd place is worth half a 1st, not a third.

---

## 5. Comparing runs (`backend/src/app/analysis/matching.py`, `trend.py`)

Two runs are compared on their **matched cells**: the same question (by normalised text), provider and model version.
Each matched question gives one paired difference, VI_after(q) − VI_before(q). The change is the mean of these.

- **Interval:** the wider of a Student-t interval (Q−1 degrees of freedom) and a percentile bootstrap. With 4–17
  questions the bootstrap alone undercovers, and the t interval alone assumes normality.
- **MDE** = 2.80 × sd(differences) / √Q. This is the smallest true change detected 80% of the time at the 5% level.

| verdict | rule |
|---|---|
| rose after / fell after | 95% interval excludes 0 |
| probably rose / dipped a little | only the 80% interval excludes 0 |
| no clear change | neither excludes 0 |
| too little to compare | fewer than 4 matched questions, or under 50% of cells matched |

**Trend.**

- For 2–3 runs it is the matched comparison of the last two admissible runs.
- For 4+ runs it is a Theil–Sen slope on VI, with the v1 bootstrap, over the trailing runs whose cells overlap the
  latest by at least 70%.
- The chart breaks its line where consecutive runs overlap by less than 70%.

**Error rates** (`tests/unit/analysis/test_matching.py`):

- **Simulated A/A test** (300 pairs of runs of an unchanged brand, 17 questions × 2 AIs × 3 samples): "rose" or
  "fell" fired 21 times, a **7% false-alarm rate** against the nominal 5%. "Probably up/down" fired 50 times (17%,
  nominal 20%).
- **Power:** a real lift of 1.5 × MDE was detected as "rose after" in **81%** of 150 trials, and a further 10% leaned up.
- **Real A/A pair:** runs `8dd474ba` → `10d17478` had no action between them. Overlap was 100% and the verdict
  "no detectable change" (Δ −0.4 VI, MDE 2.8).

---

## 6. Recommendations (`backend/src/app/recommendation/opportunity.py`, `engine.py`)

The deterministic gap rules (DESIGN §5.2) and every `gap_id` (AC-7) are unchanged. What changed is how a
recommendation is valued:

- **Opportunity** (VI points) = Σ over the gap's cells of (answers in the cell / all answers) × max(0, target − you).
  - The target is the median VI of the competitors named in that cell. For a competitive gap, it is that competitor's
    VI.
  - It reads as: "matching the typical competitor here would add this much to your overall index". It is measured
    from the answers, not simulated.
- **Expected gain** = opportunity × the action's **uptake prior**, the share of the gap the action is assumed to close.
  These are documented assumptions:

| action | prior | | action | prior |
|---|---|---|---|---|
| pitch to "best of" lists | 0.30 | | use-case page | 0.15 |
| review coverage | 0.30 | | FAQ page | 0.15 |
| directory listing | 0.25 | | attribute claim | 0.15 |
| comparison page | 0.20 | | community answers, video | 0.10 |

  Third-party sources are weighted above own-site content because the assistants answer from their training data and
  the sources it was built from.
- **Confidence** = probability the gap is real: the share of 500 seeded bootstrap resamples (over the gap's questions)
  in which the v2 analogue of the gap rule still holds. It is no longer a function of sample size.
- **Priority** = expected gain × confidence / effort.
- **below_mde** is set when the expected gain is smaller than the reference MDE. The reference MDE comes from the
  matched comparison with the previous comparable run, so it includes real run-to-run drift; without one, the design
  MDE is used. The card then says "a small gain, too small to confirm with one more check".

On the latest live run:

- The top recommendation (a directory listing for the overall presence gap) is **+4.6 VI points**, where v1 said +44.
  - The typical competitor scores 31.9 on those answers and Gajanan 2.1.
  - Opportunity 18.3 × 25% uptake.
- Most other recommendations fall below the MDE. That is the honest answer for a brand this small, measured on
  17 questions.

**Learning.** As the impact ledger (§7) accumulates settled outcomes, `calibrated_priors` updates each prior. Each
measured uptake (measured gain ÷ opportunity, clipped to [0, 1]) is shrunk towards the prior, which counts as 3
pseudo-observations. The next run's recommendations use the updated priors, and the priors used are stored with the run.

---

## 7. Proof of working: the impact ledger (`backend/src/app/analysis/impact.py`, `tracking/impact_ledger.py`)

An entry opens when a recommendation card is moved to **Done**, either by hand or by a Campaign Studio publish. Both go
through `board.save_board`. The prediction is frozen at that moment (expected gain, opportunity, confidence, MDE).
Moving the card out of Done closes the entry. Every new run appends an `evaluation` event, so there is an audit trail
of what the app said when. The ledger is stored at `DATA_DIR/impact/<brand>.jsonl`.

**Evaluation** compares the last admissible run *before* the action with the latest admissible run *after* it:

1. **Primary estimate.** The matched change in your VI on the questions the action's gaps target. Some scopes have too
   few questions for a verdict (a question type often has 3). Then the overall index is used, and the card says so
   (`basis: overall`).
2. **Robustness checks**, reported next to the estimate and never folded into it:
   - **untargeted questions**: the same comparison on your other questions, which gives a difference-in-differences
     read;
   - **market drift**: the mean change in competitors' VI on the same answers. A model update that reshuffles everyone
     shows up here;
   - **placebo rate**: how often the same test fired between earlier consecutive runs when nothing was done. This is
     the brand's empirical false-alarm rate.
3. **Confounded**: another finished action with an overlapping scope fell inside the same window. Both changes are then
   reported, and neither gets a verdict.
4. **Prediction check**: expected gain against the measured change, converted to overall-index points.

**Why difference-in-differences against competitors is not the primary estimate.** When you move up a list,
competitors move down a slot. A competitor control would therefore exaggerate your gain. It also adds the competitors'
much larger variance: per-question sd for Ashok is 15–18 VI points, against about 5 for Gajanan.

**Wording.**

- Verdicts read "rose after", "no clear change yet", "fell after".
- The card says plainly that a rise after an action is a good sign, not proof.
- This keeps PRD §4 and §11.6 (no causal claims) intact.

---

## 8. Reproducing the results

Every run now stores everything needed to recompute it:

- the raw answers;
- the alias table and its signature;
- the gap `detection_config`;
- the v1 bootstrap seed and iterations;
- `metrics_v2` with its config and config hash;
- the reference MDE and the uptake priors used for its recommendations;
- the code version: the git commit, or `BRANDLENS_CODE_SHA` in images built without `.git`.

**Re-check a run without API keys:**

```bash
cd backend
uv run python scripts/export_bundle.py --brand gajanan_vada_pav --out run.zip   # or GET /brands/{k}/snapshots/{run}/bundle
uv run python scripts/verify_bundle.py run.zip
```

The verifier checks integrity (SHA-256 manifest), then recomputes and diffs:

- detection
- v1 score
- v2 metrics
- gaps
- recommendations

Any check the run predates is shown as SKIP with the reason, never passed silently. Any difference prints the first
differing field. On the live data:

- The latest Gajanan run verifies completely. Detection is skipped because that run predates storing its alias table.
- The two runs from 25–26 Sep differ only in recommendations, because the action matrix changed on 30 Sep (commit
  `511d109`). The verifier warns that those runs did not record their code version.

**Other tools:**

```bash
uv run python scripts/rescore_history.py --brand all --json history.json   # v1 vs v2 for every stored run
uv run python scripts/validate_list_parser.py export --brand gajanan_vada_pav --out slots.csv --n 30 --seed 1
uv run python scripts/validate_list_parser.py score --sheet slots.csv      # after a human fills it in
uv run pytest tests/unit/analysis tests/unit/recommendation tests/unit/tracking
```

- `rescore_history.py` recomputes v2 for older runs from their stored answers with today's competitor list. The result
  is cached under `DATA_DIR/metrics/`, never written into the history, and marked `rescored`.
- The history files' SHA-256 is printed before and after, to show they are untouched.

**New live data.** Re-collecting answers is reproducible statistically, not bit for bit, because the providers sample
at their default temperature. The matched comparison and its MDE are exactly the tools for telling whether a re-run
agrees with an earlier one.

---

## 9. Limitations

- **Training-data answers.** Neither pilot model searches the web. A new listing or article may only reach the answers
  after a model update. A model update changes `model_version`, so matched overlap drops to 0 and the honest verdict
  is "too little to compare". Expect slow, mostly "no clear change" results for small brands.
- **Small scopes.** A question type has about 3 questions, and its MDE is roughly 8–9 VI points. Impact checks then fall
  back to the overall index.
- **Format-dependent parsing.** Placement is reported per provider (parse statistics in the Analytical view). The
  parser has not yet been validated against human labels. `scripts/validate_list_parser.py` sets up that round, like
  `DETECTOR_VALIDATION.md` for the mention detector, and the results are still pending.
- **Detector false positives** remain, e.g. "Shri Gajanan Bhel Puri" matched as Gajanan. v2 inherits the detector.
- **Uptake priors are assumptions** until the ledger has settled outcomes. The calibration data will stay small for
  a long time.
- **Rescored history uses today's competitor list**, which is what makes it comparable but may differ from what an old
  run's detector saw.
- **Gap rules are unchanged** (v1 thresholds on detector ranks). Rewriting them on list slots is future work.

---

## 10. Where the code is

| piece | file | tests |
|---|---|---|
| list placement | `analysis/list_parser.py` | `tests/unit/analysis/test_list_parser.py` |
| Visibility Index, cells | `analysis/visibility.py` | `test_visibility.py` |
| statistics | `analysis/stats.py` | `test_stats.py` |
| matched comparison | `analysis/matching.py` | `test_matching.py` (A/A, power) |
| trend v2 | `analysis/trend.py` | `test_trend.py` |
| impact evaluation | `analysis/impact.py` | `test_impact.py` |
| opportunity, priors | `recommendation/opportunity.py` | `tests/unit/recommendation/test_opportunity.py` |
| rescoring | `tracking/rescore.py` | `tests/unit/tracking/test_rescore.py` |
| impact ledger | `tracking/impact_ledger.py` | `test_impact_ledger.py` |
| bundles | `tracking/bundle.py` | `test_bundle.py` |
| frontend view model | `frontend/src/components/dashboard/visibility.ts` | `visibility.test.ts` |

All `analysis/*` modules are covered by the purity test (no I/O, no LLM; CLAUDE.md).

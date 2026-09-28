// Analysis + Gaps & evidence modules. English only for now — hi/mr fall back to English at runtime
// (i18n/index.tsx lookup). Components moved in from the old dashboard keep their dashboard.* /
// pages.* keys; only text new to these modules lives here.
export const modules = {
  // ---- Analysis
  "analysis.empty.body2": "It takes a few minutes — start it from the run panel.",
  "analysis.trend.eyebrow": "Over time",
  "analysis.deeper.title": "Deeper numbers",
  "analysis.deeper.summary": "Run facts, scores, comparability, each AI and competitors",
  "analysis.deeper.facts": "This analysis",

  // ---- Gaps & evidence: left pane
  "gaps.eyebrow": "Found by fixed rules",
  "gaps.hint": "Select a gap to see the responses behind it.",
  "gaps.select": "Select",
  "gaps.none.body": "Gaps, and the AI responses behind them, appear after the first analysis.",
  "gaps.none.cta": "Go to Analysis",

  // ---- Gaps & evidence: right pane
  "evidence.eyebrow": "Evidence",
  "evidence.forGap_one": "Showing the **{n}** response behind this gap.",
  "evidence.forGap_other": "Showing the **{n}** responses behind this gap.",
  "evidence.forRefs_one": "Showing the **{n}** response behind this recommendation.",
  "evidence.forRefs_other": "Showing the **{n}** responses behind this recommendation.",
  "evidence.found": "{found} of them are AI responses in this analysis.",
  "evidence.noneLinked": "No AI response from this analysis is linked here — this evidence points at other sources.",
  "evidence.clear": "Clear",
  "evidence.clearAria": "Clear the selection and show every response",
  "evidence.spotlight": "Spotlight",
  "evidence.spotlightOutranked": "A verbatim response where a competitor is named before you.",
  "evidence.spotlightNamed": "A verbatim response that names your brand.",
  "evidence.hint": "Select a gap to narrow the responses below to the ones behind it.",
  "evidence.all": "Every response",
  "evidence.showMore_one": "Show {n} more",
  "evidence.showMore_other": "Show {n} more",
  "evidence.resetFilters": "Clear filters",
  "evidence.gapMissing": "That gap isn't part of this analysis — it may have been resolved since. Showing every response instead.",
  "evidence.olderRun": "You're looking at an older analysis, from {when}. Its gaps and responses are shown.",
  "evidence.olderRunUnknown": "You're looking at an analysis that isn't the latest one.",
  "evidence.toLatest": "View the latest",
};

// Recommendation list. English only for now — hi/mr fall back to English at runtime
// (i18n/index.tsx lookup). Action titles, steps, effort words and gap findings reuse the
// translated `dashboard.*` keys.
// - {title} is a card's action title, {status} a status name.
export const board = {
  "eyebrow": "Recommendations",
  "title": "What to do next",
  "intro": "Every suggestion comes from a gap found in the latest analysis, highest impact first. Mark each one as you act on it.",
  "meta.run": "From the analysis of {date}",
  "loading": "Loading recommendations…",

  // Statuses (a card's saved column)
  "status.suggested": "Suggested",
  "status.saved": "Saved for later",
  "status.in_progress": "In progress",
  "status.done": "Done",
  "status.rejected": "Rejected",

  // Filter bar
  "filter.label": "Show recommendations",
  "filter.all": "All",
  "filter.open": "Open",
  "filter.in_progress": "In progress",
  "filter.done": "Done",
  "filter.rejected": "Rejected",
  "filter.empty": "Nothing here yet.",
  "filter.showAll": "Show all",

  // Cards
  "card.impact": "+{n} pts",
  "card.impactLabel": "Estimated impact: {n} points",
  "card.effort": "Effort",
  "card.confidence": "Confidence",
  "card.why": "Why?",
  "card.how": "How to do it",
  "card.rationale": "Engine rationale (English)",
  "card.draftedTemplate": "Drafted by fixed rules — no AI involved.",
  "card.draftedOther": "Drafted by: {by}",
  "card.trace": "Gap: {type}",
  "card.traceTitle": "Trace to gap {id} in Gaps & evidence",
  "card.evidence_one": "{n} response →",
  "card.evidence_other": "{n} responses →",
  "card.resolved": "Resolved in latest run",
  "card.resolvedNote": "The latest analysis no longer flags this.",
  "card.remove": "Remove",
  "card.removeLabel": "Remove “{title}” from the list",
  "card.status": "Status of “{title}”",

  // Screen-reader announcements
  "announce.status": "Marked “{title}” as {status}.",
  "announce.removed": "Removed “{title}” from the list.",

  // Save / load feedback
  "toast.saveFailed": "Couldn't save that change — it was undone.",
  "toast.migrated_one": "Marked {n} item you had ticked as Done.",
  "toast.migrated_other": "Marked {n} items you had ticked as Done.",
  "offline.notice": "Your saved statuses couldn't be loaded, so changes here won't be saved.",
  "offline.retry": "Try again",
  "offline.retrying": "Trying…",

  // Empty states
  "empty.title": "No suggestions yet",
  "empty.body": "Run an analysis — every gap it finds becomes a suggestion here.",
  "empty.noneTitle": "Nothing to act on right now",
  "empty.noneBody": "The latest analysis found no gaps that need a fix. Run it again in a few weeks.",
  "empty.cta": "Go to Analysis",
};

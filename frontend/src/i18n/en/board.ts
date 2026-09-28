// Recommendation board (kanban). English only for now — hi/mr fall back to English at runtime
// (i18n/index.tsx lookup). Action titles, steps, effort words and gap findings reuse the
// translated `dashboard.*` keys.
// - {title} is a card's action title, {column} a column name, {competitor} a brand name.
export const board = {
  "eyebrow": "Action board",
  "title": "Work through the suggestions",
  "intro": "Every card comes from a gap found in the latest analysis. Move cards along as you act on them.",
  "meta.run": "From the analysis of {date}",
  "hint": "Drag cards between columns — or focus a card and press Alt + ←/→ to move it, Alt + ↑/↓ to reorder.",
  "loading": "Loading board…",

  // Columns
  "column.suggested": "Suggested",
  "column.saved": "Saved for later",
  "column.in_progress": "In progress",
  "column.done": "Done",
  "column.rejected": "Rejected",
  "column.count_one": "{n} card",
  "column.count_other": "{n} cards",
  "column.empty": "Drag suggestions here",
  "column.emptySuggested": "No new suggestions",

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
  "card.removeLabel": "Remove “{title}” from the board",
  "card.moveTo": "Move “{title}” to…",
  "card.movePrev": "Move to {column}",
  "card.moveNext": "Move to {column}",

  // Screen-reader announcements
  "announce.moved": "Moved “{title}” to {column}, position {pos} of {total}.",
  "announce.removed": "Removed “{title}” from the board.",

  // Save / load feedback
  "toast.saveFailed": "Couldn't save the board — your last move was undone.",
  "toast.migrated_one": "Moved {n} item you had marked done into Done.",
  "toast.migrated_other": "Moved {n} items you had marked done into Done.",
  "offline.notice": "The saved board couldn't be loaded, so changes here won't be saved.",
  "offline.retry": "Try again",
  "offline.retrying": "Trying…",

  // Empty states
  "empty.title": "No suggestions yet",
  "empty.body": "Run an analysis — every gap it finds becomes a card on this board.",
  "empty.noneTitle": "Nothing to act on right now",
  "empty.noneBody": "The latest analysis found no gaps that need a fix. Run it again in a few weeks.",
  "empty.cta": "Go to Analysis",
};

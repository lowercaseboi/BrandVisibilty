// English strings shared across the app (header, nav, footer, generic words).
// Keys are flat; they are addressed as `common.<key>`, e.g. t("common.nav.shops").
// Plural pairs use the `_one` / `_other` suffixes and are read with t.n("common.count.questions", n).
export const common = {
  "app.name": "AI Visibility",
  "app.tagline": "See whether AI assistants recommend your shop",
  "app.home": "AI Visibility home",
  "app.skipToContent": "Skip to main content",

  "nav.label": "Main",
  "nav.shops": "Your shops",
  "nav.providers": "Connected AIs",

  "search.button": "Search",
  "search.label": "Search shops and pages (Ctrl K)",

  "lang.label": "Language",
  "lang.button": "Change language (now {lang})",

  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "Same as device",
  "theme.toLight": "Switch to light theme",
  "theme.toDark": "Switch to dark theme",
  "theme.current": "Theme: {theme}",

  "details.label": "Show the numbers behind this",
  "details.short": "Numbers",
  "details.hint": "Shows the scores, confidence ranges and detailed tables",

  "footer.text": "Checks how often AI assistants name your shop when people ask them for suggestions.",

  "notFound.title": "Page not found",
  "notFound.body": "This page doesn't exist or has moved.",
  "notFound.back": "Back to your shops",

  "loading": "Loading…",
  "error": "Something went wrong",
  "error.network": "Couldn't reach the server. Check that it is running, then try again.",
  "retry": "Try again",
  "back": "Back",
  "save": "Save",
  "saving": "Saving…",
  "cancel": "Cancel",
  "close": "Close",
  "delete": "Delete",
  "edit": "Edit",
  "add": "Add",
  "yes": "Yes",
  "no": "No",
  "next": "Next",
  "done": "Done",
  "on": "On",
  "off": "Off",
  "optional": "optional",
  "required": "Required",
  "showMore": "Show more",
  "showLess": "Show less",
  "seeAll": "See all",
  "learnMore": "Learn more",
  "unknown": "Unknown",
  "none": "None",

  "count.questions_one": "{n} question",
  "count.questions_other": "{n} questions",
  "count.answers_one": "{n} answer",
  "count.answers_other": "{n} answers",
  "count.ais_one": "{n} AI",
  "count.ais_other": "{n} AIs",
  "count.shops_one": "{n} shop",
  "count.shops_other": "{n} shops",
} as const;

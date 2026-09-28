// English strings shared across the app (header, nav, footer, generic words).
// Keys are flat; they are addressed as `common.<key>`, e.g. t("common.nav.providers").
// Plural pairs use the `_one` / `_other` suffixes and are read with t.n("common.count.questions", n).
// Voice: clear, professional, product-report tone. No exclamation marks, no chatty asides.
export const common = {
  "app.name": "BrandVisibility",
  // Slogan under the name in the header.
  "app.tagline": "Visibility intelligence for AI search",
  "app.home": "BrandVisibility home page",
  "app.skipToContent": "Skip to main content",

  // Logo on the landing page: opens the app.
  "nav.app": "Open the BrandVisibility app",
  "nav.providers": "Connections",
  // Same button while the Connections page is open: it takes you back.
  "nav.providersClose": "Close connections",
  // Floating landing-page button: scrolls one viewport down, or (near the bottom) back to top.
  "nav.scrollDown": "Scroll to next section",
  "nav.scrollTop": "Scroll to top",

  "lang.label": "Language",
  // {lang} = current language, {next} = the one a click switches to (each in its own script).
  "lang.button": "Language: {lang}. Switch to {next}",
  // Confirmation after switching; shown in the new language.
  "lang.changed": "Language set to {lang}",

  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
  "theme.toLight": "Switch to light theme",
  "theme.toDark": "Switch to dark theme",
  "theme.current": "Theme: {theme}",

  "details.label": "Show detailed metrics",
  "details.hint": "Component scores, confidence intervals and diagnostic tables",
  // Confirmations after the header switch is pressed.
  "details.on": "Detailed metrics shown",
  "details.off": "Detailed metrics hidden",
  // Small label in the header while detailed metrics are on.
  "details.analyst": "Analyst view",

  "footer.text": "Measures how often AI assistants recommend your brand in response to real customer questions.",

  "notFound.title": "Page not found",
  "notFound.body": "The page you requested does not exist or has been moved.",
  "notFound.back": "Return to overview",

  "errorBoundary.title": "Something went wrong",
  "errorBoundary.body": "This page ran into an unexpected error. Reloading usually fixes it.",
  "errorBoundary.reload": "Reload page",
  "errorBoundary.goToDashboard": "Go to dashboard",

  "loading": "Loading…",
  "error": "Something went wrong",
  "error.network": "Unable to reach the server. Confirm it is running and try again.",
  "retry": "Retry",
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
  "seeAll": "View all",
  "learnMore": "Learn more",
  "unknown": "Unknown",
  "none": "None",

  "count.questions_one": "{n} question",
  "count.questions_other": "{n} questions",
  "count.answers_one": "{n} response",
  "count.answers_other": "{n} responses",
  "count.ais_one": "{n} AI",
  "count.ais_other": "{n} AIs",
  "count.brands_one": "{n} brand",
  "count.brands_other": "{n} brands",
} as const;

// Brand details module (profile + coverage matrix + questions section head). English only for
// now — hi/mr fall back to English at runtime (i18n/index.tsx lookup) until a translation round
// adds them. The questions editor itself keeps its existing pages.q.* / pages.add.* keys —
// they're reused here rather than duplicated.
export const brandinfo = {
  // ---- Profile section
  "profile.eyebrow": "Profile",
  "profile.title": "Brand information",
  "profile.sub": "What this analysis is built from — category, markets, competitors and more.",
  "profile.pilotBadge": "Sample brand — read only",
  "profile.unavailable": "This brand's profile couldn't be loaded. The saved questions are still shown below.",
  "profile.edit": "Edit profile",
  "profile.section.identity": "Identity",
  "profile.section.competition": "Competition",
  "profile.section.customers": "Customers",

  // ---- Edit form (reuses AddBrandForm's pages.add.* labels/placeholders/hints/errors)
  "edit.comparabilityWarning":
    "Changing competitors or alternate names starts a new comparability segment: future runs won't be comparable with earlier ones — the trend restarts.",
  "edit.err.server": "The profile could not be saved. Reason: {message}",
  "edit.err.generic": "The profile could not be saved. Please try again.",
  "edit.err.forbidden": "Sample brands can't be edited.",
  "toast.saved": "Profile updated.",
  "toast.saveError": "Couldn't save changes.",

  // ---- Coverage matrix (question intent × city)
  "coverage.eyebrow": "Coverage",
  "coverage.title": "Question coverage",
  "coverage.sub": "Where each question intent reaches, city by city.",
  "coverage.general": "General",
  "coverage.empty": "No questions yet — coverage appears once the question set is generated.",
  "coverage.blindHint": "Empty cells are blind spots: no question of that intent mentions that city yet.",
  "coverage.cellTitle_one": "{n} question for {intent} in {city}",
  "coverage.cellTitle_other": "{n} questions for {intent} in {city}",
  "coverage.cellTitleGeneral_one": "{n} question for {intent}, not tied to a city",
  "coverage.cellTitleGeneral_other": "{n} questions for {intent}, not tied to a city",

  // ---- Questions section head (the editor body keeps its own pages.q.* copy)
  "questions.eyebrow": "Question set",
  "questions.unavailable": "The question set couldn't be loaded. Try reloading the page.",
};

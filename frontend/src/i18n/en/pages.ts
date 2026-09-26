// English strings for the pages namespace — owned by agent P (other pages).
// Flat keys, addressed as `pages.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - The reader runs a brand of any size (a perfume brand, an optician chain, a street-food stall,
//   a D2C label). Use short, spoken words. "Brand" means the business being checked.
// - "AI assistants" means apps like ChatGPT or Gemini. Keep product names (ChatGPT, Gemini, Google) in Latin script.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - Examples (brand names, places) may be adapted to local ones. {brand} and {name} are brand names — never translate them.
export const pages = {
  // ---------------------------------------------------------------- rating words
  // Shown next to the 0–100 score. Bands: 0–24, 25–49, 50–74, 75–100. The word comes from the
  // low end of the likely range, so it never claims more than the data supports.
  "rating.rarely": "Rarely recommended",
  "rating.sometimes": "Sometimes recommended",
  "rating.often": "Often recommended",
  "rating.top": "Top choice",
  // Small line under the rating when the high end of the range reaches a better band.
  // {rating} is one of the four rating words above, already translated.
  "rating.couldBe": "Could be “{rating}” — AI answers vary.",

  // ---------------------------------------------------------------- data origin badges
  // Made-up answers used to try the app; not a real check.
  "origin.synthetic": "Practice data",
  // Real AI answers recorded earlier and reused.
  "origin.replay": "Saved answers",

  // ---------------------------------------------------------------- question groups (intents)
  // Group headings on the questions page. "…" stands for words that change per brand.
  "intent.category_discovery": "“Best … for …” questions",
  "intent.problem_first": "“How do I …” questions",
  "intent.alternative_seeking": "“Alternatives to …” questions",
  "intent.attribute_constrained": "“Cheapest or fastest …” questions",
  "intent.local_contextual": "Questions about your area",
  "intent.recommendation_seeking": "“Who should I hire to …” questions",
  "intent.identity": "About your brand",
  "intent.fit": "Is your brand right for …",
  "intent.commercial": "About your prices",
  "intent.head_to_head": "Your brand vs others",
  "intent.trust": "Can people trust your brand",
  "intent.sourcing": "Where to find reviews",
  "intent.custom": "Your own questions",
  "intent.other": "Other questions",

  // ---------------------------------------------------------------- Brands (list page)
  "brands.title": "Brands",
  "brands.lede": "How often AI assistants like ChatGPT and Gemini recommend each brand.",
  "brands.searchLabel": "Search brands",
  "brands.searchPlaceholder": "Search brands…",
  "brands.loading": "Loading brands…",
  "brands.loadError": "We couldn't load the brands.",
  "brands.noMatch": "No brand matches “{q}”.",
  "brands.emptyTitle": "No brands yet",
  "brands.emptyBody":
    "Add a brand below. We'll ask AI assistants what your customers ask and show how often you're recommended.",
  "brands.emptyCta": "Add a brand",
  // Accessible name for the whole score, e.g. "Score 42 out of 100".
  "brands.scoreLabel": "Score {score} out of 100",
  // Small text after the big score number.
  "brands.outOf100": "/ 100",
  // {when} is a relative time like "2 days ago".
  "brands.checked": "Checked {when}",
  "brands.noChecks": "Not checked yet — open to check",
  "brands.hasResults": "Has results — open to see them",
  "brands.thin_one": "Only {n} question — results will be rough",
  "brands.thin_other": "Only {n} questions — results will be rough",
  // Shown only in "numbers" mode: one of the three sample brands that came with the app.
  "brands.pilot": "Sample brand",
  "brands.addTitle": "Add a brand",

  // ---------------------------------------------------------------- Add a brand (form)
  // Labels are short nouns. Placeholders for category, audience and customer needs stay in
  // English: the app builds English questions from them.
  "add.intro": "We use these details to write the questions customers ask AI assistants.",
  "add.optional": "(optional)",

  "add.name.label": "Brand name",
  "add.name.placeholder": "e.g. Chitale Bandhu",
  "add.name.hint": "The name customers know you by.",

  "add.category.label": "Category",
  "add.category.placeholder": "e.g. sweets",
  "add.category.hint": "One or two words, e.g. perfume, opticians, vada pav.",

  "add.cities.label": "Locations",
  "add.cities.placeholder": "e.g. Pune, Mumbai",
  "add.cities.hint": "Cities or areas you serve, separated by commas.",

  "add.competitors.label": "Competitors",
  "add.competitors.placeholder": "e.g. Kaka Halwai, Haldiram's",
  "add.competitors.hint": "Brands customers compare you with, separated by commas.",

  "add.audiences.label": "Audience",
  "add.audiences.placeholder": "e.g. families, students",
  "add.audiences.hint": "Who buys from you, separated by commas.",

  "add.jobs.label": "Customer needs",
  // Must start with an action word in English because it becomes "how do I <this>".
  "add.jobs.placeholder": "e.g. buy sweets for Diwali, send gifts to family abroad",
  "add.jobs.hint": "What people come to you for — each becomes a question like “how do I …”; write in English.",

  "add.aliases.label": "Other names",
  "add.aliases.placeholder": "e.g. Chitale, Chitale Sweets",
  "add.aliases.hint": "Short forms or other spellings, separated by commas.",

  "add.submit": "Add brand",
  "add.submitting": "Adding…",
  "add.fixErrors": "Please fix the highlighted fields.",

  "add.err.required": "Please fill this in.",
  // The app can only make a web address for names with English letters (A–Z) or numbers.
  "add.err.latin": "Please use at least one letter or number in the name.",
  "add.err.tooLong": "Too long — use {max} characters or fewer.",
  "add.err.itemTooLong": "“{item}” is too long — each one must be {max} characters or fewer.",
  "add.err.tooMany": "Please list at most {max} — you have {n}.",
  "add.err.self": "Don't list your own brand as a competitor.",
  "add.err.duplicate": "“{item}” is listed twice.",
  // {message} is an English message from the server.
  "add.err.server": "Couldn't add the brand. The reason: {message}",
  "add.err.generic": "Couldn't add the brand. Please try again.",

  // {brand} is the brand name the user just added.
  "add.done_one": "Added **{brand}**. We'll ask AI assistants **{n}** question.",
  "add.done_other": "Added **{brand}**. We'll ask AI assistants **{n}** questions.",
  "add.doneNoCount": "Added **{brand}**.",
  "add.thin": "That's only a few questions, so results will be rough. Tip: add customer needs or more competitors.",
  "add.checkNow": "Check it now",
  "add.seeQuestions": "See the questions",
  "add.another": "Add another brand",

  // ---------------------------------------------------------------- Questions page
  // {brand} is a brand name.
  "q.back": "← Back to {brand}",
  "q.backGeneric": "← Back to results",
  "q.title": "Questions we ask AI",
  "q.lede":
    "Questions a real customer might ask an AI assistant. Each check asks every question that is on and looks for your brand in the answers.",
  "q.namedNote":
    "Questions that name your brand are still asked but don't count toward the score — AI always mentions a brand you name.",
  "q.loading": "Loading the questions…",
  "q.loadError": "We couldn't load the questions.",
  "q.asked": "Asked",
  "q.counted": "Count toward score",
  "q.notCounted": "Don't count",
  "q.off": "Turned off",
  "q.unsaved": "Unsaved changes",
  "q.customized": "Your own list",
  "q.suggested": "Suggested questions",
  "q.unchecked_one": "{n} new or changed question will be checked for your brand name when you save.",
  "q.unchecked_other": "{n} new or changed questions will be checked for your brand name when you save.",
  "q.baseline": "Changing the questions means new results can't be compared with older ones.",
  // "{on} of {total}" questions in this group are turned on.
  "q.groupCount": "{on} of {total} on",
  "q.askedTitle": "Asked in every check",
  "q.notAskedTitle": "Not asked",
  // Accessible name of the on/off switch. {text} is the question itself.
  "q.toggleLabel": "Ask this question: {text}",
  "q.textLabel": "Question text",
  "q.deleteLabel": "Delete this question: {text}",
  "q.badgeNamed": "Not counted — names your brand",
  "q.badgeUnsaved": "Not saved yet",
  "q.badgeYours": "Added by you",
  "q.addTitle": "Add a question",
  "q.addNote": "Write it like a customer would, without your brand name, so it counts. Any language is fine.",
  "q.newLabel": "New question",
  "q.newPlaceholder": "e.g. best place to buy attar in Pune",
  "q.typeLabel": "Question type",
  "q.duplicate": "That question is already in the list.",
  "q.savedCustom": "Saved. The next check will use these questions.",
  "q.savedDefault": "Saved. These match the suggested questions, so new results can be compared with older ones.",
  "q.resetDone": "Back to the suggested questions.",
  "q.resetConfirm": "Go back to the suggested questions? Your own questions and changes will be removed.",
  // {message} is an English message from the server.
  "q.saveError": "We couldn't save the questions. The reason: {message}",
  "q.resetError": "We couldn't reset the questions. The reason: {message}",
  "q.reset": "Go back to suggested questions",
  "q.resetting": "Resetting…",
  "q.save": "Save questions",

  // ---------------------------------------------------------------- AI answers (evidence) page
  "answers.back": "← Back to {brand}",
  "answers.backGeneric": "← Back to results",
  "answers.title": "What the AI assistants said",
  "answers.lede": "The real answers AI assistants gave. Brand names are coloured wherever they appear.",
  "answers.refs_one": "Showing the **{n}** answer behind this suggestion.",
  "answers.refs_other": "Showing the **{n}** answers behind this suggestion.",
  "answers.refsFound": "{found} of them were found in this check.",
  "answers.showAll": "Show all answers",
  "answers.legendTitle": "Colours:",
  "answers.legend.self": "Your brand",
  "answers.legend.competitor": "Competitors",
  "answers.legend.discovered": "Other names mentioned",
  // Explains the small numbered chips, e.g. "#1".
  "answers.legend.rank": "#1 means named first in the answer",
  "answers.search": "Search",
  "answers.searchPlaceholder": "Words in the question or answer…",
  "answers.type": "Question type",
  "answers.allTypes": "All types",
  "answers.ai": "AI assistant",
  "answers.allAis": "All AI assistants",
  "answers.onlyMine": "Only answers that name your brand",
  "answers.count_one": "Showing {shown} of {n} answer · {mentioning} name your brand",
  "answers.count_other": "Showing {shown} of {n} answers · {mentioning} name your brand",
  "answers.loading": "Loading the answers…",
  "answers.loadError": "We couldn't load the answers.",
  "answers.empty": "No answers match these filters.",
  "answers.question": "Question",
  "answers.named": "Names your brand",
  "answers.notNamed": "Doesn't name your brand",
  "answers.notCounted": "Not counted (names your brand)",
  // Short position chip. Keep "#" or use a word that works for any number, e.g. "No. {n}".
  "answers.rank": "#{n}",
  // Hover text for the chip / coloured name. {name} is a brand name, {kind} is "Your brand" / "Competitors" / …
  "answers.rankTitle": "{name} — named at position {n}",
  "answers.markTitle": "{name} ({kind}) — position {n}",
  "answers.modelLabel": "Model",
  "answers.runLabel": "Check ID",

  // ---------------------------------------------------------------- Connections (AI assistants)
  "ais.title": "Connections",
  "ais.lede": "The AI assistants we ask when checking a brand.",
  "ais.loading": "Loading the AI assistants…",
  "ais.loadError": "We couldn't load the list of AI assistants.",
  "ais.connected": "Connected",
  "ais.notSetUp": "Not set up",
  "ais.model": "Model: {model}",
  "ais.askToSetUp": "Ask whoever set up this app to add a key for it.",
  "ais.noneConnected": "No AI assistant is connected yet, so checks use practice data. Ask whoever set up this app to add a key.",
  "ais.connectedCount": "{on} of {total} connected",
  "ais.detailsTitle": "Technical setup",
  "ais.detailsKeys":
    "Keys are read only from environment variables in .env.local (see .env.example) and are never shown here. Restart the backend after adding one.",
  "ais.colId": "ID",
  "ais.colEnv": "Setting",
  "ais.colKind": "Type",
  "ais.kindLive": "Live API",
  "ais.kindOffline": "Offline",
  "ais.offlineSynthetic": "Practice data: made-up answers for trying the app. Not a real check.",
  "ais.offlineReplay": "Saved answers: real AI answers recorded earlier, used again.",
  "ais.autoNote":
    "“auto” uses every connected live AI, or practice data when none is connected.",

  // ---------------------------------------------------------------- Quick search (command palette)
  "palette.label": "Quick search",
  "palette.placeholder": "Go to a brand or page…",
  "palette.empty": "Nothing found",
  "palette.group.brands": "Brands",
  "palette.group.questions": "Questions",
  "palette.group.answers": "AI answers",
  "palette.group.pages": "Pages",
  "palette.brandHint": "Open this brand",
  "palette.brandHintNew": "Not checked yet",
  "palette.questionsFor": "Questions for {brand}",
  "palette.questionsHint": "See or change what the AI is asked",
  "palette.answersFor": "AI answers for {brand}",
  "palette.answersHint": "What the AI assistants said",
  "palette.brandsHint": "All brands",
  "palette.aisHint": "Which AI assistants we ask",
  "palette.navigate": "move",
  "palette.open": "open",
  "palette.close": "close",
} as const;

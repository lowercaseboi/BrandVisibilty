// English strings for the pages namespace — owned by agent P (other pages).
// Flat keys, addressed as `pages.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - The reader is a small shop owner (kirana store, vada pav stall). Use short, spoken words.
// - "AI assistants" means apps like ChatGPT or Gemini. Keep product names (ChatGPT, Gemini, Google) in Latin script.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - Examples (shop names, places) may be adapted to local ones.
export const pages = {
  // ---------------------------------------------------------------- rating words
  // Shown next to the 0–100 score. Bands: 0–24, 25–49, 50–74, 75–100.
  "rating.rarely": "Rarely recommended",
  "rating.sometimes": "Sometimes recommended",
  "rating.often": "Often recommended",
  "rating.top": "Top choice",

  // ---------------------------------------------------------------- data origin badges
  // Made-up answers used to try the app; not a real check.
  "origin.synthetic": "Practice data",
  // Real AI answers recorded earlier and reused.
  "origin.replay": "Saved answers",

  // ---------------------------------------------------------------- question groups (intents)
  // Group headings on the questions page. "…" stands for words that change per shop.
  "intent.category_discovery": "“Best … for …” questions",
  "intent.problem_first": "“How do I …” questions",
  "intent.alternative_seeking": "“Other shops like …” questions",
  "intent.attribute_constrained": "“Cheapest or fastest …” questions",
  "intent.local_contextual": "Questions about your area",
  "intent.recommendation_seeking": "“Who should I hire to …” questions",
  "intent.identity": "About your shop",
  "intent.fit": "Is your shop right for …",
  "intent.commercial": "About your prices",
  "intent.head_to_head": "Your shop compared with others",
  "intent.trust": "Can people trust your shop",
  "intent.sourcing": "Where to find reviews",
  "intent.custom": "Your own questions",
  "intent.other": "Other questions",

  // ---------------------------------------------------------------- Your shops (list page)
  "shops.title": "Your shops",
  "shops.lede":
    "See how often AI assistants like ChatGPT and Gemini suggest your shop when people ask them for a recommendation.",
  "shops.searchLabel": "Search your shops",
  "shops.searchPlaceholder": "Search by shop name…",
  "shops.loading": "Loading your shops…",
  "shops.loadError": "We couldn't load your shops.",
  "shops.noMatch": "No shop matches “{q}”.",
  "shops.emptyTitle": "No shops yet",
  "shops.emptyBody":
    "Add your shop below. We will ask AI assistants the questions your customers ask, and show you how often your shop is suggested.",
  "shops.emptyCta": "Add your shop",
  // Accessible name for the whole score, e.g. "Score 42 out of 100".
  "shops.scoreLabel": "Score {score} out of 100",
  // Small text after the big score number.
  "shops.outOf100": "/ 100",
  // {when} is a relative time like "2 days ago".
  "shops.checked": "Checked {when}",
  "shops.noChecks": "No checks yet — open to check",
  "shops.hasResults": "Has results — open to see them",
  "shops.thin_one": "Only {n} question — results will be rough",
  "shops.thin_other": "Only {n} questions — results will be rough",
  // Shown only in "numbers" mode: one of the three sample shops that came with the app.
  "shops.pilot": "Sample shop",
  "shops.addTitle": "Add your shop",

  // ---------------------------------------------------------------- Add your shop (form)
  "add.intro": "Tell us a little about your shop. We use this to write the questions customers ask AI assistants.",
  "add.optional": "(optional)",
  "add.listHint": "Separate with commas.",

  "add.name.label": "Shop name",
  "add.name.placeholder": "e.g. Sharma Kirana Store",
  "add.name.hint": "The name your customers know you by.",

  "add.category.label": "What do you sell?",
  "add.category.placeholder": "e.g. groceries",
  "add.category.hint": "One or two words, like “vada pav” or “groceries”.",

  "add.cities.label": "Which areas or cities?",
  "add.cities.placeholder": "e.g. Dadar, Mumbai",
  "add.cities.hint": "Where your customers are. Separate with commas.",

  "add.competitors.label": "Nearby competitors",
  "add.competitors.placeholder": "e.g. Patel Stores, Om Supermarket",
  "add.competitors.hint": "AI answers are compared against these shops. Separate with commas.",

  "add.audiences.label": "Who are your customers?",
  "add.audiences.placeholder": "e.g. families, office workers",
  "add.audiences.hint": "Separate with commas.",

  "add.jobs.label": "What do customers come to you for?",
  // Must start with an action word in English because it becomes "how do I <this>".
  "add.jobs.placeholder": "e.g. get a quick breakfast near the station, get monthly groceries delivered",
  "add.jobs.hint":
    "Start each with an action, like “get …” or “find …”. Each one becomes a question such as “how do I get …”. Separate with commas.",

  "add.aliases.label": "Other names people use for your shop",
  "add.aliases.placeholder": "e.g. Sharma Stores, Sharma ji ki dukaan",
  "add.aliases.hint": "Short names or other spellings. Separate with commas.",

  "add.submit": "Add my shop",
  "add.submitting": "Adding…",
  "add.fixErrors": "Please fix the highlighted boxes.",

  "add.err.required": "Please fill this in.",
  // The app can only make a web address for names with English letters (A–Z) or numbers.
  "add.err.latin": "Please use at least one letter or number in the name.",
  "add.err.tooLong": "Too long — please use {max} letters or fewer.",
  "add.err.itemTooLong": "“{item}” is too long — each one must be {max} letters or fewer.",
  "add.err.tooMany": "Please list at most {max} — you have {n}.",
  "add.err.self": "Don't list your own shop as a competitor.",
  "add.err.duplicate": "“{item}” is listed twice.",
  // {message} is an English message from the server.
  "add.err.server": "We couldn't add your shop. The reason: {message}",
  "add.err.generic": "We couldn't add your shop. Please try again.",

  "add.done_one": "Done! We'll ask AI assistants **{n}** question about shops like **{shop}**.",
  "add.done_other": "Done! We'll ask AI assistants **{n}** questions about shops like **{shop}**.",
  "add.doneNoCount": "Done! **{shop}** has been added.",
  "add.thin":
    "That's only a few questions, so results will be rough. Tip: add what customers come to you for, or more nearby competitors.",
  "add.checkNow": "Check my shop now",
  "add.seeQuestions": "See the questions",
  "add.another": "Add another shop",

  // ---------------------------------------------------------------- Questions page
  "q.back": "← Back to {shop}",
  "q.backGeneric": "← Back to your shop",
  "q.title": "Questions we ask the AI",
  "q.lede":
    "These are questions a real customer might type into an AI assistant. Each time we check your shop, we ask every question that is turned on and see if the answer names you.",
  "q.namedNote":
    "Questions with your shop's name are still asked, but they don't count toward your score — the AI always mentions you when you are named.",
  "q.loading": "Loading the questions…",
  "q.loadError": "We couldn't load the questions.",
  "q.asked": "Asked",
  "q.counted": "Count toward score",
  "q.notCounted": "Don't count",
  "q.off": "Turned off",
  "q.unsaved": "Unsaved changes",
  "q.customized": "Your own list",
  "q.suggested": "Suggested questions",
  "q.unchecked_one": "{n} new or changed question will be checked for your shop's name when you save.",
  "q.unchecked_other": "{n} new or changed questions will be checked for your shop's name when you save.",
  "q.baseline": "If you change the questions, new results can't be compared with older ones.",
  // "{on} of {total}" questions in this group are turned on.
  "q.groupCount": "{on} of {total} on",
  "q.askedTitle": "Asked in every check",
  "q.notAskedTitle": "Not asked",
  // Accessible name of the on/off switch. {text} is the question itself.
  "q.toggleLabel": "Ask this question: {text}",
  "q.textLabel": "Question text",
  "q.deleteLabel": "Delete this question: {text}",
  "q.badgeNamed": "Not counted — has your shop's name",
  "q.badgeUnsaved": "Not saved yet",
  "q.badgeYours": "Added by you",
  "q.addTitle": "Add a question",
  "q.addNote":
    "Write it the way a customer would, without your shop's name, so it counts. You can write it in any language.",
  "q.newLabel": "New question",
  "q.newPlaceholder": "e.g. best vada pav near Dadar station",
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
  "answers.back": "← Back to {shop}",
  "answers.backGeneric": "← Back to your shop",
  "answers.title": "What the AI assistants said",
  "answers.lede":
    "These are the real answers the AI assistants gave. Shop names are coloured wherever they appear.",
  "answers.refs_one": "Showing the **{n}** answer behind this suggestion.",
  "answers.refs_other": "Showing the **{n}** answers behind this suggestion.",
  "answers.refsFound": "{found} of them were found in this check.",
  "answers.showAll": "Show all answers",
  "answers.legendTitle": "Colours:",
  "answers.legend.self": "Your shop",
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
  "answers.onlyMine": "Only answers that name your shop",
  "answers.count_one": "Showing {shown} of {n} answer · {mentioning} name your shop",
  "answers.count_other": "Showing {shown} of {n} answers · {mentioning} name your shop",
  "answers.loading": "Loading the answers…",
  "answers.loadError": "We couldn't load the answers.",
  "answers.empty": "No answers match these filters.",
  "answers.question": "Question",
  "answers.named": "Names your shop",
  "answers.notNamed": "Doesn't name your shop",
  "answers.notCounted": "Not counted (has your shop's name)",
  // Short position chip. Keep "#" or use a word that works for any number, e.g. "No. {n}".
  "answers.rank": "#{n}",
  // Hover text for the chip / coloured name. {name} is a shop name, {kind} is "Your shop" / "Competitors" / …
  "answers.rankTitle": "{name} — named at position {n}",
  "answers.markTitle": "{name} ({kind}) — position {n}",
  "answers.modelLabel": "Model",
  "answers.runLabel": "Check ID",

  // ---------------------------------------------------------------- Connected AIs
  "ais.title": "Connected AIs",
  "ais.lede": "Your shop is checked by asking these AI assistants.",
  "ais.loading": "Loading the AI assistants…",
  "ais.loadError": "We couldn't load the list of AI assistants.",
  "ais.connected": "Connected",
  "ais.notSetUp": "Not set up",
  "ais.model": "Model: {model}",
  "ais.askToSetUp": "Ask the person who set up this app to add a key for it.",
  "ais.noneConnected":
    "No AI assistant is connected yet, so checks use practice data. Ask the person who set up this app to add a key.",
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
  "palette.placeholder": "Go to a shop or page…",
  "palette.empty": "Nothing found",
  "palette.group.shops": "Shops",
  "palette.group.questions": "Questions",
  "palette.group.answers": "AI answers",
  "palette.group.pages": "Pages",
  "palette.shopHint": "Open this shop",
  "palette.shopHintNew": "No checks yet",
  "palette.questionsFor": "Questions for {shop}",
  "palette.questionsHint": "See or change what the AI is asked",
  "palette.answersFor": "AI answers for {shop}",
  "palette.answersHint": "What the AI assistants said",
  "palette.shopsHint": "All your shops",
  "palette.aisHint": "Which AI assistants check your shop",
  "palette.navigate": "move",
  "palette.open": "open",
  "palette.close": "close",
} as const;

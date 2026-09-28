// English strings for the pages namespace — owned by agent P (other pages).
// Flat keys, addressed as `pages.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - Voice: professional and concise, like an analytics product report. Plain words, no slang,
//   no exclamation marks. The reader may run any size of business, so avoid jargon where a
//   common word works.
// - "AI assistants" means apps like ChatGPT or Gemini. Keep product names (ChatGPT, Gemini, Google) in Latin script.
// - "Question" = a question a customer might ask an AI assistant. "Response" = the AI's answer.
//   "Analysis" = one run that asks every question and scores the responses.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - Examples (brand names, places) may be adapted to local ones. {brand} and {name} are brand names — never translate them.
export const pages = {
  // ---------------------------------------------------------------- rating words
  // Shown next to the 0–100 score. Bands: 0–24, 25–49, 50–74, 75–100. The word comes from the
  // low end of the likely range, so it never claims more than the data supports.
  "rating.rarely": "Low visibility",
  "rating.sometimes": "Moderate visibility",
  "rating.often": "Strong visibility",
  "rating.top": "Category leader",
  // Small line under the rating when the high end of the range reaches a better band.
  // {rating} is one of the four rating words above, already translated.
  "rating.couldBe": "Upper estimate: {rating}. Results vary between runs.",

  // ---------------------------------------------------------------- data origin labels
  // Generated responses used to demonstrate the product; not a real measurement.
  "origin.synthetic": "Simulated data",
  // Real AI responses recorded earlier and scored again.
  "origin.replay": "Replayed responses",

  // ---------------------------------------------------------------- question groups (intents)
  // Group headings on the questions page. "…" stands for words that change per brand.
  "intent.category_discovery": "Category discovery (“best … for …”)",
  "intent.problem_first": "Problem-led (“how do I …”)",
  "intent.alternative_seeking": "Alternatives (“alternatives to …”)",
  "intent.attribute_constrained": "Attribute-led (“cheapest / fastest …”)",
  "intent.local_contextual": "Local intent",
  "intent.recommendation_seeking": "Recommendation requests",
  "intent.identity": "Brand identity",
  "intent.fit": "Suitability (“is … right for …”)",
  "intent.commercial": "Pricing and offers",
  "intent.head_to_head": "Head-to-head comparisons",
  "intent.trust": "Trust and reputation",
  "intent.sourcing": "Reviews and sources",
  "intent.custom": "Custom questions",
  "intent.other": "Other questions",

  // ---------------------------------------------------------------- Home (samples, your brands, try your own)
  "brands.samplesEyebrow": "Benchmarks",
  "brands.samples": "Sample brands",
  "brands.samplesSub": "Pilot brands measured across leading AI assistants. Open one to view the full report.",
  "brands.yoursEyebrow": "Workspace",
  "brands.yours": "Your brands",
  "brands.yoursSub": "Brands added to this workspace.",
  "brands.tryOwnEyebrow": "New analysis",
  "brands.tryOwn": "Analyse your own brand",
  "brands.tryOwnSub":
    "Describe the brand and its market. We generate a set of customer questions and measure how often AI assistants recommend you.",
  // Under a brand's name on its card.
  "brands.tracked_one": "{n} tracked question",
  "brands.tracked_other": "{n} tracked questions",
  "brands.loading": "Loading brands…",
  "brands.loadError": "Brands could not be loaded.",
  // Accessible name for the whole score, e.g. "Score 42 out of 100".
  "brands.scoreLabel": "Score {score} out of 100",
  // {when} is a relative time like "2 days ago".
  "brands.checked": "Updated {when}",
  "brands.noChecks": "Not yet analysed",
  "brands.hasResults": "Results available",
  "brands.thin_one": "Only {n} question — low precision",
  "brands.thin_other": "Only {n} questions — low precision",
  // Delete button on a user's own brand card (never shown on a sample brand).
  "brands.deleteLabel": "Delete analysis",
  "brands.deleteAriaLabel": "Delete analysis for {brand}",
  "brands.deleteConfirm": "Delete {brand} and all its stored analysis? This can't be undone.",
  "brands.deleteDone": "{brand} deleted.",
  "brands.deleteError": "Couldn't delete {brand}. Try again.",

  // ---------------------------------------------------------------- Add a brand (form)
  // Labels are short nouns. Placeholders for category, audience and customer needs stay in
  // English: the app builds English questions from them.
  "add.optional": "(optional)",

  "add.name.label": "Brand name",
  "add.name.placeholder": "e.g. Chitale Bandhu",
  "add.name.hint": "The name customers use for the brand.",

  "add.category.label": "Category",
  "add.category.placeholder": "e.g. sweets",
  "add.category.hint": "One or two words, e.g. perfume, opticians, vada pav.",

  "add.cities.label": "Markets",
  "add.cities.placeholder": "e.g. Pune, Mumbai",
  "add.cities.hint": "Cities or regions served, separated by commas.",

  "add.competitors.label": "Competitors",
  "add.competitors.placeholder": "e.g. Kaka Halwai, Haldiram's",
  "add.competitors.hint": "Brands customers compare you with, separated by commas.",

  "add.audiences.label": "Target audience",
  "add.audiences.placeholder": "e.g. families, students",
  "add.audiences.hint": "Customer segments, separated by commas.",

  "add.jobs.label": "Customer needs",
  // Must start with an action word in English because it becomes "how do I <this>".
  "add.jobs.placeholder": "e.g. buy sweets for Diwali, send gifts to family abroad",
  "add.jobs.hint": "What customers want to achieve. Each becomes a “how do I …” question; write in English.",

  "add.aliases.label": "Alternate names",
  "add.aliases.placeholder": "e.g. Chitale, Chitale Sweets",
  "add.aliases.hint": "Short forms or alternate spellings, separated by commas.",

  "add.submit": "Create analysis",
  "add.submitting": "Creating…",
  "add.fixErrors": "Please correct the highlighted fields.",

  "add.err.required": "This field is required.",
  // The app can only make a web address for names with English letters (A–Z) or numbers.
  "add.err.latin": "The name must contain at least one letter or number.",
  "add.err.tooLong": "Too long — maximum {max} characters.",
  "add.err.itemTooLong": "“{item}” is too long — each entry must be {max} characters or fewer.",
  "add.err.tooMany": "Maximum of {max} entries — {n} provided.",
  "add.err.self": "The brand cannot be listed as its own competitor.",
  "add.err.duplicate": "“{item}” is listed more than once.",
  // {message} is an English message from the server.
  "add.err.server": "The brand could not be created. Reason: {message}",
  "add.err.generic": "The brand could not be created. Please try again.",

  // {brand} is the brand name the user just added.
  "add.done_one": "**{brand}** created. The analysis will run **{n}** question against AI assistants.",
  "add.done_other": "**{brand}** created. The analysis will run **{n}** questions against AI assistants.",
  "add.doneNoCount": "**{brand}** created.",
  "add.thin": "A small question set gives low precision. Add customer needs or competitors to broaden it.",
  "add.checkNow": "Run analysis",
  "add.seeQuestions": "Review questions",
  "add.another": "Add another brand",

  // ---------------------------------------------------------------- Questions page
  // {brand} is a brand name.
  "q.back": "← {brand}",
  "q.backGeneric": "← Back to report",
  "q.title": "Question set",
  "q.lede":
    "Questions a real customer might put to an AI assistant. Each analysis runs every active question and records whether your brand appears in the response.",
  "q.namedNote":
    "Questions that name your brand are still run but excluded from the score — an AI will always mention a brand the question names.",
  "q.loading": "Loading questions…",
  "q.loadError": "Questions could not be loaded.",
  "q.asked": "Active",
  "q.counted": "Counted",
  "q.notCounted": "Not counted",
  "q.off": "Paused",
  "q.unsaved": "Unsaved changes",
  "q.customized": "Custom set",
  "q.suggested": "Suggested set",
  "q.unchecked_one": "{n} new or edited question will be screened for your brand name on save.",
  "q.unchecked_other": "{n} new or edited questions will be screened for your brand name on save.",
  "q.baseline": "Changing the question set starts a new baseline: new results will not be comparable with earlier ones.",
  // "{on} of {total}" questions in this group are active.
  "q.groupCount": "{on} of {total} active",
  "q.askedTitle": "Run in every analysis",
  "q.notAskedTitle": "Paused",
  // Accessible name of the on/off switch. {text} is the question itself.
  "q.toggleLabel": "Include this question: {text}",
  "q.textLabel": "Question text",
  "q.deleteLabel": "Delete this question: {text}",
  "q.badgeUnsaved": "Unsaved",
  "q.badgeYours": "Custom",
  // Hover text on the per-question bar: result of the last analysis.
  "q.hitTitle": "Brand named in {m} of {n} responses in the last analysis",
  // Collapsed section holding questions that are switched off. {n} = how many.
  "q.pausedTitle": "Paused questions ({n})",
  "q.addTitle": "Add a question",
  "q.addNote": "Phrase it as a customer would, without your brand name, so it is scored. Any language is accepted.",
  "q.newLabel": "New question",
  "q.newPlaceholder": "e.g. best place to buy attar in Pune",
  "q.typeLabel": "Question type",
  "q.duplicate": "This question is already in the set.",
  "q.savedCustom": "Saved. The next analysis will use this question set.",
  "q.savedDefault": "Saved. This matches the suggested set, so results remain comparable with earlier analyses.",
  "q.resetDone": "Restored the suggested question set.",
  "q.resetConfirm": "Restore the suggested question set? Custom questions and edits will be removed.",
  // {message} is an English message from the server.
  "q.saveError": "The questions could not be saved. Reason: {message}",
  "q.resetError": "The questions could not be reset. Reason: {message}",
  "q.reset": "Restore suggested set",
  "q.resetting": "Restoring…",
  "q.save": "Save question set",

  // ---------------------------------------------------------------- AI responses (evidence) page
  "answers.back": "← {brand}",
  "answers.backGeneric": "← Back to report",
  "answers.title": "AI responses",
  "answers.lede": "Verbatim responses from AI assistants. Brand mentions are highlighted wherever they occur.",
  "answers.refs_one": "Showing the **{n}** response behind this recommendation.",
  "answers.refs_other": "Showing the **{n}** responses behind this recommendation.",
  "answers.refsFound": "{found} were found in this analysis.",
  "answers.showAll": "Show all responses",
  "answers.legendTitle": "Legend:",
  "answers.legend.self": "Your brand",
  "answers.legend.competitor": "Competitors",
  "answers.legend.discovered": "Other brands mentioned",
  // Explains the small position markers, e.g. "#1".
  "answers.legend.rank": "#1 = first brand named in the response",
  "answers.search": "Search",
  "answers.searchPlaceholder": "Search questions and responses…",
  "answers.type": "Question type",
  "answers.allTypes": "All types",
  "answers.ai": "AI assistant",
  "answers.allAis": "All AI assistants",
  "answers.onlyMine": "Only responses that mention your brand",
  "answers.count_one": "{shown} of {n} response · {mentioning} mention your brand",
  "answers.count_other": "{shown} of {n} responses · {mentioning} mention your brand",
  "answers.loading": "Loading responses…",
  "answers.loadError": "Responses could not be loaded.",
  "answers.empty": "No responses match these filters.",
  "answers.question": "Question",
  "answers.named": "Brand mentioned",
  "answers.notNamed": "Brand not mentioned",
  "answers.notCounted": "Not scored (question names the brand)",
  // Short position marker. Keep "#" or use a word that works for any number, e.g. "No. {n}".
  "answers.rank": "#{n}",
  // Hover text for the marker / highlighted name. {name} is a brand name, {kind} is "Your brand" / "Competitors" / …
  "answers.rankTitle": "{name} — position {n}",
  "answers.markTitle": "{name} ({kind}) — position {n}",
  "answers.modelLabel": "Model",
  "answers.runLabel": "Run ID",

  // ---------------------------------------------------------------- Connections (AI assistants)
  "ais.title": "Connections",
  "ais.lede": "AI assistants queried during each analysis.",
  "ais.loading": "Loading connections…",
  "ais.loadError": "Connections could not be loaded.",
  "ais.connected": "Connected",
  "ais.notSetUp": "Not configured",
  "ais.model": "Model: {model}",
  "ais.askToSetUp": "Requires an API key. Contact your administrator to enable it.",
  "ais.noneConnected":
    "No AI assistant is connected, so analyses use simulated data. Contact your administrator to add an API key.",
  "ais.connectedCount": "{on} of {total} connected",
  "ais.detailsTitle": "Technical configuration",
  "ais.detailsKeys":
    "Keys are read only from environment variables in .env.local (see .env.example) and are never displayed. Restart the backend after adding one.",
  "ais.colId": "ID",
  "ais.colEnv": "Variable",
  "ais.colKind": "Type",
  "ais.kindLive": "Live API",
  "ais.kindOffline": "Offline",
  "ais.offlineSynthetic": "Simulated data: generated responses for demonstration. Not a real measurement.",
  "ais.offlineReplay": "Replayed responses: real AI responses recorded earlier and scored again.",
  "ais.autoNote": "“auto” uses every connected live AI, or simulated data when none is connected.",

  // ---------------------------------------------------------------- Landing page (public marketing site at "/")
  // Recreates the team's live demo site for BrandVisibility. "BrandVisibility", brand names (Ashok
  // Vada Pav, Aaram Vada Pav, Gajanan Vada Pav) and AI product names (ChatGPT, Gemini) stay in
  // Latin script even when translated.
  "landing.nav.why": "Why this matters",
  "landing.nav.workflow": "Workflow",
  "landing.nav.sample": "Sample",
  "landing.nav.features": "What it does",
  "landing.cta": "Try it out →",
  // Shown in the header CTA below ~480px via CSS generated content (landing.css) — the real
  // string above stays the link's accessible name; keep this in sync with that CSS by hand.
  "landing.ctaShort": "Try it →",

  "landing.hero.eyebrow": "Brand intelligence",
  "landing.hero.line1": "AI assistants already recommend brands.",
  "landing.hero.line2": "BrandVisibility shows you which.",
  "landing.hero.lede": "We run the questions real customers ask AI assistants, and score whether the brand gets named.",
  "landing.hero.workflowCta": "See the workflow",
  "landing.hero.cardLabel": "AI assistant · illustrative example",
  "landing.hero.prompt": "best vada pav near Dadar station?",
  "landing.hero.answer":
    "“Ashok Vada Pav is a popular choice near Dadar station, known for its spicy garlic chutney. Aaram Vada Pav is another local favourite, often recommended for its consistent quality.”",
  "landing.hero.check1": "Ashok Vada Pav — named first",
  "landing.hero.check2": "Aaram Vada Pav — mentioned",
  "landing.hero.check3": "Gajanan Vada Pav — not mentioned",

  "landing.context.eyebrow": "Why this matters",
  "landing.context.title": "A shortlist is being decided without you.",
  "landing.context.before.tag": "[ before ]",
  "landing.context.before.body": "Customers asked friends, searched maps, and read reviews before choosing.",
  "landing.context.now.tag": "[ now ]",
  "landing.context.now.body": "They ask an AI assistant and get one shortlist — and that's usually as far as it goes.",
  "landing.context.gap.tag": "[ the gap ]",
  "landing.context.gap.body": "No one tells a brand whether it made that shortlist. BrandVisibility measures it.",

  "landing.workflow.eyebrow": "The workflow",
  "landing.workflow.title": "From an unscored question to a tracked score.",
  "landing.workflow.step1.title": "Add a brand",
  "landing.workflow.step1.body": "Describe the brand: category, cities, competitors, and what customers come to it for.",
  "landing.workflow.step2.title": "Generate customer questions",
  "landing.workflow.step2.body": "We draft a set of realistic questions a customer might actually ask an AI assistant.",
  "landing.workflow.step3.title": "Ask across AI assistants",
  "landing.workflow.step3.body": "The same questions go to ChatGPT, Gemini, and every other assistant you've connected.",
  "landing.workflow.step4.title": "Score visibility",
  "landing.workflow.step4.body": "Coverage, prominence, and share of voice, rolled into a 0–100 score with a likely range.",
  "landing.workflow.step5.title": "Find gaps and act",
  "landing.workflow.step5.body": "Deterministic rules flag exactly where visibility is missing, each with a traceable recommendation.",
  "landing.workflow.step6.title": "Rerun and compare",
  "landing.workflow.step6.body": "Run the same question set again later and see whether the score actually moved.",

  "landing.sample.eyebrow": "Pilot brands",
  "landing.sample.title": "Sample analysis",
  "landing.sample.note": "This shows simulated sample data from our pilot brands.",
  "landing.sample.liveCta": "For live results, try it out →",
  "landing.sample.pickBrand": "Choose a pilot brand",
  "landing.sample.loading": "Loading a sample…",
  "landing.sample.unavailable": "A sample isn't available right now.",
  "landing.sample.question": "Question",
  "landing.sample.answer": "Answer",
  "landing.sample.legend": "Legend:",
  "landing.sample.simulatedTag": "Simulated data",

  "landing.features.eyebrow": "What it does",
  "landing.features.title": "Enough detail to act on, not a score out of ten.",
  "landing.features.f1.title": "Read the answers in full",
  "landing.features.f1.body": "Every response an AI assistant gives about the brand, kept verbatim so it can be checked, not summarised away.",
  "landing.features.f2.title": "Compare across AI assistants",
  "landing.features.f2.body": "See where ChatGPT, Gemini, and the rest agree, and where only one of them recommends the brand.",
  "landing.features.f3.title": "Honest ranges, not a single number",
  "landing.features.f3.body": "Every score ships with a likely range, so a lucky sample can't overstate how visible the brand really is.",
  "landing.features.f4.title": "Benchmark competitors",
  "landing.features.f4.body": "See who gets named alongside the brand, how often, and who ranks ahead of it.",
  "landing.features.f5.title": "Every recommendation traces to a gap",
  "landing.features.f5.body": "No suggestion is untraceable — each one points back to the exact gap and the answers behind it.",
  "landing.features.f6.title": "Track change over reruns",
  "landing.features.f6.body": "Run the same question set again and see whether visibility actually moved.",
} as const;

// English strings for the dashboard namespace — owned by agent D (dashboard).
// Flat keys, addressed as `dashboard.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - The reader is a small shop owner (kirana store, vada pav stall, optician) in Mumbai.
//   Use short, spoken words. "AI assistants" means apps like ChatGPT or Google Gemini.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - {ai} / {ais} are AI product names such as "Google Gemini" or "Google Gemini and Groq" (already joined).
// - {shop}, {name}, {competitor} are shop names — never translate them.
// - Keep Google, Justdial, Zomato, Swiggy, Instagram, WhatsApp, Quora, Reddit, YouTube in Latin script.
// - Keys under "details.", "metrics.", "admission.", "providers.", "gaps.", "recs." are for the
//   "numbers behind this" view (examiners); technical words are allowed there.
export const dashboard = {
  // ================================================================ page header
  // Breadcrumb link back to the list of shops.
  "crumbs.back": "← All your shops",
  "loading": "Loading your results…",
  "error.load": "We couldn't load this shop's results.",
  // Under the shop name. {when} is e.g. "2 days ago"; {ais} e.g. "Google Gemini and Groq".
  "head.lastChecked": "Last checked {when} · asked {ais}",
  // Same, when the last check used made-up practice answers.
  "head.lastCheckedPractice": "Last checked {when} · practice data, no AI was asked",
  // Button: opens the list of questions the app asks AI assistants.
  "head.questions": "Questions we ask",
  // Button: opens every answer the AI assistants gave.
  "head.answers": "See all AI answers",

  // ================================================================ honesty banners
  "banner.synthetic.title": "Practice data — not a real check",
  "banner.synthetic.body": "The app made up these answers so you can see how it works. Connect an AI to get real results.",
  "banner.replay.title": "Saved answers",
  "banner.replay.body": "These are real AI answers saved earlier and scored again. No AI was asked this time.",
  // {ais} = the AI names that did not answer, e.g. "Groq".
  "banner.partial_one": "{ais} didn't answer this time, so these results use the other AIs only.",
  "banner.partial_other": "{ais} didn't answer this time, so these results use the other AIs only.",
  "banner.partialUnknown": "Some answers were missing in this check, so the results are a little rough.",
  "banner.questionsChanged": "Your questions changed after this check. Check again to see results for the new questions.",
  "banner.thin_one": "We only ask {n} question for your shop, so results are rough.",
  "banner.thin_other": "We only ask {n} questions for your shop, so results are rough.",
  // Link after the sentence above.
  "banner.thinLink": "Add more questions →",

  // ================================================================ score hero
  "hero.title": "How visible is your shop?",
  // Screen-reader text for the big number, e.g. "Your score: 43 out of 100".
  "hero.scoreAria": "Your score: {score} out of 100",
  // Rating words next to the score. Bands: 0–24, 25–49, 50–74, 75–100.
  "hero.rating.rare": "Rarely recommended",
  "hero.rating.sometimes": "Sometimes recommended",
  "hero.rating.often": "Often recommended",
  "hero.rating.top": "Top choice",
  // {m} = answers that named the shop, {n} = all answers. Plural follows {n}.
  "hero.mentioned_one": "AI assistants mentioned you in **{m} of {n}** answer.",
  "hero.mentioned_other": "AI assistants mentioned you in **{m} of {n}** answers.",
  // "Named first" = the shop was the first one the AI suggested in its answer.
  "hero.first_one": "You were named first **once**.",
  "hero.first_other": "You were named first **{n} times**.",
  "hero.firstNever": "They never named you first — other shops came before you.",
  // {lo} and {hi} are scores out of 100.
  "hero.range": "Likely between {lo} and {hi}.",
  "hero.rangeWhy": "AI answers change a little each time, so your real score is probably somewhere in this range.",
  // Shown when the range is wide. "Thorough" is the name of an option in "Options" below.
  "hero.rangeWide": "Choose **Thorough** when you check again for a sharper number.",
  "hero.rangeWideMax": "Adding more questions will give you a sharper number.",
  // Screen-reader text for the range bar.
  "hero.bandAria": "Likely range {lo} to {hi}, best guess {score}, on a scale of 0 to 100",
  // Compared with the previous check. {n} is a number of points (out of 100).
  "hero.change.up_one": "Up {n} point since the last check",
  "hero.change.up_other": "Up {n} points since the last check",
  "hero.change.down_one": "Down {n} point since the last check",
  "hero.change.down_other": "Down {n} points since the last check",
  "hero.change.same": "Same as the last check",

  // ================================================================ what to do next
  "next.title": "What to do next",
  "next.intro": "Simple things that help AI assistants find and recommend your shop.",
  "next.empty": "Nothing urgent to fix right now. Check again in a few weeks to stay on top.",
  // Effort chips on each suggestion.
  "next.effort.quick": "Quick to do",
  "next.effort.some": "Some work",
  "next.effort.big": "Bigger change",
  // Expected score gain. {n} is a number of points out of 100, e.g. "About +4 points".
  "next.points": "About +{n} points",
  // Button that opens the reason for a suggestion.
  "next.why": "Why?",
  "next.seeAnswers": "See the AI answers →",
  "next.showAll_one": "Show all {n} suggestion",
  "next.showAll_other": "Show all {n} suggestions",
  "next.showFewer": "Show fewer suggestions",
  // Heading of the step list inside a suggestion (screen readers only).
  "next.stepsLabel": "Steps",

  // ---------------------------------------------------------------- suggestion titles and steps
  // One block per kind of suggestion. Steps are short instructions for a local shop in India.
  "action.submit_to_directory.title": "Get your shop listed on Google Maps, Justdial and Zomato/Swiggy",
  "action.submit_to_directory.step1": "Claim your free Google Business Profile (search “Google Business Profile” and follow the steps).",
  "action.submit_to_directory.step2": "Add photos, opening hours, your phone number and what you sell.",
  "action.submit_to_directory.step3": "Use exactly the same shop name and address on every app and website.",

  "action.seek_review_coverage.title": "Get more reviews from happy customers",
  "action.seek_review_coverage.step1": "Ask regular customers to leave a Google review — keep a small QR code at the counter.",
  "action.seek_review_coverage.step2": "Reply politely to every review, good or bad.",
  "action.seek_review_coverage.step3": "Invite local bloggers and Instagram pages about your area to visit your shop.",

  "action.pitch_listicle.title": "Get into “best shops in your area” lists",
  "action.pitch_listicle.step1": "Search Google and Instagram for “best … in your area” lists for your kind of shop.",
  "action.pitch_listicle.step2": "Message the writers or page owners and invite them to try your shop.",
  "action.pitch_listicle.step3": "Send one or two lines on what makes you special, with good photos.",

  "action.faq_page.title": "Answer the questions customers often ask",
  "action.faq_page.step1": "Write down 5 to 10 questions customers ask you (price, timings, delivery, parking).",
  "action.faq_page.step2": "Answer them on your Google profile, your website or in Instagram highlights.",
  "action.faq_page.step3": "Use your shop's name and area in the answers.",

  "action.community_answer.title": "Help people who ask for suggestions online",
  "action.community_answer.step1": "Look for questions on Quora, Reddit and local WhatsApp or Facebook groups where people ask for shops like yours.",
  "action.community_answer.step2": "Give honest, helpful answers — say it is your shop when you suggest it.",
  "action.community_answer.step3": "Do a little of this every week.",

  // {competitor} is a competitor's shop name.
  "action.comparison_page.title": "Show how you are different from {competitor}",
  "action.comparison_page.titleGeneric": "Show how you are different from nearby shops",
  "action.comparison_page.step1": "Make a simple post or page on how you differ: price, quality, service, timings.",
  "action.comparison_page.step2": "Be honest and specific — say what you do best.",
  "action.comparison_page.step3": "Share it on your Google profile, Instagram and WhatsApp status.",

  "action.use_case_page.title": "Post about the special needs you serve",
  "action.use_case_page.step1": "Pick needs you serve well, like office party orders, early breakfast or home delivery.",
  "action.use_case_page.step2": "Make one post for each, with photos and prices.",
  "action.use_case_page.step3": "Share them on Google, Instagram and your WhatsApp Business catalogue.",

  "action.add_attribute_claim.title": "Say clearly what you are best at",
  "action.add_attribute_claim.step1": "Choose one true thing you are best at: cheapest, fastest, oldest, most choice…",
  "action.add_attribute_claim.step2": "Say it the same way on your board, Google profile, Instagram and menu.",
  "action.add_attribute_claim.step3": "Back it up, for example with prices or years in business.",

  "action.clarify_category_descriptor.title": "Describe what you sell in the same simple words everywhere",
  // The example line may be adapted to a local shop.
  "action.clarify_category_descriptor.step1": "Pick one short line, like “Vada pav and snacks stall in Dadar”.",
  "action.clarify_category_descriptor.step2": "Use that same line on Google, Justdial, Zomato/Swiggy, Instagram and WhatsApp Business.",
  "action.clarify_category_descriptor.step3": "Remove old or confusing descriptions.",

  "action.correct_outdated_description.title": "Fix old or wrong information about your shop",
  "action.correct_outdated_description.step1": "Search your shop's name on Google, Justdial and food or shopping apps.",
  "action.correct_outdated_description.step2": "Correct wrong timings, address, phone number or items.",
  "action.correct_outdated_description.step3": "Ask the website to fix what you can't change yourself.",

  "action.video.title": "Make short videos (Reels and YouTube Shorts)",
  "action.video.step1": "Film 15 to 30 second videos of your best item, your shop and happy customers.",
  "action.video.step2": "Say your shop's name and area in the video and in the caption.",
  "action.video.step3": "Post one every week.",

  // ---------------------------------------------------------------- "Why?" — the plain reason
  "why.presence.overallNone": "AI assistants didn't name your shop in any answer when people asked for shops like yours.",
  // {pct} is a percentage, e.g. "12%".
  "why.presence.overall": "AI assistants named your shop in only {pct} of answers when people asked for shops like yours.",
  "why.presence.providerNone": "{ai} never named your shop in its answers.",
  "why.presence.provider": "{ai} named your shop in only {pct} of its answers.",
  // {example} is one of the "intent.*" examples below, e.g. “best … near me”.
  "why.presence.intentNone": "When people ask questions like {example}, AI never names your shop.",
  "why.presence.intent": "When people ask questions like {example}, AI names your shop in only {pct} of answers.",
  "why.presence.intentGeneric": "For one kind of question, AI names your shop in only {pct} of answers.",
  // {rank} is a number like 3.4.
  "why.prominence": "AI assistants mention your shop, but usually near the end of the list (about number {rank} on average).",
  "why.competitive": "When AI names both shops, {competitor} comes before you in {pct} of those answers.",
  "why.representation": "When people ask about your shop by name, {pct} of answers describe it wrongly.",
  "why.representationMixed": "When people ask about your shop by name, different AIs describe it in different ways.",
  "why.representationBoth": "When people ask about your shop by name, {pct} of answers describe it wrongly, and different AIs say different things.",
  // {k} of {n} = counts of websites/videos.
  "why.source": "{k} of the {n} top websites and videos about shops like yours never mention you.",
  "why.unknown": "We found something that is holding your shop back.",

  // Short examples of the kinds of questions people ask ("…" = words that change).
  "intent.category_discovery": "“best … near me”",
  "intent.problem_first": "“how do I …”",
  "intent.alternative_seeking": "“shops like …”",
  "intent.attribute_constrained": "“cheapest …” or “fastest …”",
  "intent.local_contextual": "“… in my area”",
  "intent.recommendation_seeking": "“where should I go for …”",

  // ================================================================ who AI recommends
  "who.title": "Who AI recommends",
  "who.intro_one": "How often each shop was named in {n} AI answer.",
  "who.intro_other": "How often each shop was named in {n} AI answers.",
  // Your own shop in the chart, e.g. "Gajanan Vada Pav (you)".
  "who.you": "{name} (you)",
  // {m} of {n} answers; plural follows {n}.
  "who.count_one": "Mentioned in {m} of {n} answer",
  "who.count_other": "Mentioned in {m} of {n} answers",
  "who.first_one": "Named first once",
  "who.first_other": "Named first {n} times",
  "who.leader": "**{name}** is named most often.",
  "who.youLead": "**You** are named more often than any other shop you listed. Well done!",

  // ================================================================ a real answer
  "sample.title": "What AI actually said",
  // Label above the question text (the question stays in its own language).
  "sample.asked": "Someone asked:",
  "sample.answeredBy": "{ai} answered:",
  "sample.caption": "This is what the AI actually said.",
  "sample.readMore": "Read more",
  "sample.readLess": "Show less",
  "sample.seeAll": "See all AI answers →",
  // Colour key for highlighted names.
  "sample.markSelf": "Your shop",
  "sample.markCompetitor": "Other shops you listed",
  "sample.markOther": "Other names",
  "sample.legend": "Colours:",

  // ================================================================ over time
  "trend.title": "Over time",
  "trend.single": "This is your first check. Check again next week to see if things change.",
  // Screen-reader summary of the chart.
  "trend.aria": "Your score over time: {first} on {firstDate}, now {last} on {lastDate}.",
  "trend.hint": "Tap or point at a dot to see that check.",
  // Shown when a dot is selected. {score}, {lo}, {hi} are out of 100.
  "trend.point": "{date}: score **{score}** (likely {lo} to {hi})",
  "trend.pointDetails": "{origin} · {ais}",
  "trend.legendScore": "Your score",
  "trend.legendBand": "Likely range",
  "trend.legendBreak": "Your questions or AIs changed here — scores before and after can't be compared.",
  "origin.live": "Real AI answers",
  "origin.synthetic": "Practice data",
  "origin.replay": "Saved answers",

  // ================================================================ check again (run panel)
  "run.titleAgain": "Check again",
  "run.titleFirst": "Check your shop",
  // Big button.
  "run.buttonAgain": "Check again",
  "run.buttonFirst": "Check now",
  "run.starting": "Starting…",
  "run.planLoading": "Getting ready…",
  "run.plan_one": "We'll ask {ais} {n} question.",
  "run.plan_other": "We'll ask {ais} {n} questions.",
  "run.planPractice_one": "We'll make practice answers for {n} question. No AI is asked.",
  "run.planPractice_other": "We'll make practice answers for {n} questions. No AI is asked.",
  "run.time_one": "This takes about {n} minute.",
  "run.time_other": "This takes about {n} minutes.",
  "run.timeShort": "This takes less than a minute.",
  // Button that shows or hides the extra settings.
  "run.options": "Options",
  "run.which": "Which AIs to ask",
  "run.whichAuto": "All connected AIs ({ais})",
  "run.whichAutoPractice": "Practice data (no AI is connected yet)",
  // An offline option in the list, e.g. "Synthetic demo data (offline) — practice data".
  "run.whichPractice": "{ai} — practice data",
  "run.depth": "How thorough",
  "run.depth.quick": "Quick",
  "run.depth.standard": "Standard",
  "run.depth.thorough": "Thorough",
  "run.depth.quickSub": "Asks once",
  "run.depth.standardSub": "Asks 3 times · best choice",
  "run.depth.thoroughSub": "Asks 5 times",
  "run.depthHint": "AI answers change each time. Asking each question more times gives a steadier score, but takes longer.",
  "run.editQuestions": "See or change the questions →",
  "run.running": "Checking your shop…",
  // Overall progress, e.g. "12 of 51 done".
  "run.progress": "{done} of {total} done",
  "run.progressAria": "Check progress",
  // Per-AI state while a check runs.
  "run.state.queued": "Waiting to start",
  "run.state.running": "Asking…",
  // {s} = seconds, e.g. "Waiting 40s".
  "run.state.waiting": "Waiting {s}s — this AI is busy (rate limit)",
  "run.state.waitingNoTime": "Waiting — this AI is busy (rate limit)",
  "run.state.skipped": "Skipped",
  "run.state.autoSkipped": "Skipped — no answer for 2 minutes",
  "run.state.done": "Done",
  "run.failedCount_one": "{n} didn't answer",
  "run.failedCount_other": "{n} didn't answer",
  // Button next to one AI while a check runs.
  "run.skip": "Skip",
  "run.skipAria": "Skip {ai} — the others carry on",
  "run.skipping": "Skipping…",
  "run.finishNow": "Finish now with the answers so far",
  "run.finishing": "Finishing…",
  "run.cancel": "Cancel",
  "run.cancelling": "Stopping…",
  "run.cancelConfirm": "Stop this check? Nothing will be saved.",
  "run.cancelYes": "Yes, stop",
  "run.cancelNo": "Keep going",
  "run.stuckHint": "Is one AI stuck? Skip it and the others carry on. An AI that doesn't answer for 2 minutes is skipped automatically.",
  "run.done.completed": "Done! Your results are up to date.",
  "run.done.partial": "Done, but some answers were missing. The results use the answers we got.",
  "run.done.cancelled": "Check stopped. Nothing was saved.",
  "run.done.failed": "Sorry, the check didn't work. Please try again in a few minutes.",
  "run.error.start": "Couldn't start the check. Please try again.",
  "run.error.poll": "Lost touch with the check. Refresh the page to see if it finished.",
  "run.error.cancel": "Couldn't stop the check.",
  "run.error.skip": "Couldn't skip that AI.",
  // Technical lines, shown only with "numbers behind this" on.
  "run.tech.message": "Server message: {message}",
  "run.tech.error": "Error: {error}",
  "run.tech.calls_one": "{n} AI call in total.",
  "run.tech.calls_other": "{n} AI calls in total.",
  "run.tech.unscored_one": "{n} question names your shop, so it is asked but not scored.",
  "run.tech.unscored_other": "{n} questions name your shop, so they are asked but not scored.",

  // ================================================================ empty state
  "empty.title": "No checks yet",
  "empty.body": "A check asks AI assistants (like Google Gemini) the kind of questions your customers ask — for example “best … near me” — and counts how often they suggest your shop.",
  "empty.body2": "It takes a few minutes. Press the button below to start.",

  // ================================================================ numbers behind this (details)
  "details.title": "The numbers behind this",
  "details.intro": "For anyone who wants to check the method. Scores use only questions that don't name your shop.",
  "details.runId": "Check ID",
  "details.checkedOn": "Checked on",
  "details.scored": "Scored answers",
  "details.mentioning": "Answers naming your shop",
  "details.unscored": "Asked but not scored (question names your shop)",
  "details.clusters": "Question groups (clusters)",
  "details.samples": "Answers per question",
  "details.metrics": "Scores",
  "details.admission": "Can this check be compared over time?",
  "details.perAi": "Per AI",
  "details.gaps": "Problems found (gaps)",
  "details.gapsNote": "Found by fixed rules over the answers — no AI involved.",
  "details.recs": "All suggestions",
  "details.recsNote": "Ranked by priority (expected gain × confidence ÷ effort). Every suggestion links to a problem above and to its answers.",

  "metrics.composite": "Overall score (composite)",
  "metrics.renormalized": "re-weighted, because position can't be measured",
  // CI = confidence interval. {lo} and {hi} are scores out of 100.
  "metrics.ci": "95% confidence range (CI): {lo} – {hi}",
  "metrics.ciNote": "from re-sampling the questions (bootstrap)",
  "metrics.compositeExplainer": "A weighted mix of Coverage, Prominence and Share of voice, out of 100. The band shows how much the score could move by chance alone.",
  "metrics.coverage": "Coverage",
  "metrics.coverageExplainer": "Share of answers that name your shop at all.",
  "metrics.prominence": "Prominence",
  "metrics.prominenceExplainer": "How high your shop appears when it is named (100% = always first).",
  "metrics.prominenceUndefined": "Not measurable",
  "metrics.prominenceUndefinedExplainer": "No mentions to rank — not measurable, which is different from zero.",
  "metrics.sov": "Share of voice",
  "metrics.sovExplainer": "Your mentions as a share of all mentions of you and your competitors.",

  "admission.ok": "✓ Good enough to compare over time (admissible)",
  "admission.no": "⚠ Not good enough to compare over time (not admissible)",
  "admission.partial": "partial check",
  // {q} and {s} are percentages; {policy} is a version like "v0".
  "admission.stats": "Questions answered {q} · Answers collected {s} · rules {policy}",
  "admission.missingAis": "AIs that didn't answer: {ais}",
  "admission.missingQuestions_one": "{n} question got no answer",
  "admission.missingQuestions_other": "{n} questions got no answer",

  "providers.ai": "AI",
  "providers.coverage": "Coverage",
  "providers.answers": "Answers",
  "providers.mentions": "Name your shop",
  "providers.empty": "No per-AI numbers for this check.",

  "gaps.type.presence": "Rarely named",
  "gaps.type.prominence": "Named low in the list",
  "gaps.type.competitive": "Competitor ahead",
  "gaps.type.representation": "Described wrongly",
  "gaps.type.source": "Missing from key websites",
  "gaps.scope.overall": "All AIs and questions",
  "gaps.scope.provider": "On {ai}",
  "gaps.scope.intent": "Question type: {intent}",
  "gaps.scope.competitor": "vs. {name}",
  "gaps.scope.mentions": "Across all mentions",
  "gaps.scope.other": "Overall",
  "gaps.inferred": "inferred",
  "gaps.empty": "No problems found — your shop passes every rule.",
  "gaps.num.coverage": "Coverage",
  "gaps.num.meanRank": "Average position",
  "gaps.num.co": "Named together",
  "gaps.num.beat": "Competitor ahead",
  "gaps.num.disagree": "Described wrongly",
  "gaps.num.sources": "Sources missing you",
  "gaps.evidence_one": "See {n} answer →",
  "gaps.evidence_other": "See {n} answers →",

  "recs.empty": "No suggestions for this check.",
  "recs.delta": "Expected change",
  // {n} is a signed number like "+6.8".
  "recs.deltaValue": "{n} points",
  "recs.priority": "Priority",
  "recs.effort": "Effort",
  "recs.confidence": "Confidence",
  // {n} = effort number (1, 3, 5, 8); {label} = one of the words below.
  "recs.effortValue": "{n} ({label})",
  "recs.effortLabel.1": "listing",
  "recs.effortLabel.3": "content",
  "recs.effortLabel.5": "positioning",
  "recs.effortLabel.8": "product",
  "recs.class.content": "Content",
  "recs.class.messaging": "Message",
  "recs.class.distribution": "Listings and outreach",
  // Link to the problem (gap) this suggestion comes from; {id} is a code like "gap-3f9a…".
  "recs.trace": "↳ Comes from problem {id}",
  "recs.evidence_one": "{n} answer →",
  "recs.evidence_other": "{n} answers →",
  "recs.draftedTemplate": "Written by fixed rules — no AI wrote this",
  "recs.draftedOther": "Written by: {by}",
  "recs.reasoning": "Reasoning from the server (English):",
} as const;

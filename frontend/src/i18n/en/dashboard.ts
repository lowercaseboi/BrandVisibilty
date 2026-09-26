// English strings for the dashboard namespace — owned by agent D (dashboard).
// Flat keys, addressed as `dashboard.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - The reader runs a brand of any size — a perfume brand, an optician chain, a street-food stall,
//   a D2C label. Use short, spoken words. "AI assistants" means apps like ChatGPT or Google Gemini.
// - "Brand" means the business being checked. Pick one word for it and use it everywhere.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - {ai} / {ais} are AI product names such as "Google Gemini" or "Google Gemini and Groq" (already joined).
// - {name} and {competitor} are brand names — never translate them.
// - Keep Google, Justdial, IndiaMART, Zomato, Amazon, Instagram, WhatsApp, Quora, Reddit, YouTube in Latin script.
// - Keys under "details.", "metrics.", "admission.", "providers.", "gaps.", "recs." are for the
//   "numbers behind this" view (examiners); technical words are allowed there.
export const dashboard = {
  // ================================================================ page header
  // Breadcrumb link back to the list of brands.
  "crumbs.back": "← All brands",
  "loading": "Loading your results…",
  "error.load": "We couldn't load this brand's results.",
  // Under the brand name. {when} is e.g. "2 days ago"; {ais} e.g. "Google Gemini and Groq".
  "head.lastChecked": "Last checked {when} · asked {ais}",
  // Same, when the last check used made-up practice answers.
  "head.lastCheckedPractice": "Last checked {when} · practice data, no AI was asked",
  // Button: opens the list of questions the app asks AI assistants.
  "head.questions": "Questions we ask",
  // Button: opens every answer the AI assistants gave.
  "head.answers": "See all AI answers",

  // ================================================================ honesty banners
  "banner.synthetic.title": "Practice data — not a real check",
  "banner.synthetic.body": "These answers are made up so you can see how the app works. Connect an AI for real results.",
  "banner.replay.title": "Saved answers",
  "banner.replay.body": "Real AI answers saved earlier and scored again. No AI was asked this time.",
  // {ais} = the AI names that did not answer, e.g. "Groq".
  "banner.partial_one": "{ais} didn't answer this time, so these results use the other AIs only.",
  "banner.partial_other": "{ais} didn't answer this time, so these results use the other AIs only.",
  "banner.partialUnknown": "Some answers were missing, so these results are a little rough.",
  "banner.questionsChanged": "Your questions changed after this check. Check again to see results for them.",
  "banner.thin_one": "We only ask {n} question for your brand, so results are rough.",
  "banner.thin_other": "We only ask {n} questions for your brand, so results are rough.",
  // Link after the sentence above.
  "banner.thinLink": "Add more questions →",

  // ================================================================ score hero
  "hero.title": "How visible is your brand?",
  // Screen-reader text for the big number, e.g. "Your score: 43 out of 100".
  "hero.scoreAria": "Your score: {score} out of 100",
  // {m} = answers that named the brand, {n} = all answers. Plural follows {n}.
  "hero.mentioned_one": "AI assistants mentioned you in **{m} of {n}** answer.",
  "hero.mentioned_other": "AI assistants mentioned you in **{m} of {n}** answers.",
  // "Named first" = the brand was the first one the AI suggested in its answer.
  "hero.first_one": "You were named first **once**.",
  "hero.first_other": "You were named first **{n} times**.",
  "hero.firstNever": "They never named you first — other brands came before you.",
  // {lo} and {hi} are scores out of 100.
  "hero.range": "Likely between {lo} and {hi}.",
  "hero.rangeWhy": "AI answers vary a little each time, so your real score is probably in this range.",
  // Shown when the range is wide. "Thorough" is the name of an option in "Options" below.
  "hero.rangeWide": "For a sharper number, choose **Thorough** next time you check.",
  "hero.rangeWideMax": "Add more questions for a sharper number.",
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
  "next.intro": "Simple steps that help AI assistants find and recommend your brand.",
  "next.empty": "Nothing urgent to fix. Check again in a few weeks.",
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
  // One block per kind of suggestion. Steps are short instructions for any brand in India
  // (a perfume label, an optician chain, a food stall, an online-only brand).
  "action.submit_to_directory.title": "Get listed on Google and the sites people search",
  "action.submit_to_directory.step1": "Claim your free Google Business Profile (search “Google Business Profile” and follow the steps).",
  "action.submit_to_directory.step2": "List your brand where buyers in your category look — Justdial, IndiaMART, Zomato, Amazon or a trade directory.",
  "action.submit_to_directory.step3": "Use exactly the same brand name, description and contact details everywhere.",

  "action.seek_review_coverage.title": "Get more reviews from happy customers",
  "action.seek_review_coverage.step1": "Ask happy customers for a Google or marketplace review — a QR code on the bill or package helps.",
  "action.seek_review_coverage.step2": "Reply politely to every review, good or bad.",
  "action.seek_review_coverage.step3": "Send samples to bloggers, YouTubers and Instagram pages that review your category.",

  "action.pitch_listicle.title": "Get into “best …” lists and articles",
  "action.pitch_listicle.step1": "Search Google and YouTube for “best …” lists and reviews in your category.",
  "action.pitch_listicle.step2": "Contact the writers, editors or creators and offer them a sample or a visit.",
  "action.pitch_listicle.step3": "Send one or two lines on what makes you different, with good photos.",

  "action.faq_page.title": "Answer the questions customers often ask",
  "action.faq_page.step1": "Write down 5 to 10 questions customers ask you (price, quality, delivery, returns).",
  "action.faq_page.step2": "Answer them on your website, Google profile or Instagram highlights.",
  "action.faq_page.step3": "Mention your brand name and category in the answers.",

  "action.community_answer.title": "Help people who ask for suggestions online",
  "action.community_answer.step1": "Find questions on Quora, Reddit and WhatsApp or Facebook groups where people ask for brands like yours.",
  "action.community_answer.step2": "Give honest, helpful answers — say it is your brand when you suggest it.",
  "action.community_answer.step3": "Do a little of this every week.",

  // {competitor} is a competitor's brand name.
  "action.comparison_page.title": "Show how you are different from {competitor}",
  "action.comparison_page.titleGeneric": "Show how you are different from other brands",
  "action.comparison_page.step1": "Make a simple post or page on how you differ: price, quality, service, range.",
  "action.comparison_page.step2": "Be honest and specific — say what you do best.",
  "action.comparison_page.step3": "Share it on your website, Google profile and Instagram.",

  "action.use_case_page.title": "Post about the needs you serve best",
  "action.use_case_page.step1": "Pick needs you serve well, like gifting, bulk orders, kids' frames or home delivery.",
  "action.use_case_page.step2": "Make one post or page for each, with photos and prices.",
  "action.use_case_page.step3": "Share them on your website, Google profile, Instagram and WhatsApp Business catalogue.",

  "action.add_attribute_claim.title": "Say clearly what you are best at",
  "action.add_attribute_claim.step1": "Choose one true thing you are best at: best value, longest-lasting, oldest, widest range…",
  "action.add_attribute_claim.step2": "Say it the same way on your website, packaging, Google profile and Instagram.",
  "action.add_attribute_claim.step3": "Back it up, for example with prices, test results or years in business.",

  "action.clarify_category_descriptor.title": "Describe what you do in the same words everywhere",
  // The example line may be adapted to a local brand.
  "action.clarify_category_descriptor.step1": "Pick one short line, like “Handmade attars from Pune” or “Opticians in Dadar since 1950”.",
  "action.clarify_category_descriptor.step2": "Use that same line on your website, Google, marketplaces, Instagram and WhatsApp Business.",
  "action.clarify_category_descriptor.step3": "Remove old or confusing descriptions.",

  "action.correct_outdated_description.title": "Fix old or wrong information about your brand",
  "action.correct_outdated_description.step1": "Search your brand name on Google, marketplaces and review sites.",
  "action.correct_outdated_description.step2": "Correct wrong details: products, prices, address, timings or contact.",
  "action.correct_outdated_description.step3": "Ask the site to fix anything you can't change yourself.",

  "action.video.title": "Make short videos (Reels and YouTube Shorts)",
  "action.video.step1": "Film 15 to 30 second videos of your best product, how it's made and happy customers.",
  "action.video.step2": "Say your brand name in the video and in the caption.",
  "action.video.step3": "Post one every week.",

  // ---------------------------------------------------------------- "Why?" — the plain reason
  "why.presence.overallNone": "AI assistants didn't name your brand in any answer when people asked for suggestions in your category.",
  // {pct} is a percentage, e.g. "12%".
  "why.presence.overall": "AI assistants named your brand in only {pct} of answers when people asked for suggestions in your category.",
  "why.presence.providerNone": "{ai} never named your brand in its answers.",
  "why.presence.provider": "{ai} named your brand in only {pct} of its answers.",
  // {example} is one of the "intent.*" examples below, e.g. “best … near me”.
  "why.presence.intentNone": "When people ask questions like {example}, AI never names your brand.",
  "why.presence.intent": "When people ask questions like {example}, AI names your brand in only {pct} of answers.",
  "why.presence.intentGeneric": "For one kind of question, AI names your brand in only {pct} of answers.",
  // {rank} is a number like 3.4.
  "why.prominence": "AI assistants mention your brand, but usually near the end of the list (about number {rank} on average).",
  "why.competitive": "When AI names you both, {competitor} comes before you in {pct} of those answers.",
  "why.representation": "When people ask about your brand by name, {pct} of answers describe it wrongly.",
  "why.representationMixed": "When people ask about your brand by name, different AIs describe it differently.",
  "why.representationBoth": "When people ask about your brand by name, {pct} of answers describe it wrongly, and different AIs say different things.",
  // {k} of {n} = counts of websites/videos.
  "why.source": "{k} of the {n} top websites and videos in your category never mention you.",
  "why.unknown": "We found something that is holding your brand back.",

  // Short examples of the kinds of questions people ask ("…" = words that change).
  "intent.category_discovery": "“best … near me”",
  "intent.problem_first": "“how do I …”",
  "intent.alternative_seeking": "“alternatives to …”",
  "intent.attribute_constrained": "“cheapest …” or “fastest …”",
  "intent.local_contextual": "“… in my area”",
  "intent.recommendation_seeking": "“where should I go for …”",

  // ================================================================ who AI recommends
  "who.title": "Who AI recommends",
  "who.intro_one": "How often each brand was named in {n} AI answer.",
  "who.intro_other": "How often each brand was named in {n} AI answers.",
  // Your own brand in the chart, e.g. "Gajanan Vada Pav (you)".
  "who.you": "{name} (you)",
  // {m} of {n} answers; plural follows {n}.
  "who.count_one": "Mentioned in {m} of {n} answer",
  "who.count_other": "Mentioned in {m} of {n} answers",
  "who.first_one": "Named first once",
  "who.first_other": "Named first {n} times",
  "who.leader": "**{name}** is named most often.",
  "who.youLead": "**You** are named more often than any competitor you listed. Well done!",

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
  "sample.markSelf": "Your brand",
  "sample.markCompetitor": "Competitors you listed",
  "sample.markOther": "Other names",
  "sample.legend": "Colours:",

  // ================================================================ over time
  "trend.title": "Over time",
  "trend.single": "This is your first check. Check again next week to see what changes.",
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
  "run.titleFirst": "Check your brand",
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
  "run.depthHint": "AI answers vary. Asking each question more times gives a steadier score but takes longer.",
  "run.editQuestions": "See or change the questions →",
  "run.running": "Checking your brand…",
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
  "run.stuckHint": "One AI stuck? Skip it and the others carry on. An AI silent for 2 minutes is skipped automatically.",
  "run.done.completed": "Done! Your results are up to date.",
  "run.done.partial": "Done, but some answers were missing. Results use the answers we got.",
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
  "run.tech.unscored_one": "{n} question names your brand, so it is asked but not scored.",
  "run.tech.unscored_other": "{n} questions name your brand, so they are asked but not scored.",

  // ================================================================ empty state
  "empty.title": "No checks yet",
  "empty.body": "A check asks AI assistants (like Google Gemini) the questions your customers ask — for example “best … near me” — and counts how often they suggest your brand.",
  "empty.body2": "It takes a few minutes. Press the button below to start.",

  // ================================================================ numbers behind this (details)
  "details.title": "The numbers behind this",
  "details.intro": "For anyone who wants to check the method. Scores use only questions that don't name your brand.",
  "details.runId": "Check ID",
  "details.checkedOn": "Checked on",
  "details.scored": "Scored answers",
  "details.mentioning": "Answers naming your brand",
  "details.unscored": "Asked but not scored (question names your brand)",
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
  "metrics.coverageExplainer": "Share of answers that name your brand at all.",
  "metrics.prominence": "Prominence",
  "metrics.prominenceExplainer": "How high your brand appears when it is named (100% = always first).",
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
  "providers.mentions": "Name your brand",
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
  "gaps.empty": "No problems found — your brand passes every rule.",
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

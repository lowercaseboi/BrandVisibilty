// English strings for the dashboard namespace (Analysis, Gaps and the AI answers behind them).
// Flat keys, addressed as `dashboard.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - Voice: plain and calm, for a small-business owner. Round numbers into words ("about 1 in 10 of
//   its answers"), no jargon. "AI assistants" means apps like ChatGPT or Google Gemini.
// - Technical wording (confidence intervals, coverage, run IDs, API calls, model names) belongs only
//   to the keys shown in the Analytical view: "details.", "metrics.", "admission.", "providers.",
//   "run.math.", "run.tech.", "recs.", "trend.verdict.detail*", "gaps.num.", "strip.", and from metrics v2
//   "v2.changeDetail", "v2.decomp", "v2.sor", "v2.mde", "v2.answerRate", "v2.legacy*", "v2.rescored",
//   "v2.whoVi", "v2.table.", "v2.h2h.", "v2.config", "v2.bundle", "impact.detail", "impact.untargeted",
//   "impact.drift", "impact.placebo", "impact.prediction", "impact.confoundedBy".
// - "Visibility index" (VI) is the 0–100 score: how often AND how high in the AI's list the brand is named.
// - "Question" = a question a customer might ask; "answer"/"response" = the AI's answer; "analysis" = one run.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - {ai} / {ais} are AI product names such as "Google Gemini" or "Google Gemini and Groq" (already joined).
// - {name} and {competitor} are brand names — never translate them.
// - {freq} (why.*) is one of the why.share.* phrases and ends in "of its answers": it slots into the sentence.
// - Keep Google, Justdial, IndiaMART, Zomato, Amazon, Instagram, WhatsApp, Quora, Reddit, YouTube in Latin script.
export const dashboard = {
  // ================================================================ page header
  // Breadcrumb link back to the overview.
  "crumbs.back": "← Overview",
  "loading": "Loading report…",
  "error.load": "This brand's report could not be loaded.",
  // Under the brand name. {when} is e.g. "2 days ago"; {ais} e.g. "Google Gemini and Groq".
  "head.lastChecked": "Last analysed {when}",
  "head.sources": "Sources: {ais}",
  // Same, when the last analysis used simulated responses.
  "head.lastCheckedPractice": "Last analysed {when} · Practice data, not real AI answers",
  // Button: opens the question set.
  "head.questions": "Questions",
  // Button: opens every AI response.
  "head.answers": "AI responses",

  // ================================================================ collapsible sections
  // Accessible label for the round toggle button when the section's title isn't plain text.
  // {title} is the section's own heading, e.g. "Show Score history" / "Hide Gaps".

  // ================================================================ data-quality banners
  "banner.synthetic.title": "Practice data — not real AI answers",
  "banner.synthetic.body": "These answers were generated for demonstration. Connect an AI to get real results.",
  "banner.replay.title": "Old answers, scored again",
  "banner.replay.body": "These AI answers were saved earlier and checked again. No AI was asked this time.",
  // {ais} = the AI names that did not respond, e.g. "Groq".
  "banner.partial_one": "{ais} didn't answer this time, so the score uses the other AIs.",
  "banner.partial_other": "{ais} didn't answer this time, so the score uses the other AIs.",
  "banner.partialUnknown": "Some answers were missing this time, so the score is a little less reliable.",
  "banner.questionsChanged": "Your questions have changed since this analysis. Run a new analysis to update the score.",
  "banner.thin_one": "Only {n} question is being tracked.",
  "banner.thin_other": "Only {n} questions are being tracked.",
  // Link after the sentence above.
  "banner.thinLink": "Add more questions so the score is more reliable →",

  // ================================================================ score hero
  "hero.title": "AI visibility score",
  // Screen-reader text for the big number, e.g. "Visibility score: 43 out of 100".
  "hero.scoreAria": "Visibility score: {score} out of 100",
  // {m} = responses that mentioned the brand, {n} = all responses. Plural follows {n}.
  "hero.mentioned_one": "Your brand appeared in **{m} of {n}** AI answer.",
  "hero.mentioned_other": "Your brand appeared in **{m} of {n}** AI answers.",
  // "Ranked first" = the brand was the first one the AI suggested in its response.
  "hero.first_one": "It was ranked first **once**.",
  "hero.first_other": "It was ranked first **{n} times**.",
  "hero.firstNever": "It was never ranked first; competitors consistently appeared ahead.",
  // {lo} and {hi} are scores out of 100.
  "hero.range": "Likely range: {lo}–{hi}.",
  "hero.rangeWhy": "AI responses vary between runs, so the true score most likely falls within this interval.",
  // Shown when the range is wide. "Thorough" is the name of an option under "Options" below.
  "hero.rangeWide": "For a tighter estimate, select **Thorough** on the next run.",
  "hero.rangeWideMax": "Expand the question set for a tighter estimate.",
  // Screen-reader text for the range bar.
  "hero.bandAria": "Likely range {lo} to {hi}, point estimate {score}, on a scale of 0 to 100",
  // Compared with the previous analysis. {n} is a number of points (out of 100).
  "hero.change.up_one": "+{n} point since the last analysis",
  "hero.change.up_other": "+{n} points since the last analysis",
  "hero.change.down_one": "−{n} point since the last analysis",
  "hero.change.down_other": "−{n} points since the last analysis",
  // Strip under the range bar comparing mention rates (share of responses naming each brand).
  "hero.peers": "Mention rate vs competitors",
  // {you} = your share like "7%", {ahead} = competitors mentioned more often, {n} = competitors shown.
  "hero.peersLegend": "Your brand: {you} of responses · {ahead} of {n} competitors mentioned more often",
  "hero.peersAhead.none": "No competitor is mentioned more often than you.",
  "hero.peersAhead.all_one": "Your competitor is mentioned more often than you.",
  "hero.peersAhead.all_other": "All {n} competitors are mentioned more often than you.",
  "hero.peersAhead.some_one": "{n} of {total} competitors is mentioned more often than you.",
  "hero.peersAhead.some_other": "{n} of {total} competitors are mentioned more often than you.",
  "hero.change.same": "Unchanged since the last analysis",

  // ================================================================ recommended actions
  "next.title": "Recommended actions",
  "next.intro": "Prioritised steps to improve how AI assistants find and recommend your brand.",
  "next.empty": "No priority issues detected. Re-run the analysis in a few weeks.",
  // Small labels above the two values on each card.
  // Checklist: tick box on each card, and the progress line above the cards.
  "next.markDone": "Mark as done",
  "next.progress": "{done} of {total} completed",
  "next.effortLabel": "Effort",
  "next.impactLabel": "Est. impact",
  "next.effort.quick": "Low",
  "next.effort.some": "Medium",
  "next.effort.big": "High",
  // Expected score gain. {n} is a number of points out of 100, e.g. "+4 pts".
  "next.points": "+{n} pts",
  // Button that opens the rationale for a recommendation.
  "next.why": "See why",
  "next.seeAnswers": "View supporting responses →",
  "next.showAll_one": "Show all {n} recommendation",
  "next.showAll_other": "Show all {n} recommendations",
  "next.showFewer": "Show fewer",
  // Heading of the step list inside a recommendation (screen readers only).
  "next.stepsLabel": "Steps",

  // ---------------------------------------------------------------- recommendation titles and steps
  // One block per kind of recommendation. Steps are short instructions for any brand in India
  // (a perfume label, an optician chain, a food outlet, an online-only brand).
  "action.submit_to_directory.title": "Strengthen listings on Google and key directories",
  "action.submit_to_directory.step1": "Claim and complete your Google Business Profile.",
  "action.submit_to_directory.step2": "List the brand where buyers in your category search — Justdial, IndiaMART, Zomato, Amazon or relevant trade directories.",
  "action.submit_to_directory.step3": "Keep the brand name, description and contact details identical across every listing.",

  "action.seek_review_coverage.title": "Grow review volume and coverage",
  "action.seek_review_coverage.step1": "Request Google or marketplace reviews from satisfied customers; a QR code on invoices or packaging helps.",
  "action.seek_review_coverage.step2": "Respond professionally to every review, positive or negative.",
  "action.seek_review_coverage.step3": "Send samples to bloggers, YouTubers and Instagram creators who review your category.",

  "action.pitch_listicle.title": "Secure placement in “best of” lists and articles",
  "action.pitch_listicle.step1": "Identify “best …” lists and reviews for your category on Google and YouTube.",
  "action.pitch_listicle.step2": "Approach the writers, editors or creators and offer a sample or a visit.",
  "action.pitch_listicle.step3": "Provide a concise summary of what differentiates the brand, with quality images.",

  "action.faq_page.title": "Publish answers to common customer questions",
  "action.faq_page.step1": "Compile 5–10 questions customers frequently ask (pricing, quality, delivery, returns).",
  "action.faq_page.step2": "Answer them on your website, Google profile or Instagram highlights.",
  "action.faq_page.step3": "Reference the brand name and category in each answer.",

  "action.community_answer.title": "Participate in community recommendation threads",
  "action.community_answer.step1": "Find threads on Quora, Reddit and WhatsApp or Facebook groups where people ask for brands like yours.",
  "action.community_answer.step2": "Contribute genuinely helpful answers and disclose your affiliation when recommending the brand.",
  "action.community_answer.step3": "Maintain a steady weekly presence.",

  // {competitor} is a competitor's brand name.
  "action.comparison_page.title": "Publish a comparison with {competitor}",
  "action.comparison_page.titleGeneric": "Publish a comparison with competing brands",
  "action.comparison_page.step1": "Create a clear page or post on how the brand differs: price, quality, service, range.",
  "action.comparison_page.step2": "Be factual and specific about where the brand leads.",
  "action.comparison_page.step3": "Publish it on your website, Google profile and Instagram.",

  "action.use_case_page.title": "Create content for your strongest use cases",
  "action.use_case_page.step1": "Select the needs you serve best, such as gifting, bulk orders, children's frames or home delivery.",
  "action.use_case_page.step2": "Create a dedicated page or post for each, with images and pricing.",
  "action.use_case_page.step3": "Publish across your website, Google profile, Instagram and WhatsApp Business catalogue.",

  "action.add_attribute_claim.title": "Define a clear differentiating claim",
  "action.add_attribute_claim.step1": "Choose one verifiable strength: best value, longest-lasting, most established, widest range…",
  "action.add_attribute_claim.step2": "State it consistently on your website, packaging, Google profile and Instagram.",
  "action.add_attribute_claim.step3": "Substantiate it with pricing, test results or years in business.",

  "action.clarify_category_descriptor.title": "Standardise how the brand describes itself",
  // The example line may be adapted to a local brand.
  "action.clarify_category_descriptor.step1": "Adopt one concise descriptor, e.g. “Handmade attars from Pune” or “Opticians in Dadar since 1950”.",
  "action.clarify_category_descriptor.step2": "Use the same descriptor on your website, Google, marketplaces, Instagram and WhatsApp Business.",
  "action.clarify_category_descriptor.step3": "Remove outdated or inconsistent descriptions.",

  "action.correct_outdated_description.title": "Correct outdated or inaccurate brand information",
  "action.correct_outdated_description.step1": "Audit search results for the brand on Google, marketplaces and review sites.",
  "action.correct_outdated_description.step2": "Update incorrect details: products, pricing, address, hours or contact information.",
  "action.correct_outdated_description.step3": "Request corrections from sites you cannot edit directly.",

  "action.video.title": "Publish short-form video (Reels and YouTube Shorts)",
  "action.video.step1": "Produce 15–30 second videos featuring flagship products, the making process and customer stories.",
  "action.video.step2": "Mention the brand name on camera and in the caption.",
  "action.video.step3": "Publish at least weekly.",

  // ---------------------------------------------------------------- rationale (plain reason)
  "why.share.oneIn": "about 1 in {n} of its answers",
  "why.share.half": "about half of its answers",
  "why.share.most": "most of its answers",
  "why.presence.overallNone": "For general questions about your kind of business, AI never names you.",
  // {pct} is a percentage, e.g. "12%".
  "why.presence.overall": "For general questions about your kind of business, AI names you in {freq}.",
  "why.presence.providerNone": "{ai} never names you.",
  "why.presence.provider": "{ai} names you in {freq}.",
  // {example} is one of the "intent.*" examples below, e.g. “best … near me”.
  "why.presence.intentNone": "For questions like {example}, AI never names you.",
  "why.presence.intent": "For questions like {example}, AI names you in {freq}.",
  "why.presence.intentGeneric": "For one kind of question, AI names you in {freq}.",
  // {rank} is a number like 3.4.
  "why.prominence": "AI does name you, but usually as number {rank} or later in its list.",
  "why.competitive": "When AI names both of you, {competitor} usually comes first.",
  "why.competitiveSome": "When AI names both of you, {competitor} sometimes comes first.",
  "why.representation": "When asked about you by name, AI gets your details wrong in {freq}.",
  "why.representationMixed": "When asked about you by name, AI describes you inconsistently.",
  "why.representationBoth": "When asked about you by name, AI gets your details wrong in {freq}, and the AIs don't agree with each other.",
  // {k} of {n} = counts of websites/videos.
  "why.source": "{k} of the {n} websites and videos AI relies on most don't mention you.",
  "why.unknown": "A factor limiting the brand's visibility was detected.",

  // Short examples of the kinds of questions people make ("…" = words that change).
  "intent.category_discovery": "“best … near me”",
  "intent.problem_first": "“how do I …”",
  "intent.alternative_seeking": "“alternatives to …”",
  "intent.attribute_constrained": "“cheapest …” or “fastest …”",
  "intent.local_contextual": "“… in my area”",
  "intent.recommendation_seeking": "“where should I go for …”",

  // ================================================================ competitive landscape
  "who.title": "Who AI recommends instead",
  "who.intro_one": "Across {n} AI answer, how often each brand was named.",
  "who.intro_other": "Across {n} AI answers, how often each brand was named.",
  // Your own brand in the chart, e.g. "Gajanan Vada Pav (you)".
  "who.you": "{name} (you)",
  // {m} of {n} responses; plural follows {n}.
  "who.count_one": "Mentioned in {m} of {n} answer",
  "who.count_other": "Mentioned in {m} of {n} answers",
  "who.first_one": "Ranked first once",
  "who.first_other": "Ranked first {n} times",
  "who.leader": "**{name}** is mentioned most often.",
  "who.youLead": "**Your brand** is mentioned more often than any competitor you listed.",
  "who.empty": "No competitors have been listed for this brand yet.",

  // ================================================================ sample response
  "sample.title": "Sample AI response",
  // Label above the question text (the question stays in its own language).
  "sample.asked": "Question",
  "sample.answeredBy": "Response from {ai}",
  "sample.response": "Response",
  "sample.caption": "A real answer from this analysis, word for word.",
  "sample.seeAll": "View all responses →",
  // Legend for highlighted names.
  "sample.markSelf": "Your brand",
  "sample.markCompetitor": "Listed competitors",
  "sample.markOther": "Other brands",
  "sample.legend": "Legend:",
  "sample.empty": "No AI response is available to sample yet.",

  // ================================================================ trend
  "trend.title": "Score history",
  // Collapsed summary for the section, e.g. "3 analyses".
  "trend.count_one": "{n} analysis",
  "trend.count_other": "{n} analyses",
  "trend.single": "This is the first analysis. Run another later to establish a trend.",
  // Screen-reader summary of the chart.
  "trend.aria": "Score history: {first} on {firstDate}, now {last} on {lastDate}.",
  "trend.hint": "Select a point to view that analysis.",
  // Shown when a point is selected. {score}, {lo}, {hi} are out of 100.
  "trend.point": "{date}: score **{score}**",
  "trend.pointRange": "{date}: score **{score}** (range {lo}–{hi})",
  "trend.pointDetails": "{origin} · {ais}",
  "trend.legendScore": "Score",
  "trend.legendBand": "Likely range",
  "trend.legendBreak": "The questions or AIs changed here — scores before and after can't be compared.",
  // Trend verdict (AC-8), one line above the chart. Only analyses since the last methodology change
  // count. {delta}, {slope}, {lo}, {hi} are points out of 100; {slope}/{lo}/{hi} carry a sign ("+3.2").
  "trend.verdict.insufficient": "Run another analysis to see how your score is trending.",
  "trend.verdict.noChange": "No real change since last time.",
  "trend.verdict.changeUp": "**Your score went up** by about {delta} points since last time.",
  "trend.verdict.changeDown": "**Your score went down** by about {delta} points since last time.",
  "trend.verdict.improvingWeek": "**Your score is going up** (about +{slope} a week).",
  "trend.verdict.decliningWeek": "**Your score is going down** (about −{slope} a week).",
  // Used when the analyses ran less than a day apart, so a per-week rate would be meaningless.
  "trend.verdict.improvingRun": "**Your score is going up** (about +{slope} per analysis).",
  "trend.verdict.decliningRun": "**Your score is going down** (about −{slope} per analysis).",
  "trend.verdict.noTrend": "No clear trend yet. Small ups and downs are normal.",
  "trend.verdict.detail": "95% range {lo} to {hi}, across {n} comparable analyses.",
  "trend.verdict.detailNoTrend": "Across {n} comparable analyses, the score's movement is within the normal variation of AI answers.",
  "trend.verdict.detailChange": "Their likely ranges don't overlap.",
  "trend.verdict.detailNoChange": "Their likely ranges overlap, so the difference may just be normal variation in AI answers.",
  "trend.verdict.detailInsufficient": "At least 2 comparable analyses are needed since the last methodology change.",
  "trend.verdict.excluded_one": "({n} incomplete analysis left out.)",
  "trend.verdict.excluded_other": "({n} incomplete analyses left out.)",
  "origin.live": "Live AI responses",
  "origin.synthetic": "Simulated data",
  "origin.replay": "Replayed responses",

  // ================================================================ run panel
  "run.titleAgain": "Run a new analysis",
  "run.titleFirst": "Run the first analysis",
  "run.options": "Options",
  // Big button.
  "run.buttonAgain": "Run analysis",
  "run.buttonFirst": "Run analysis",
  "run.starting": "Starting…",
  "run.planLoading": "Preparing…",
  "run.models": "Models",
  "run.questionsLabel": "Questions",
  // Under each depth option: {x} = answers per question, {n} = API calls it would make.
  "run.depthCalls_one": "{x}× · {n} call",
  "run.depthCalls_other": "{x}× · {n} calls",
  // The math line: "27 questions × 3 samples × 2 AIs = 162 API calls". Numbers are shown separately.
  "run.math.questions_one": "question",
  "run.math.questions_other": "questions",
  "run.math.samples_one": "sample",
  "run.math.samples_other": "samples",
  "run.math.ais_one": "AI",
  "run.math.ais_other": "AIs",
  "run.math.calls_one": "API call",
  "run.math.calls_other": "API calls",
  "run.math.unscored_one": "Includes {n} brand-named question: asked, but not scored.",
  "run.math.unscored_other": "Includes {n} brand-named questions: asked, but not scored.",
  "run.math.practice": "This is a practice run: it uses made-up answers, not a real AI.",
  "run.time_one": "Takes about {n} minute",
  "run.time_other": "Takes about {n} minutes",
  "run.timeShort": "Takes under a minute",
  "run.which": "Which AIs to ask",
  "run.whichAuto": "All connected AIs ({ais})",
  "run.whichAutoPractice": "Practice data (no AI connected)",
  // An offline option in the list, e.g. "Synthetic demo data (offline) — simulated data".
  "run.whichPractice": "{ai} — simulated data",
  "run.depth": "How thorough",
  "run.depth.quick": "Quick",
  "run.depth.standard": "Standard",
  "run.depth.thorough": "Thorough",
  "run.depthHint": "AI responses vary. More samples per question give a more stable score but take longer.",
  "run.editQuestions": "Edit questions →",
  "run.running": "Analysis in progress…",
  // Overall progress, e.g. "12 of 51 complete".
  "run.progress": "{done} of {total} complete",
  "run.progressAria": "Analysis progress",
  // Per-AI state while an analysis runs.
  "run.state.queued": "Queued",
  "run.state.running": "Asking…",
  // {s} = seconds, e.g. "Rate limited — retrying in 40s".
  "run.state.waiting": "Busy — trying again in {s}s",
  "run.state.waitingNoTime": "Busy — trying again",
  "run.state.skipped": "Skipped",
  "run.state.autoSkipped": "Skipped — no response for 2 minutes",
  "run.state.done": "Complete",
  "run.failedCount_one": "{n} failed",
  "run.failedCount_other": "{n} failed",
  // Button next to one AI while an analysis runs.
  "run.skip": "Skip",
  "run.skipAria": "Skip {ai} — the others continue",
  "run.skipping": "Skipping…",
  "run.finishNow": "Finish with responses so far",
  "run.finishing": "Finishing…",
  "run.cancel": "Cancel",
  "run.cancelling": "Cancelling…",
  "run.cancelConfirm": "Cancel this analysis? No results will be saved.",
  "run.cancelYes": "Cancel analysis",
  "run.cancelNo": "Continue",
  "run.stuckHint": "If one AI stalls, skip it and the others continue. An AI that is silent for 2 minutes is skipped automatically.",
  "run.done.completed": "Analysis complete. The report is up to date.",
  "run.done.partial": "Analysis complete with some responses missing. Results use the responses received.",
  "run.done.cancelled": "Analysis cancelled. No results were saved.",
  "run.done.failed": "The analysis failed. Please try again in a few minutes.",
  "run.done.interrupted": "The server restarted before this run finished. Run it again.",
  "run.error.start": "The analysis could not be started. Please try again.",
  "run.error.poll": "Lost connection to the analysis. Refresh the page to check its status.",
  "run.error.cancel": "The analysis could not be cancelled.",
  "run.error.skip": "That AI could not be skipped.",
  // Technical lines, shown only in the detailed-metrics view.
  "run.tech.message": "Server message: {message}",
  "run.tech.error": "Error: {error}",
  "run.tech.unscored_one": "{n} question names the brand, so it is run but not scored.",
  "run.tech.unscored_other": "{n} questions name the brand, so they are run but not scored.",

  // ================================================================ empty state
  "empty.title": "No analyses yet",
  "empty.body": "An analysis runs your customer questions — for example “best … near me” — against AI assistants such as Google Gemini and measures how often your brand is recommended.",
  "empty.body2": "It takes a few minutes. Start it below.",

  // ================================================================ detailed metrics (details)
  "details.title": "Detailed metrics",
  "details.intro": "Methodology and diagnostics. Scores use only questions that do not name the brand.",
  "details.runId": "Run ID",
  "details.checkedOn": "Analysed on",
  "details.scored": "Scored responses",
  "details.mentioning": "Responses mentioning the brand",
  "details.unscored": "Run but not scored (question names the brand)",
  "details.clusters": "Question clusters",
  "details.samples": "Samples per question",
  "details.metrics": "Scores",
  "details.admission": "Comparability over time",
  "details.perAi": "By AI source",
  "details.gaps": "Detected gaps",
  "details.gapsNote": "Detected by fixed rules over the responses — no AI involved.",
  "details.recs": "All recommendations",
  "details.recsNote": "Ranked by priority (expected gain × confidence ÷ effort). Each recommendation traces to a gap above and its supporting responses.",

  // Short label in the metric strip for the 95% confidence interval.
  "strip.ci": "95% CI",
  "metrics.composite": "Composite score",
  "metrics.renormalized": "re-weighted, because position can't be measured",
  // CI = confidence interval. {lo} and {hi} are scores out of 100.
  "metrics.ci": "95% confidence interval: {lo} – {hi}",
  "metrics.ciNote": "bootstrap over questions",
  "metrics.compositeExplainer": "A weighted combination of Coverage, Prominence and Share of voice, out of 100. The band shows how much the score could vary by chance alone.",
  "metrics.coverage": "Coverage",
  "metrics.coverageExplainer": "Share of responses that mention the brand at all.",
  "metrics.prominence": "Prominence",
  "metrics.prominenceExplainer": "How high the brand ranks when mentioned (100% = always first).",
  "metrics.prominenceUndefined": "Not measurable",
  "metrics.prominenceUndefinedExplainer": "No mentions to rank — undefined, which is distinct from zero.",
  "metrics.sov": "Share of voice",
  "metrics.sovExplainer": "Brand mentions as a share of all mentions of the brand and its competitors.",

  "admission.ok": "✓ Admissible — comparable over time",
  "admission.no": "⚠ Not admissible — not comparable over time",
  "admission.partial": "partial run",
  // {q} and {s} are percentages; {policy} is a version like "v0".
  "admission.stats": "Question coverage {q} · Sample coverage {s} · policy {policy}",
  "admission.missingAis": "AIs without responses: {ais}",
  "admission.missingQuestions_one": "{n} question received no response",
  "admission.missingQuestions_other": "{n} questions received no response",

  "providers.ai": "AI",
  "providers.coverage": "Coverage",
  "providers.answers": "Responses",
  "providers.mentions": "Mentions",
  "providers.empty": "No per-AI breakdown for this analysis.",

  // Main "Gaps" section on the brand page.
  "gaps.title": "Biggest problems",
  // Collapsed summary for the section, e.g. "3 gaps".
  "gaps.count_one": "{n} gap",
  "gaps.count_other": "{n} gaps",
  "gaps.intro": "The things that make AI skip or under-rank your brand will show up here.",
  "gaps.hint": "Pick one to see the AI answers behind it.",
  "gaps.type.presence": "Not mentioned enough",
  "gaps.type.prominence": "Listed too low",
  "gaps.type.competitive": "A competitor comes first",
  "gaps.type.representation": "Described wrongly",
  "gaps.type.source": "Missing from key websites",
  "gaps.scope.overall": "Across everything we checked",
  "gaps.scope.provider": "On {ai}",
  "gaps.scope.intent": "For questions like {intent}",
  "gaps.scope.competitor": "vs. {name}",
  "gaps.scope.mentions": "Wherever you're mentioned",
  "gaps.scope.other": "In general",
  "gaps.inferred": "inferred",
  "gaps.empty": "Nothing is holding you back on the questions we checked.",
  "gaps.num.coverage": "Coverage",
  "gaps.num.meanRank": "Mean position",
  "gaps.num.co": "Co-mentions",
  "gaps.num.beat": "Competitor ahead",
  "gaps.num.disagree": "Inaccurate",
  "gaps.num.sources": "Sources missing brand",
  "gaps.num.intent": "Question type code",
  "gaps.evidence_one": "See the AI answer ({n}) →",
  "gaps.evidence_other": "See the AI answers ({n}) →",
  "evidence.eyebrow": "Proof",
  "evidence.title": "What the AIs said",
  "evidence.lede": "Each answer word for word. Your brand and competitors are highlighted wherever they come up.",
  "evidence.notCounted": "Not counted (asks about you by name)",
  "evidence.filter": "Filter",
  "evidence.spotlightOutranked": "A real answer where a competitor is named before you.",
  "evidence.spotlightNamed": "A real answer that names your brand.",

  "recs.empty": "No recommendations for this analysis.",
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
  "recs.class.messaging": "Messaging",
  "recs.class.distribution": "Listings and outreach",
  // Link to the gap this recommendation comes from; {id} is a code like "gap-3f9a…".
  "recs.trace": "↳ Traces to gap {id}",
  "recs.evidence_one": "{n} response →",
  "recs.evidence_other": "{n} responses →",
  "recs.draftedTemplate": "Drafted by fixed rules — no AI involved",
  "recs.draftedOther": "Drafted by: {by}",
  "recs.reasoning": "Server rationale (English):",

  // ---------------------------------------------------------------- recommendation card, "Why" line
  // One plain sentence per card, built from the gap and the responses behind it. "You" is the brand
  // owner's brand. {competitor} is a competitor's brand name, {ai} an AI product name such as
  // "Google Gemini", {question} a customer question quoted verbatim (keep it as is; it may be in any
  // language), {rank} a list position like 3.
  "recs.plain.nameInstead": "AI assistants name {competitor} instead of you when people ask “{question}”.",
  "recs.plain.nameInsteadAi": "{ai} names {competitor} instead of you when people ask “{question}”.",
  "recs.plain.missing": "AI assistants don't mention you when people ask “{question}”.",
  "recs.plain.missingAi": "{ai} doesn't mention you when people ask “{question}”.",
  "recs.plain.ahead": "AI assistants put {competitor} ahead of you when people ask “{question}”.",
  "recs.plain.low": "AI assistants mention you, but only after {competitor}, when people ask “{question}”.",
  "recs.plain.lowGeneric": "AI assistants mention you, but near the bottom of the list (position {rank}), when people ask “{question}”.",

  // ---------------------------------------------------------------- recommendation card, full reasoning
  // Three sentences shown together: a finding (what the data shows), the recommended action and the
  // simulated effect on the score. From the engine's reasoning_key / reasoning_params.
  // {brand} and {competitor} are brand names; {provider} an AI product name such as "Google Gemini";
  // {intent_example} one of the "intent.*" examples above, already in quotes; {gap_type} a gap type
  // name such as "Low presence". Percent values are whole numbers and the % sign is in the text.
  // {evidence_count}, {changed_count}, {non_mentioning_count}, {dominant_source_count} are counts;
  // {mean_rank} and {delta} are numbers with one decimal; {closure_rank} is a list position (2 or 3).
  "recs.why.finding.presence_overall_none": "{brand} is not named in any of {evidence_count} AI answers about its category; assistants don't associate it with the category yet.",
  "recs.why.finding.presence_overall_partial": "{brand} is named in only {coverage_pct}% of {evidence_count} AI answers about its category; assistants don't associate it with the category yet.",
  "recs.why.finding.presence_provider_none": "{provider} never names {brand} in any of its {evidence_count} answers, so this assistant's sources don't know the brand yet.",
  "recs.why.finding.presence_provider_partial": "{provider} names {brand} in only {coverage_pct}% of its {evidence_count} answers, so this assistant's sources don't know the brand yet.",
  "recs.why.finding.presence_intent_none": "{brand} never appears in answers to questions like {intent_example}, across {evidence_count} AI responses.",
  "recs.why.finding.presence_intent_partial": "{brand} appears in only {coverage_pct}% of answers to questions like {intent_example}, across {evidence_count} AI responses.",
  "recs.why.finding.presence_intent_none_generic": "{brand} never appears in answers to one type of question, across {evidence_count} AI responses.",
  "recs.why.finding.presence_intent_partial_generic": "{brand} appears in only {coverage_pct}% of answers to one type of question, across {evidence_count} AI responses.",
  "recs.why.finding.prominence": "{brand} is mentioned in {coverage_pct}% of answers, but usually as an afterthought (average position {mean_rank} in the list, across {evidence_count} responses).",
  "recs.why.finding.competitive": "{competitor} shows up alongside {brand} in {co_occurrence_pct}% of answers and is ranked ahead of it in {beat_pct}% of those ({evidence_count} responses).",
  "recs.why.finding.representation": "When asked about {brand} directly, {disagreement_pct}% of answers describe it inconsistently with its real profile.",
  "recs.why.finding.representation_conflicting": "When asked about {brand} directly, {disagreement_pct}% of answers describe it inconsistently with its real profile, and the assistants disagree with each other.",
  "recs.why.finding.source": "{non_mentioning_count} of the {dominant_source_count} websites and videos that dominate this category never mention {brand}.",
  "recs.why.finding.generic": "A gap was detected for {brand}: {gap_type}.",
  "recs.why.action.comparison_page_vs": "Recommended: publish a “{brand} vs {competitor}” comparison page that states where {brand} wins.",
  "recs.why.action.comparison_page": "Recommended: publish a comparison page between {brand} and its main competitors that states where {brand} wins.",
  "recs.why.action.use_case_page_intent": "Recommended: publish a use-case page for questions like {intent_example}, spelling out who {brand} is for and when to choose it.",
  "recs.why.action.use_case_page": "Recommended: publish a use-case page spelling out who {brand} is for and when to choose it.",
  "recs.why.action.faq_page": "Recommended: publish an FAQ answering the exact questions people ask, naming {brand} in each answer.",
  "recs.why.action.video": "Recommended: produce a short video targeting these questions, with {brand} named in the title and description.",
  "recs.why.action.clarify_category_descriptor": "Recommended: use one consistent category description of {brand} everywhere it is listed.",
  "recs.why.action.add_attribute_claim": "Recommended: claim one distinctive, checkable attribute (price, speed, speciality) for {brand} consistently.",
  "recs.why.action.correct_outdated_description": "Recommended: correct outdated or wrong descriptions of {brand} on its own pages and listings.",
  "recs.why.action.submit_to_directory": "Recommended: list {brand} on the directories and local listings AI assistants draw on (maps, review and category directories).",
  "recs.why.action.pitch_listicle": "Recommended: pitch {brand} for inclusion in “best of” roundups and lists for the category.",
  "recs.why.action.seek_review_coverage_provider": "Recommended: get {brand} reviewed by bloggers, food or local guides, or the press, in sources {provider} is likely to read.",
  "recs.why.action.seek_review_coverage": "Recommended: get {brand} reviewed by bloggers, food or local guides, or the press.",
  "recs.why.action.community_answer": "Recommended: answer real community questions (Reddit, Quora, local forums) where {brand} fits.",
  "recs.why.assumption.presence": "If this lifted presence in half of the answers that currently leave it out ({changed_count} answers, as a mention at position {closure_rank}), the visibility score would rise by about {delta} points (simulated).",
  "recs.why.assumption.prominence": "If this moved it up to position {closure_rank} in the {changed_count} answers where it ranks lower, the visibility score would rise by about {delta} points (simulated).",
  "recs.why.assumption.competitive": "If it ranked ahead of {competitor} in the {changed_count} answers where it currently trails, the visibility score would rise by about {delta} points (simulated).",
  "recs.why.assumption.unscored": "This gap isn't measured by the visibility score (it comes from brand-named questions or from websites), so no score change is simulated; it is ranked on evidence alone.",
  "recs.why.assumption.opportunity": "In these answers the typical competitor scores {target_vi} on the visibility index and {brand} scores {self_vi}; matching it would add up to {opportunity} points to {brand}'s overall index. Assuming this action closes about {uptake_pct}% of that gap, expect about +{expected_gain} points (an estimate, not a measurement).",
  "recs.why.assumption.opportunity_vs": "{competitor} scores {target_vi} on the visibility index in these answers and {brand} scores {self_vi}; matching it would add up to {opportunity} points to {brand}'s overall index. Assuming this action closes about {uptake_pct}% of that gap, expect about +{expected_gain} points (an estimate, not a measurement).",
  "recs.why.assumption.opportunity_small": "In these answers the typical competitor scores {target_vi} on the visibility index and {brand} scores {self_vi}. Assuming this action closes about {uptake_pct}% of the gap, expect about +{expected_gain} points: less than the {mde} points a follow-up check can reliably detect, so a later check may not confirm it even if it worked.",
  "recs.why.assumption.opportunity_vs_small": "{competitor} scores {target_vi} on the visibility index in these answers and {brand} scores {self_vi}. Assuming this action closes about {uptake_pct}% of the gap, expect about +{expected_gain} points: less than the {mde} points a follow-up check can reliably detect, so a later check may not confirm it even if it worked.",
  "recs.why.assumption.opportunity_none": "Competitors don't score higher than {brand} in these answers, so no gain is estimated; it is ranked on evidence alone.",

  // ================================================================ metrics v2: visibility index
  // Score card. {rank}/{of} are whole numbers: "#5 of 6".
  "v2.position": "You're **#{rank} of {of}** among the places you track.",
  "v2.positionRange": "You're around **#{low}–#{high} of {of}** among the places you track; the order isn't settled yet.",
  // {named} of {of} questions; "reliably" = in at least half of the answers to that question.
  "v2.reach": "You came up for **{named} of {of}** questions customers ask, and reliably for {reliable}.",
  "v2.reachNever": "You came up for **{named} of {of}** questions customers ask, but never reliably.",
  "v2.reachZero": "You didn't come up for any of the **{of}** questions customers ask.",
  // {name} is a competitor; counts of answers.
  "v2.leader": "{name} is named in {named} answers, you in {you}.",
  "v2.lowInfo": "With this few mentions the score is a rough reading; it can move a lot between checks.",
  // Change since the previous check, as a verdict that never claims a cause.
  "v2.change.rose_after": "Up since the last check.",
  "v2.change.leaning_up": "Probably up a little since the last check.",
  "v2.change.no_detectable_change": "No clear change since the last check.",
  "v2.change.leaning_down": "Probably down a little since the last check.",
  "v2.change.fell_after": "Down since the last check.",
  "v2.change.insufficient_data": "The last check asked too few of the same questions to compare.",
  // Short labels for status pills (Did it work?).
  "v2.verdict.rose_after": "Rose after",
  "v2.verdict.leaning_up": "Probably rose a little",
  "v2.verdict.no_detectable_change": "No clear change yet",
  "v2.verdict.leaning_down": "Probably dipped a little",
  "v2.verdict.fell_after": "Fell after",
  "v2.verdict.insufficient_data": "Too little to compare",
  // Analytical view.
  "v2.changeDetail": "Change {delta} points (95% range {lo} to {hi}) over {q} matched questions, {overlap} of answers comparable; changes under {mde} points can't be told from noise.",
  "v2.decomp": "Named in {presence} of answers × average list-position weight {weight} when named (1 = first place).",
  "v2.sor": "Share of recommendations among tracked places: {sor} (95% range {lo}–{hi}).",
  "v2.mde": "One more check can reliably detect changes of about {mde} points or more.",
  "v2.answerRate": "{pct} of answers named options; the rest asked for a city or declined.",
  "v2.rescored": "Recalculated from this check's stored answers with today's competitor list.",
  "v2.legacy": "Old composite score (v1, kept for comparison): {score} (range {lo}–{hi}). It overstated small brands, see docs/METRICS_v2.md.",
  "v2.legacyTitle": "Old composite score (v1)",
  "v2.whoVi": "Visibility index {vi}",
  "v2.table.title": "Visibility index by AI and by question type",
  "v2.table.intro": "100 = named first in every answer. Answered = the AI gave options instead of asking for a city or declining.",
  "v2.table.ai": "AI",
  "v2.table.intent": "Question type",
  "v2.table.vi": "Index",
  "v2.table.named": "Named",
  "v2.table.answered": "Answered",
  "v2.table.questions": "Questions",
  "v2.table.ofN": "{m} of {n}",
  "v2.h2h.competitor": "Head to head",
  "v2.h2h.vi": "Their index",
  "v2.h2h.ahead": "You ahead",
  "v2.h2h.behind": "They ahead",
  "v2.config": "Method {version}, settings {hash}.",
  "v2.bundle": "Download this check to re-verify every number",

  // ================================================================ did it work? (impact ledger)
  "impact.eyebrow": "Did it work?",
  "impact.title": "What changed after the things you did",
  "impact.intro": "Each finished action is compared with the checks before and after it, on the questions it was meant to help. A rise after an action is a good sign, not proof: other things change too.",
  "impact.status.waiting": "Waiting for the next check",
  "impact.status.no_baseline": "No check before it to compare with",
  "impact.status.confounded": "Mixed with another action",
  // {date} is when the card was marked done / the campaign first went out.
  "impact.done": "Marked done {date}",
  "impact.doneCampaign": "Published {date}",
  "impact.reopened": "moved back out of Done",
  "impact.basisOverall": "Too few of its questions to judge them alone, so your overall score is compared.",
  "impact.detail": "Index {before} → {after} ({delta} points, 95% range {lo} to {hi}) over {q} matched questions; smallest detectable change {mde}.",
  "impact.untargeted": "Your other questions moved {delta} points, so this action's questions moved {did} points more.",
  "impact.drift": "Competitors moved {drift} points on average over the same answers.",
  "impact.placebo": "Between earlier checks with nothing done, this test fired {fired} of {pairs} times.",
  "impact.prediction": "Expected about +{expected} points overall; measured {measured}.",
  "impact.confoundedBy_one": "Another finished action overlaps this one.",
  "impact.confoundedBy_other": "{n} other finished actions overlap this one.",
} as const;

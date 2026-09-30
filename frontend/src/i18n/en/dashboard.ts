// English strings for the dashboard namespace — owned by agent D (dashboard).
// Flat keys, addressed as `dashboard.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - Voice: professional and concise, like an analytics report. Plain words, no slang, no
//   exclamation marks. "AI assistants" means apps like ChatGPT or Google Gemini.
// - "Question" = a question a customer might ask; "response" = the AI's answer; "analysis" = one run.
// - {placeholders} are filled in by the app; keep them exactly. **text** is shown in bold.
// - {ai} / {ais} are AI product names such as "Google Gemini" or "Google Gemini and Groq" (already joined).
// - {name} and {competitor} are brand names — never translate them.
// - Keep Google, Justdial, IndiaMART, Zomato, Amazon, Instagram, WhatsApp, Quora, Reddit, YouTube in Latin script.
// - Keys under "details.", "metrics.", "admission.", "providers.", "gaps.", "recs." are for the
//   detailed-metrics view (examiners); technical words are expected there.
export const dashboard = {
  // ================================================================ page header
  // Breadcrumb link back to the overview.
  "crumbs.back": "← Overview",
  "loading": "Loading report…",
  "error.load": "This brand's report could not be loaded.",
  // Under the brand name. {when} is e.g. "2 days ago"; {ais} e.g. "Google Gemini and Groq".
  "head.lastChecked": "Last analysed {when} · Sources: {ais}",
  // Same, when the last analysis used simulated responses.
  "head.lastCheckedPractice": "Last analysed {when} · Simulated data, no live AI queried",
  // Button: opens the question set.
  "head.questions": "Questions",
  // Button: opens every AI response.
  "head.answers": "AI responses",

  // ================================================================ collapsible sections
  // Accessible label for the round toggle button when the section's title isn't plain text.
  "collapsible.show": "Show this section",
  "collapsible.hide": "Hide this section",
  // {title} is the section's own heading, e.g. "Show Score history" / "Hide Gaps".
  "collapsible.showNamed": "Show {title}",
  "collapsible.hideNamed": "Hide {title}",

  // ================================================================ data-quality banners
  "banner.synthetic.title": "Simulated data — not a live measurement",
  "banner.synthetic.body": "These responses are generated for demonstration. Connect an AI assistant for live results.",
  "banner.replay.title": "Replayed responses",
  "banner.replay.body": "Previously recorded AI responses, scored again. No AI was queried for this run.",
  // {ais} = the AI names that did not respond, e.g. "Groq".
  "banner.partial_one": "{ais} did not respond in this run; results are based on the remaining AIs.",
  "banner.partial_other": "{ais} did not respond in this run; results are based on the remaining AIs.",
  "banner.partialUnknown": "Some responses were missing, which reduces precision for this run.",
  "banner.questionsChanged": "The question set has changed since this analysis. Run a new analysis to reflect it.",
  "banner.thin_one": "Only {n} question is tracked for this brand, so precision is low.",
  "banner.thin_other": "Only {n} questions are tracked for this brand, so precision is low.",
  // Link after the sentence above.
  "banner.thinLink": "Add more questions →",

  // ================================================================ score hero
  "hero.title": "AI visibility score",
  // Screen-reader text for the big number, e.g. "Visibility score: 43 out of 100".
  "hero.scoreAria": "Visibility score: {score} out of 100",
  // {m} = responses that mentioned the brand, {n} = all responses. Plural follows {n}.
  "hero.mentioned_one": "Your brand appeared in **{m} of {n}** AI response.",
  "hero.mentioned_other": "Your brand appeared in **{m} of {n}** AI responses.",
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
  "why.presence.overallNone": "AI assistants did not mention the brand in any response to category-level questions.",
  // {pct} is a percentage, e.g. "12%".
  "why.presence.overall": "AI assistants mentioned the brand in only {pct} of responses to category-level questions.",
  "why.presence.providerNone": "{ai} did not mention the brand in any response.",
  "why.presence.provider": "{ai} mentioned the brand in only {pct} of its responses.",
  // {example} is one of the "intent.*" examples below, e.g. “best … near me”.
  "why.presence.intentNone": "For questions such as {example}, the brand is never mentioned.",
  "why.presence.intent": "For questions such as {example}, the brand appears in only {pct} of responses.",
  "why.presence.intentGeneric": "For one question type, the brand appears in only {pct} of responses.",
  // {rank} is a number like 3.4.
  "why.prominence": "The brand is mentioned but typically ranks low in the list (average position {rank}).",
  "why.competitive": "When both are mentioned, {competitor} is ranked ahead in {pct} of responses.",
  "why.representation": "For questions that name the brand, {pct} of responses describe it inaccurately.",
  "why.representationMixed": "For questions that name the brand, AI assistants describe it inconsistently.",
  "why.representationBoth": "For questions that name the brand, {pct} of responses describe it inaccurately, and AI assistants are inconsistent with each other.",
  // {k} of {n} = counts of websites/videos.
  "why.source": "{k} of the {n} most-cited websites and videos in the category do not mention the brand.",
  "why.unknown": "A factor limiting the brand's visibility was detected.",

  // Short examples of the kinds of questions people make ("…" = words that change).
  "intent.category_discovery": "“best … near me”",
  "intent.problem_first": "“how do I …”",
  "intent.alternative_seeking": "“alternatives to …”",
  "intent.attribute_constrained": "“cheapest …” or “fastest …”",
  "intent.local_contextual": "“… in my area”",
  "intent.recommendation_seeking": "“where should I go for …”",

  // ================================================================ competitive landscape
  "who.title": "Competitive landscape",
  "who.intro_one": "Mention frequency across {n} AI response.",
  "who.intro_other": "Mention frequency across {n} AI responses.",
  // Your own brand in the chart, e.g. "Gajanan Vada Pav (you)".
  "who.you": "{name} (you)",
  // {m} of {n} responses; plural follows {n}.
  "who.count_one": "{m} of {n} response",
  "who.count_other": "{m} of {n} responses",
  "who.first_one": "Ranked first once",
  "who.first_other": "Ranked first {n} times",
  "who.leader": "**{name}** leads on mention frequency.",
  "who.youLead": "**Your brand** leads every listed competitor on mention frequency.",
  "who.empty": "No competitors have been listed for this brand yet.",

  // ================================================================ sample response
  "sample.title": "Sample AI response",
  // Label above the question text (the question stays in its own language).
  "sample.asked": "Question",
  "sample.answeredBy": "Response from {ai}",
  "sample.caption": "A verbatim response from this analysis.",
  "sample.readMore": "Expand",
  "sample.readLess": "Collapse",
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
  "trend.point": "{date}: score **{score}** (range {lo}–{hi})",
  "trend.pointDetails": "{origin} · {ais}",
  "trend.legendScore": "Score",
  "trend.legendBand": "Likely range",
  "trend.legendBreak": "Methodology change (question set or AI sources) — scores on either side are not comparable.",
  // Trend verdict (AC-8), one line above the chart. Only analyses since the last methodology change
  // count. {delta}, {slope}, {lo}, {hi} are points out of 100; {slope}/{lo}/{hi} carry a sign ("+3.2").
  "trend.verdict.insufficient":
    "Not enough comparable analyses yet to judge a trend: at least 2 are needed since the last methodology change.",
  "trend.verdict.noChange":
    "No clear change between the last two analyses: their likely ranges overlap, so the difference may just be normal variation in AI answers.",
  "trend.verdict.changeUp":
    "**Change detected:** up {delta} points since the previous analysis (their likely ranges don't overlap).",
  "trend.verdict.changeDown":
    "**Change detected:** down {delta} points since the previous analysis (their likely ranges don't overlap).",
  "trend.verdict.improvingWeek":
    "**Score is improving:** about {slope} points/week (95% range {lo} to {hi}) across {n} comparable analyses.",
  "trend.verdict.decliningWeek":
    "**Score is declining:** about {slope} points/week (95% range {lo} to {hi}) across {n} comparable analyses.",
  // Used when the analyses ran less than a day apart, so a per-week rate would be meaningless.
  "trend.verdict.improvingRun":
    "**Score is improving:** about {slope} points per analysis (95% range {lo} to {hi}) across {n} comparable analyses.",
  "trend.verdict.decliningRun":
    "**Score is declining:** about {slope} points per analysis (95% range {lo} to {hi}) across {n} comparable analyses.",
  "trend.verdict.noTrend":
    "No clear trend across {n} comparable analyses: the score's movement is within the normal variation of AI answers.",
  "trend.verdict.excluded_one": "({n} incomplete analysis left out.)",
  "trend.verdict.excluded_other": "({n} incomplete analyses left out.)",
  "origin.live": "Live AI responses",
  "origin.synthetic": "Simulated data",
  "origin.replay": "Replayed responses",

  // ================================================================ run panel
  "run.titleAgain": "Run a new analysis",
  "run.titleFirst": "Run the first analysis",
  // Big button.
  "run.buttonAgain": "Run analysis",
  "run.buttonFirst": "Run analysis",
  "run.starting": "Starting…",
  "run.planLoading": "Preparing…",
  "run.sub": "Configure the next analysis. Totals update as you change the settings.",
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
  "run.math.practice": "Simulated run: calls go to the offline simulator, not a live AI.",
  "run.time_one": "Estimated duration: {n} minute.",
  "run.time_other": "Estimated duration: {n} minutes.",
  "run.timeShort": "Estimated duration: under a minute.",
  "run.which": "AI sources",
  "run.whichAuto": "All connected AIs ({ais})",
  "run.whichAutoPractice": "Simulated data (no AI connected)",
  // An offline option in the list, e.g. "Synthetic demo data (offline) — simulated data".
  "run.whichPractice": "{ai} — simulated data",
  "run.depth": "Sampling depth",
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
  "run.state.running": "Querying…",
  // {s} = seconds, e.g. "Rate limited — retrying in 40s".
  "run.state.waiting": "Rate limited — retrying in {s}s",
  "run.state.waitingNoTime": "Rate limited — retrying",
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
  "gaps.title": "Gaps",
  // Collapsed summary for the section, e.g. "3 gaps".
  "gaps.count_one": "{n} gap",
  "gaps.count_other": "{n} gaps",
  "gaps.intro": "Where the brand is losing visibility, detected by fixed rules over the responses.",
  "gaps.type.presence": "Low presence",
  "gaps.type.prominence": "Low prominence",
  "gaps.type.competitive": "Competitor ahead",
  "gaps.type.representation": "Misrepresentation",
  "gaps.type.source": "Source gap",
  "gaps.scope.overall": "All AIs and questions",
  "gaps.scope.provider": "On {ai}",
  "gaps.scope.intent": "Question type: {intent}",
  "gaps.scope.competitor": "vs. {name}",
  "gaps.scope.mentions": "Across all mentions",
  "gaps.scope.other": "Overall",
  "gaps.inferred": "inferred",
  "gaps.empty": "No gaps detected — the brand passes every rule.",
  "gaps.num.coverage": "Coverage",
  "gaps.num.meanRank": "Mean position",
  "gaps.num.co": "Co-mentions",
  "gaps.num.beat": "Competitor ahead",
  "gaps.num.disagree": "Inaccurate",
  "gaps.num.sources": "Sources missing brand",
  "gaps.evidence_one": "{n} response →",
  "gaps.evidence_other": "{n} responses →",

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
} as const;

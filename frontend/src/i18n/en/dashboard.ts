// English strings for the dashboard namespace — owned by agent D (dashboard).
// Flat keys, addressed as `dashboard.<key>`. Plural pairs use `_one` / `_other` suffixes.
//
// Notes for translators:
// - Voice: professional and concise, like an analytics report. Plain words, no slang, no
//   exclamation marks. "AI assistants" means apps like ChatGPT or Google Gemini.
// - "Query" = a question a customer might ask; "response" = the AI's answer; "analysis" = one run.
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
  // Button: opens the query set.
  "head.questions": "Query set",
  // Button: opens every AI response.
  "head.answers": "AI responses",

  // ================================================================ data-quality banners
  "banner.synthetic.title": "Simulated data — not a live measurement",
  "banner.synthetic.body": "These responses are generated for demonstration. Connect an AI assistant for live results.",
  "banner.replay.title": "Replayed responses",
  "banner.replay.body": "Previously recorded AI responses, scored again. No AI was queried for this run.",
  // {ais} = the AI names that did not respond, e.g. "Groq".
  "banner.partial_one": "{ais} did not respond in this run; results are based on the remaining AIs.",
  "banner.partial_other": "{ais} did not respond in this run; results are based on the remaining AIs.",
  "banner.partialUnknown": "Some responses were missing, which reduces precision for this run.",
  "banner.questionsChanged": "The query set has changed since this analysis. Run a new analysis to reflect it.",
  "banner.thin_one": "Only {n} query is tracked for this brand, so precision is low.",
  "banner.thin_other": "Only {n} queries are tracked for this brand, so precision is low.",
  // Link after the sentence above.
  "banner.thinLink": "Expand the query set →",

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
  "hero.rangeWideMax": "Expand the query set for a tighter estimate.",
  // Screen-reader text for the range bar.
  "hero.bandAria": "Likely range {lo} to {hi}, point estimate {score}, on a scale of 0 to 100",
  // Compared with the previous analysis. {n} is a number of points (out of 100).
  "hero.change.up_one": "+{n} point since the last analysis",
  "hero.change.up_other": "+{n} points since the last analysis",
  "hero.change.down_one": "−{n} point since the last analysis",
  "hero.change.down_other": "−{n} points since the last analysis",
  "hero.change.same": "Unchanged since the last analysis",

  // ================================================================ recommended actions
  "next.title": "Recommended actions",
  "next.intro": "Prioritised steps to improve how AI assistants find and recommend your brand.",
  "next.empty": "No priority issues detected. Re-run the analysis in a few weeks.",
  // Small labels above the two values on each card.
  "next.effortLabel": "Effort",
  "next.impactLabel": "Est. impact",
  "next.effort.quick": "Low",
  "next.effort.some": "Medium",
  "next.effort.big": "High",
  // Expected score gain. {n} is a number of points out of 100, e.g. "+4 pts".
  "next.points": "+{n} pts",
  // Button that opens the rationale for a recommendation.
  "next.why": "Rationale",
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
  "why.presence.overallNone": "AI assistants did not mention the brand in any response to category-level queries.",
  // {pct} is a percentage, e.g. "12%".
  "why.presence.overall": "AI assistants mentioned the brand in only {pct} of responses to category-level queries.",
  "why.presence.providerNone": "{ai} did not mention the brand in any response.",
  "why.presence.provider": "{ai} mentioned the brand in only {pct} of its responses.",
  // {example} is one of the "intent.*" examples below, e.g. “best … near me”.
  "why.presence.intentNone": "For queries such as {example}, the brand is never mentioned.",
  "why.presence.intent": "For queries such as {example}, the brand appears in only {pct} of responses.",
  "why.presence.intentGeneric": "For one query type, the brand appears in only {pct} of responses.",
  // {rank} is a number like 3.4.
  "why.prominence": "The brand is mentioned but typically ranks low in the list (average position {rank}).",
  "why.competitive": "When both are mentioned, {competitor} is ranked ahead in {pct} of responses.",
  "why.representation": "For queries that name the brand, {pct} of responses describe it inaccurately.",
  "why.representationMixed": "For queries that name the brand, AI assistants describe it inconsistently.",
  "why.representationBoth": "For queries that name the brand, {pct} of responses describe it inaccurately, and AI assistants are inconsistent with each other.",
  // {k} of {n} = counts of websites/videos.
  "why.source": "{k} of the {n} most-cited websites and videos in the category do not mention the brand.",
  "why.unknown": "A factor limiting the brand's visibility was detected.",

  // Short examples of the kinds of queries people make ("…" = words that change).
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

  // ================================================================ sample response
  "sample.title": "Sample AI response",
  // Label above the query text (the query stays in its own language).
  "sample.asked": "Query",
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

  // ================================================================ trend
  "trend.title": "Score history",
  "trend.single": "This is the first analysis. Run another later to establish a trend.",
  // Screen-reader summary of the chart.
  "trend.aria": "Score history: {first} on {firstDate}, now {last} on {lastDate}.",
  "trend.hint": "Select a point to view that analysis.",
  // Shown when a point is selected. {score}, {lo}, {hi} are out of 100.
  "trend.point": "{date}: score **{score}** (range {lo}–{hi})",
  "trend.pointDetails": "{origin} · {ais}",
  "trend.legendScore": "Score",
  "trend.legendBand": "Likely range",
  "trend.legendBreak": "Methodology change (query set or AI sources) — scores on either side are not comparable.",
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
  "run.plan_one": "{ais} will be queried with {n} query.",
  "run.plan_other": "{ais} will be queried with {n} queries.",
  "run.planPractice_one": "Simulated responses will be generated for {n} query. No AI is queried.",
  "run.planPractice_other": "Simulated responses will be generated for {n} queries. No AI is queried.",
  "run.time_one": "Estimated duration: {n} minute.",
  "run.time_other": "Estimated duration: {n} minutes.",
  "run.timeShort": "Estimated duration: under a minute.",
  // Button that shows or hides the extra settings.
  "run.options": "Options",
  "run.which": "AI sources",
  "run.whichAuto": "All connected AIs ({ais})",
  "run.whichAutoPractice": "Simulated data (no AI connected)",
  // An offline option in the list, e.g. "Synthetic demo data (offline) — simulated data".
  "run.whichPractice": "{ai} — simulated data",
  "run.depth": "Sampling depth",
  "run.depth.quick": "Quick",
  "run.depth.standard": "Standard",
  "run.depth.thorough": "Thorough",
  "run.depth.quickSub": "1 sample per query",
  "run.depth.standardSub": "3 samples · recommended",
  "run.depth.thoroughSub": "5 samples per query",
  "run.depthHint": "AI responses vary. More samples per query give a more stable score but take longer.",
  "run.editQuestions": "Review the query set →",
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
  "run.error.start": "The analysis could not be started. Please try again.",
  "run.error.poll": "Lost connection to the analysis. Refresh the page to check its status.",
  "run.error.cancel": "The analysis could not be cancelled.",
  "run.error.skip": "That AI could not be skipped.",
  // Technical lines, shown only in the detailed-metrics view.
  "run.tech.message": "Server message: {message}",
  "run.tech.error": "Error: {error}",
  "run.tech.calls_one": "{n} AI call in total.",
  "run.tech.calls_other": "{n} AI calls in total.",
  "run.tech.unscored_one": "{n} query names the brand, so it is run but not scored.",
  "run.tech.unscored_other": "{n} queries name the brand, so they are run but not scored.",

  // ================================================================ empty state
  "empty.title": "No analyses yet",
  "empty.body": "An analysis runs your customer queries — for example “best … near me” — against AI assistants such as Google Gemini and measures how often your brand is recommended.",
  "empty.body2": "It takes a few minutes. Start it below.",

  // ================================================================ detailed metrics (details)
  "details.title": "Detailed metrics",
  "details.intro": "Methodology and diagnostics. Scores use only queries that do not name the brand.",
  "details.runId": "Run ID",
  "details.checkedOn": "Analysed on",
  "details.scored": "Scored responses",
  "details.mentioning": "Responses mentioning the brand",
  "details.unscored": "Run but not scored (query names the brand)",
  "details.clusters": "Query clusters",
  "details.samples": "Samples per query",
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
  "metrics.ciNote": "bootstrap over queries",
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
  "admission.stats": "Query coverage {q} · Sample coverage {s} · policy {policy}",
  "admission.missingAis": "AIs without responses: {ais}",
  "admission.missingQuestions_one": "{n} query received no response",
  "admission.missingQuestions_other": "{n} queries received no response",

  "providers.ai": "AI",
  "providers.coverage": "Coverage",
  "providers.answers": "Responses",
  "providers.mentions": "Mentions",
  "providers.empty": "No per-AI breakdown for this analysis.",

  "gaps.type.presence": "Low presence",
  "gaps.type.prominence": "Low prominence",
  "gaps.type.competitive": "Competitor ahead",
  "gaps.type.representation": "Misrepresentation",
  "gaps.type.source": "Source gap",
  "gaps.scope.overall": "All AIs and queries",
  "gaps.scope.provider": "On {ai}",
  "gaps.scope.intent": "Query type: {intent}",
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
} as const;

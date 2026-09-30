import { describe, expect, it } from "vitest";
import type { Campaign, ChannelId, ChannelStatus, DistributionEvent, Snapshot, Variant } from "../../api/types";
import {
  currentStep,
  defaultPicks,
  fixFor,
  generationStage,
  needsTokenFirst,
  awaitingConnect,
  blockReason,
  canRetry,
  joinConnected,
  parseIssue,
  parsePicks,
  parseStep,
  planDestinations,
  resultKind,
  rowState,
  selectAll,
  setExportInstead,
  togglePick,
  whereGate,
  reachableSteps,
  removeHashtag,
  removePhrase,
  sendList,
  stepForCampaign,
} from "./studioFlow";
import { sinceCampaign } from "./trendMarkers";

const variant = (over: Partial<Variant> = {}): Variant => ({
  channel: "x",
  text: "Hello",
  hashtags: [],
  link: null,
  asset_id: null,
  alt_text: null,
  enabled: true,
  approved_hash: null,
  issues: [],
  ...over,
});

const ev = (over: Partial<DistributionEvent> = {}): DistributionEvent => ({
  event_id: "e",
  campaign_id: "c1",
  recommendation_id: "r1",
  channel: "sandbox",
  outcome: "published",
  at: "2026-09-02T00:00:00Z",
  external_url: null,
  external_id: null,
  error: null,
  content_hash: null,
  ...over,
});

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  campaign_id: "c1",
  brand_key: "b",
  recommendation_id: "r1",
  gap_id: "g1",
  action: "faq_page",
  suggestion_key: "faq_page|",
  status: "ready",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  headline: "Hot vada pav",
  variants: [variant()],
  assets: [],
  deliverables: [],
  events: [],
  drafted_by: "template",
  approved_at: null,
  job_id: null,
  ...over,
});

const chan = (channel: ChannelStatus["channel"], mode: ChannelStatus["mode"] = "connected", quota: number | null = null): ChannelStatus => ({
  channel,
  label: channel,
  mode,
  detail: "",
  quota_remaining: quota,
});

describe("step derivation from status", () => {
  it("resumes a draft at review, an approved campaign at publish, a sent one at results", () => {
    expect(stepForCampaign(campaign({ status: "ready" }))).toBe("review");
    expect(stepForCampaign(campaign({ status: "generating" }))).toBe("review");
    expect(stepForCampaign(campaign({ status: "approved" }))).toBe("publish");
    expect(stepForCampaign(campaign({ status: "published" }))).toBe("results");
    expect(stepForCampaign(campaign({ status: "partially_published" }))).toBe("results");
    expect(stepForCampaign(campaign({ status: "failed" }))).toBe("review");
    expect(stepForCampaign(campaign({ status: "failed", events: [ev({ outcome: "failed" })] }))).toBe("results");
  });

  it("only offers steps that can be opened", () => {
    expect([...reachableSteps(campaign({ status: "generating" }))]).toEqual(["review"]);
    expect([...reachableSteps(campaign())]).toEqual(["review", "where", "publish"]);
    // An issue on an enabled channel keeps publishing closed until it's fixed.
    expect(reachableSteps(campaign({ variants: [variant({ issues: ["The post text is empty"] })] })).has("publish")).toBe(false);
    expect(reachableSteps(campaign({ events: [ev()] })).has("results")).toBe(true);
  });

  it("prefers the URL's step when it can be opened, else the resume step", () => {
    expect(currentStep(campaign({ status: "approved", approved_at: "t" }), null)).toBe("publish");
    expect(currentStep(campaign({ status: "approved", approved_at: "t" }), "where")).toBe("where");
    // No attempts yet: results can't open, so the draft's own step wins.
    expect(currentStep(campaign(), "results")).toBe("review");
    expect(currentStep(campaign({ status: "published", events: [] }), null)).toBe("review");
    expect(parseStep("where")).toBe("where");
    expect(parseStep("nope")).toBeNull();
  });
});

describe("issues in plain words", () => {
  it("reads the backend's claim messages and the exact phrase they name", () => {
    const a = parseIssue("Unsupported claim — “₹20” — prices aren't in your brand profile; add it to the profile or remove it");
    expect(a).toMatchObject({ kind: "claim", phrase: "₹20", advisory: false });
    const b = parseIssue('Unsupported claim — superlative ("best") is not in the brand profile; remove it or verify it');
    expect(b).toMatchObject({ kind: "claim", phrase: "best" });
    expect(parseIssue("Hashtag #BestInPune carries an unsupported claim")).toMatchObject({ kind: "hashtag_claim", phrase: "#BestInPune" });
    expect(parseIssue("Too long: 300/280 characters (hashtags and link included)")).toMatchObject({ kind: "too_long", n: 300, limit: 280 });
    expect(parseIssue("More than 3 hashtags for x")).toMatchObject({ kind: "too_many_tags", n: 3 });
    expect(parseIssue("Names competitor Foo — keep any comparison factual and checkable")).toMatchObject({
      kind: "competitor",
      phrase: "Foo",
      advisory: true,
    });
    expect(parseIssue("Something new")).toMatchObject({ kind: "other", raw: "Something new" });
  });

  it("offers a one-click fix only when the exact phrase is in the text", () => {
    const claim = parseIssue('Unsupported claim — superlative ("best") is not in the brand profile; remove it or verify it');
    expect(fixFor(claim, "The best vada pav")).toBe("phrase");
    expect(fixFor(claim, "Our bestseller")).toBeNull(); // not as a whole word
    expect(fixFor(claim, "Great vada pav")).toBeNull();
    const tag = parseIssue("Hashtag #BestInPune carries an unsupported claim");
    expect(fixFor(tag, "", ["#bestinpune", "#VadaPav"])).toBe("hashtag");
    expect(removeHashtag(["#BestInPune", "#VadaPav"], "#bestinpune")).toEqual(["#VadaPav"]);
  });
});

describe("remove-phrase edit", () => {
  it("removes the phrase and tidies the seam", () => {
    expect(removePhrase("Try the best vada pav in Pune.", "the best")).toBe("Try vada pav in Pune.");
    expect(removePhrase("Open 24 hours, every day.", "24 hours")).toBe("Open, every day.");
    expect(removePhrase("Hot vada pav (only ₹20) today.", "only ₹20")).toBe("Hot vada pav today.");
  });

  it("capitalises a sentence that now starts lower-case", () => {
    expect(removePhrase("Best vada pav in Pune!", "Best")).toBe("Vada pav in Pune!");
    expect(removePhrase("Fresh daily. Best, crisp vada pav.", "Best")).toBe("Fresh daily. Crisp vada pav.");
  });

  it("removes every whole-word occurrence, keeps other lines and paragraphs as written", () => {
    const text = "Best snacks.\n\n- Our best pav\n- Bestseller list";
    expect(removePhrase(text, "best")).toBe("Best snacks.\n\n- Our pav\n- Bestseller list");
  });

  it("leaves the text alone when the phrase isn't there", () => {
    expect(removePhrase("Nothing to see", "best")).toBe("Nothing to see");
    expect(removePhrase("Nothing to see", "")).toBe("Nothing to see");
  });
});

describe("where to post (incl. LinkedIn)", () => {
  const statuses = [
    chan("facebook_page", "export_only"),
    chan("x", "connected", 0),
    chan("linkedin", "connected"),
    chan("instagram", "disabled"),
    chan("google_business", "export_only"),
    chan("whatsapp", "export_only"),
    chan("export", "connected"),
    chan("sandbox", "connected"),
  ];
  const variants = [
    variant({ channel: "facebook_page" }),
    variant({ channel: "x" }),
    variant({ channel: "linkedin" }),
    variant({ channel: "instagram" }),
    variant({ channel: "google_business", enabled: false }),
    variant({ channel: "whatsapp" }),
    variant({ channel: "sandbox" }),
  ];

  it("lists every channel in a fixed order, as this brand would post to it", () => {
    const d = planDestinations(campaign({ variants }), statuses, [
      { channel: "linkedin", state: "connected", account_name: "Gajanan Vada Pav" },
      { channel: "facebook_page", state: "not_connected", account_name: "Old page" },
    ]);
    expect(d.map((x) => [x.channel, x.kind, x.block])).toEqual([
      ["facebook_page", "unconnected", null],
      ["instagram", "off", "disabled"],
      ["x", "post", "no_quota"],
      ["linkedin", "post", null],
      ["google_business", "unconnected", "variant_off"],
      ["whatsapp", "share", null],
      ["export", "download", "no_variant"],
      ["sandbox", "simulate", null],
    ]);
    // The account that posts is named only for a connected channel.
    expect(d.find((x) => x.channel === "linkedin")?.account).toBe("Gajanan Vada Pav");
    expect(d.find((x) => x.channel === "facebook_page")?.account).toBeNull();
    // WhatsApp sends nothing to a platform, so it never waits for approval.
    expect(d.find((x) => x.channel === "whatsapp")?.needsApproval).toBe(false);
    expect(d.find((x) => x.channel === "linkedin")?.needsApproval).toBe(true);
  });

  it("treats a channel the server didn't list as not connected (sandbox / export stay local)", () => {
    const d = planDestinations(campaign({ variants: [variant({ channel: "x" }), variant({ channel: "sandbox" })] }), []);
    expect(d.find((x) => x.channel === "x")?.kind).toBe("unconnected");
    expect(d.find((x) => x.channel === "sandbox")?.kind).toBe("simulate");
  });

  it("never turns a ticked unconnected channel into an export without asking", () => {
    const d = planDestinations(campaign({ variants }), statuses);
    expect(defaultPicks(d)).toEqual(["linkedin", "whatsapp", "sandbox"]);
    let picks = { on: ["facebook_page", "x", "linkedin", "instagram"] as ChannelId[], exportInstead: [] as ChannelId[] };
    const fb = d.find((x) => x.channel === "facebook_page")!;
    expect(rowState(fb, picks)).toBe("connect");
    expect(sendList(d, picks).map((x) => x.channel)).toEqual(["linkedin"]);
    expect(awaitingConnect(d, picks).map((x) => x.channel)).toEqual(["facebook_page"]);
    expect(whereGate(d, picks)).toMatchObject({ count: 1, reason: "connect" });
    // "Export it instead" is an explicit choice; then it's sent (the server exports it).
    picks = setExportInstead(picks, "facebook_page", true);
    expect(rowState(fb, picks)).toBe("export");
    expect(sendList(d, picks).map((x) => x.channel)).toEqual(["facebook_page", "linkedin"]);
    expect(whereGate(d, picks)).toMatchObject({ count: 2, reason: null });
    // Unticking forgets the export choice; nothing chosen says so.
    picks = togglePick(picks, "facebook_page", false);
    expect(picks.exportInstead).toEqual([]);
    expect(whereGate(d, { on: [], exportInstead: [] })).toMatchObject({ count: 0, reason: "none" });
  });

  it("select all ticks what can go out now; back from Details ticks the connected channel", () => {
    const d = planDestinations(campaign({ variants }), statuses);
    expect(selectAll(d, { on: ["instagram"], exportInstead: [] }).on).toEqual(["linkedin", "whatsapp", "sandbox"]);
    expect(selectAll(d, { on: [], exportInstead: ["facebook_page"] }).on).toEqual(["facebook_page", "linkedin", "whatsapp", "sandbox"]);
    expect(joinConnected({ on: ["sandbox"], exportInstead: ["x"] }, "x")).toEqual({ on: ["sandbox", "x"], exportInstead: [] });
    expect(joinConnected({ on: [], exportInstead: [] }, "myspace" as ChannelId)).toEqual({ on: [], exportInstead: [] });
  });

  it("reads stored picks in the old list form and the new object form", () => {
    expect(parsePicks('["x","nope"]')).toEqual({ on: ["x"], exportInstead: [] });
    expect(parsePicks('{"on":["x"],"exportInstead":["facebook_page"]}')).toEqual({ on: ["x"], exportInstead: ["facebook_page"] });
    expect(parsePicks("{bad")).toBeNull();
    expect(parsePicks(null)).toBeNull();
  });

  it("a LinkedIn post over the 3,000 limit or with a claim can't be picked", () => {
    const long = variant({ channel: "linkedin", text: "a".repeat(3001) });
    expect(planDestinations(campaign({ variants: [long] }), [chan("linkedin")]).find((x) => x.channel === "linkedin")?.block).toBe("has_issues");
    const claim = variant({ channel: "linkedin", issues: ['Unsupported claim — superlative ("best") is not in the brand profile'] });
    expect(planDestinations(campaign({ variants: [claim] }), [chan("linkedin")]).find((x) => x.channel === "linkedin")?.block).toBe("has_issues");
    expect(planDestinations(campaign({ variants: [variant({ channel: "linkedin", text: "a".repeat(3000) })] }), [chan("linkedin")]).find((x) => x.channel === "linkedin")?.block).toBeNull();
  });

  it("asks for the admin token up front only beyond sandbox, export and WhatsApp", () => {
    expect(needsTokenFirst(["sandbox", "whatsapp"])).toBe(false);
    expect(needsTokenFirst(["sandbox", "linkedin"])).toBe(true);
  });
});

describe("results", () => {
  it("says what each attempt really did", () => {
    expect(resultKind(ev({ channel: "sandbox" }))).toBe("practice");
    expect(resultKind(ev({ channel: "linkedin" }))).toBe("posted");
    expect(resultKind(ev({ channel: "whatsapp", outcome: "exported" }))).toBe("whatsapp");
    expect(resultKind(ev({ channel: "export", outcome: "exported" }))).toBe("exported");
    expect(resultKind(ev({ channel: "facebook_page", outcome: "exported" }))).toBe("unconnected");
    expect(resultKind(ev({ channel: "x", outcome: "failed" }))).toBe("failed");
    expect(resultKind(ev({ channel: "x", outcome: "blocked" }))).toBe("blocked");
  });

  it("names why an attempt was blocked, and offers a retry only when it can help", () => {
    expect(blockReason("Set ADMIN_TOKEN to publish to real channels")).toBe("token_unset");
    expect(blockReason("Missing or wrong X-Admin-Token")).toBe("token_missing");
    expect(blockReason("Not approved: approve the campaign before publishing")).toBe("not_approved");
    expect(blockReason("Edited since approval: approve it again before publishing")).toBe("not_approved");
    expect(blockReason("The x version is switched off")).toBe("switched_off");
    expect(blockReason("Something odd")).toBe("other");
    expect(canRetry(ev({ outcome: "failed", error: "HTTP 500" }))).toBe(true);
    expect(canRetry(ev({ outcome: "blocked", error: "Set ADMIN_TOKEN to publish to real channels" }))).toBe(false);
    expect(canRetry(ev({ outcome: "blocked", error: "Missing or wrong X-Admin-Token" }))).toBe(true);
    expect(canRetry(ev({ outcome: "published" }))).toBe(false);
  });
});

describe("drafting progress", () => {
  it("reads the job's stage", () => {
    expect(generationStage(null).stage).toBe("queued");
    expect(generationStage({ message: "Queued: drafting campaign", done: 0, total: 0 }).stage).toBe("queued");
    expect(generationStage({ message: "Writing the copy", done: 0, total: 5 }).stage).toBe("copy");
    expect(generationStage({ message: "Generating image 2 of 3 (portrait)", done: 2, total: 5 })).toEqual({
      stage: "images",
      image: 2,
      images: 3,
    });
    expect(generationStage({ message: "Saving", done: 4, total: 5 }).stage).toBe("saving");
    expect(generationStage({ message: "Campaign ready", done: 5, total: 5 }).stage).toBe("done");
  });
});

describe("since your campaign", () => {
  const snap = (at: string, score: number, key = "k"): Snapshot =>
    ({
      run_id: at,
      comparability_key: key,
      collection_completed_at: at,
      collection_started_at: at,
      analysis_result: { composite_score: score },
    }) as unknown as Snapshot;
  const marker = (at: string) => ({ at, headline: "h", campaignId: "c1" });

  it("compares the last run before the first publish with the newest run after it", () => {
    const snaps = [snap("2026-09-01T00:00:00Z", 20), snap("2026-09-03T00:00:00Z", 24), snap("2026-09-06T00:00:00Z", 31), snap("2026-09-08T00:00:00Z", 35)];
    const s = sinceCampaign(snaps, [marker("2026-08-20T00:00:00Z"), marker("2026-09-04T00:00:00Z")]);
    expect(s?.before?.run_id).toBe("2026-09-03T00:00:00Z");
    expect(s?.after?.run_id).toBe("2026-09-08T00:00:00Z");
    expect(s?.delta).toBe(11);
    expect(s?.comparable).toBe(true);
  });

  it("is honest when no analysis ran after the campaign, or the method changed", () => {
    const snaps = [snap("2026-09-01T00:00:00Z", 20)];
    const s = sinceCampaign(snaps, [marker("2026-09-04T00:00:00Z")]);
    expect(s?.before?.run_id).toBe("2026-09-01T00:00:00Z");
    expect(s?.after).toBeNull();
    expect(s?.delta).toBeNull();
    const changed = sinceCampaign([snap("2026-09-01T00:00:00Z", 20), snap("2026-09-06T00:00:00Z", 30, "other")], [marker("2026-09-04T00:00:00Z")]);
    expect(changed?.comparable).toBe(false);
    expect(changed?.delta).toBeNull();
    // Published before any analysis: no "before" score.
    expect(sinceCampaign([snap("2026-09-06T00:00:00Z", 30)], [marker("2026-09-04T00:00:00Z")])?.before).toBeNull();
    expect(sinceCampaign(snaps, [])).toBeNull();
  });
});

describe("preflight", () => {
  it("reads the server's dry run: an approval still to come is not a block", async () => {
    const { planState, sendable, eventNote } = await import("./studioFlow");
    expect(planState({ action: "publish", detail: "Would post now" })).toBe("publish");
    expect(planState({ action: "export", detail: "" })).toBe("export");
    expect(planState({ action: "blocked", detail: "Not approved: approve the campaign before publishing" })).toBe("approve");
    expect(planState({ action: "blocked", detail: "Set ADMIN_TOKEN on the server to publish to real channels" })).toBe("blocked");
    expect(planState(undefined)).toBeNull();
    const plans = new Map([
      ["linkedin", { action: "blocked", detail: "Not posted — needs PUBLIC_BASE_URL" }],
      ["sandbox", { action: "publish", detail: "" }],
    ] as const);
    const list = [{ channel: "linkedin" as const }, { channel: "sandbox" as const }, { channel: "whatsapp" as const }];
    expect(sendable(list, plans).map((d) => d.channel)).toEqual(["sandbox", "whatsapp"]);
    expect(sendable(list, null)).toHaveLength(3);
    expect(eventNote(ev({ note: " Share link only " } as Partial<DistributionEvent>))).toBe("Share link only");
    expect(eventNote(ev())).toBeNull();
  });
});

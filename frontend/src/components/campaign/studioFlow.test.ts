import { describe, expect, it } from "vitest";
import type { Campaign, ChannelStatus, DistributionEvent, Snapshot, Variant } from "../../api/types";
import {
  currentStep,
  defaultPicks,
  fixFor,
  generationStage,
  needsTokenFirst,
  parseIssue,
  parseStep,
  planDestinations,
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

  it("shows each channel the campaign has copy for, as this brand would post to it", () => {
    const d = planDestinations(campaign({ variants }), statuses);
    expect(d.map((x) => [x.channel, x.kind, x.block])).toEqual([
      ["facebook_page", "unconnected", null],
      ["x", "post", "no_quota"],
      ["linkedin", "post", null],
      ["instagram", "off", "disabled"],
      ["google_business", "unconnected", "variant_off"],
      ["whatsapp", "share", null],
      ["sandbox", "simulate", null],
    ]);
    // WhatsApp sends nothing to a platform, so it never waits for approval.
    expect(d.find((x) => x.channel === "whatsapp")?.needsApproval).toBe(false);
    expect(d.find((x) => x.channel === "linkedin")?.needsApproval).toBe(true);
  });

  it("picks what posts, simulates or shares by default; an unconnected channel waits for Connect or Export instead", () => {
    const d = planDestinations(campaign({ variants }), statuses);
    expect(defaultPicks(d)).toEqual(["linkedin", "whatsapp", "sandbox"]);
    // "Export instead" on Facebook adds it; a blocked channel is never sent even if picked.
    const sent = sendList(d, ["facebook_page", "x", "linkedin", "instagram"]).map((x) => x.channel);
    expect(sent).toEqual(["facebook_page", "linkedin"]);
  });

  it("a LinkedIn post over the 3,000 limit or with a claim can't be picked", () => {
    const long = variant({ channel: "linkedin", text: "a".repeat(3001) });
    expect(planDestinations(campaign({ variants: [long] }), [chan("linkedin")])[0].block).toBe("has_issues");
    const claim = variant({ channel: "linkedin", issues: ['Unsupported claim — superlative ("best") is not in the brand profile'] });
    expect(planDestinations(campaign({ variants: [claim] }), [chan("linkedin")])[0].block).toBe("has_issues");
    expect(planDestinations(campaign({ variants: [variant({ channel: "linkedin", text: "a".repeat(3000) })] }), [chan("linkedin")])[0].block).toBeNull();
  });

  it("asks for the admin token up front only beyond sandbox, export and WhatsApp", () => {
    expect(needsTokenFirst(["sandbox", "whatsapp"])).toBe(false);
    expect(needsTokenFirst(["sandbox", "linkedin"])).toBe(true);
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

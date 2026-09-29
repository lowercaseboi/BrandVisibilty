import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import type { Campaign, ChannelStatus, DistributionEvent, Snapshot, Variant } from "../../api/types";
import { isTokenRejected, isTokenUnsetError } from "./adminToken";
import {
  assetForVariant,
  blockingIssues,
  canApprove,
  channelOptions,
  charBudget,
  charCount,
  composePost,
  defaultSelection,
  hashtagsForServer,
  isApproved,
  normalizeHashtag,
  parseHashtags,
  retryableChannels,
  statusView,
  whatsappShareUrl,
  xLength,
} from "./campaignModel";
import { markerIndex, publishMarkers, sinceDelta } from "./trendMarkers";

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

const ev = (over: Partial<DistributionEvent>): DistributionEvent => ({
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

describe("hashtags and the composed post", () => {
  it("normalizes and de-duplicates hashtags", () => {
    expect(normalizeHashtag("##Vada Pav")).toBe("VadaPav");
    expect(parseHashtags("#mumbai, food #Mumbai  snacks")).toEqual(["mumbai", "food", "snacks"]);
  });

  it("sends tags with a leading #, like the server stores them", () => {
    expect(hashtagsForServer(["a", "#b", "##c d"])).toEqual(["#a", "#b", "#cd"]);
  });

  it("composes text, link (once) and hashtags like the backend's compose_text", () => {
    expect(composePost({ text: "Hi", hashtags: ["a", "#b", "#A"], link: "https://x.in" })).toBe("Hi\n\nhttps://x.in\n\n#a #b");
    expect(composePost({ text: "See https://x.in", hashtags: [], link: "https://x.in" })).toBe("See https://x.in");
    // Google Business: text only (the link is a button, hashtags do nothing there).
    expect(composePost({ channel: "google_business", text: "Hi", hashtags: ["a"], link: "https://x.in" })).toBe("Hi");
  });
});

describe("character counting", () => {
  it("counts every X link as 23 characters", () => {
    expect(xLength("https://example.com/a/very/long/path/that/goes/on")).toBe(23);
    expect(xLength("go https://a.co")).toBe(3 + 23);
    expect(xLength("see www.shop.in now")).toBe(4 + 23 + 4);
    expect(xLength("shop.in")).toBe(7); // bare domains aren't links (same as the backend)
  });

  it("counts emoji and CJK as 2 on X, Devanagari as 1 per code point", () => {
    expect(xLength("🍔")).toBe(2);
    expect(xLength("👍🏽")).toBe(4); // 2 per code point, like the backend (never under-counts)
    expect(xLength("漢字")).toBe(4);
    expect(xLength("वडा")).toBe(Array.from("वडा").length);
  });

  it("counts code points on other channels, links at full length", () => {
    expect(charCount("instagram", "https://example.com/abc")).toBe(23);
    expect(charCount("instagram", "https://example.com/abcdef")).toBe(26);
    expect(charCount("facebook_page", "🍔")).toBe(1);
  });

  it("flags near and over the limit", () => {
    expect(charBudget("x", { text: "a".repeat(100), hashtags: [], link: null }).state).toBe("ok");
    expect(charBudget("x", { text: "a".repeat(260), hashtags: [], link: null }).state).toBe("near");
    const over = charBudget("x", { text: "a".repeat(270), hashtags: ["#abcdefghij"], link: null });
    expect(over.count).toBe(270 + 2 + 11);
    expect(over.state).toBe("over");
    expect(over.limit).toBe(280);
  });
});

describe("status → label", () => {
  it("maps every status to its key and tone", () => {
    expect(statusView("generating")).toEqual({ key: "board.campaign.status.generating", tone: "info" });
    expect(statusView("partially_published")).toEqual({ key: "board.campaign.status.partially_published", tone: "warn" });
    expect(statusView("failed").tone).toBe("err");
    expect(statusView("published").key).toBe("board.campaign.status.published");
  });

  it("reads an unknown status as ready", () => {
    expect(statusView("something_new").key).toBe("board.campaign.status.ready");
  });
});

describe("approval", () => {
  it("is approved only while the approval stands", () => {
    expect(isApproved({ status: "approved", approved_at: "t" })).toBe(true);
    expect(isApproved({ status: "partially_published", approved_at: "t" })).toBe(true);
    expect(isApproved({ status: "ready", approved_at: "t" })).toBe(false); // edited after approval
    expect(isApproved({ status: "failed", approved_at: null })).toBe(false); // generation failed
  });

  it("blocks approval on server issues, empty or over-long copy of enabled channels only", () => {
    expect(canApprove(campaign())).toBe(true);
    expect(canApprove(campaign({ variants: [variant({ issues: ["Unsupported claim — best in town"] })] }))).toBe(false);
    // Advice and notes about automatic fixes don't block.
    expect(
      canApprove(
        campaign({
          variants: [variant({ issues: ["Names competitor Graduate Vada Pav — keep any comparison factual and checkable", "Shortened to fit the 280-character limit"] })],
        }),
      ),
    ).toBe(true);
    expect(canApprove(campaign({ variants: [variant({ text: "a".repeat(300) })] }))).toBe(false);
    expect(canApprove(campaign({ variants: [variant({ text: "  " })] }))).toBe(false);
    expect(
      canApprove(campaign({ variants: [variant(), variant({ channel: "instagram", enabled: false, issues: ["x"] })] })),
    ).toBe(true);
    expect(canApprove(campaign({ variants: [variant({ enabled: false })] }))).toBe(false);
    expect(canApprove(campaign({ status: "approved", approved_at: "t" }))).toBe(false);
    expect(blockingIssues([variant({ text: "a".repeat(300) })])).toEqual([
      { channel: "x", message: "over_limit", local: true },
    ]);
  });
});

describe("which channels are publishable", () => {
  const statuses = [
    chan("x", "connected", 3),
    chan("instagram", "connected"),
    chan("google_business", "export_only"),
    chan("facebook_page", "disabled"),
    chan("sandbox", "connected"),
    chan("export", "connected"),
    chan("whatsapp", "export_only"),
  ];
  const variants = [
    variant({ channel: "x" }),
    variant({ channel: "instagram", enabled: false }),
    variant({ channel: "google_business" }),
    variant({ channel: "facebook_page" }),
    variant({ channel: "sandbox" }),
    variant({ channel: "export" }),
  ];

  it("before approval only the export pack and WhatsApp (nothing leaves the server)", () => {
    const opts = channelOptions(campaign({ variants }), statuses);
    const byId = Object.fromEntries(opts.map((o) => [o.status.channel, o.block]));
    expect(byId).toEqual({
      x: "not_approved",
      instagram: "variant_off",
      google_business: "not_approved",
      facebook_page: "disabled",
      sandbox: "not_approved",
      export: null,
      whatsapp: "no_variant",
    });
  });

  it("after approval: every enabled, issue-free variant on a channel that isn't disabled", () => {
    const opts = channelOptions(campaign({ variants, status: "approved", approved_at: "t" }), statuses);
    const open = opts.filter((o) => o.block === null).map((o) => o.status.channel);
    expect(open).toEqual(["x", "google_business", "sandbox", "export"]);
    expect(opts.find((o) => o.status.channel === "sandbox")?.effect).toBe("simulate");
    expect(opts.find((o) => o.status.channel === "google_business")?.effect).toBe("export");
    expect(opts.find((o) => o.status.channel === "export")?.effect).toBe("export");
    expect(opts.find((o) => o.status.channel === "x")?.effect).toBe("post");
    // Default ticks: what really posts or simulates, not the exports.
    expect(defaultSelection(opts)).toEqual(["x", "sandbox"]);
  });

  it("an edit after approval (status back to ready) closes the real channels again", () => {
    const opts = channelOptions(campaign({ variants, status: "ready", approved_at: null }), statuses);
    expect(opts.find((o) => o.status.channel === "sandbox")?.block).toBe("not_approved");
  });

  it("an exhausted quota or a validation issue blocks the channel", () => {
    const approvedC = { status: "approved" as const, approved_at: "t" };
    expect(channelOptions(campaign(approvedC), [chan("x", "connected", 0)])[0].block).toBe("no_quota");
    expect(
      channelOptions(campaign({ ...approvedC, variants: [variant({ issues: ["too long"] })] }), [chan("x")])[0].block,
    ).toBe("has_issues");
  });

  it("nothing is publishable while generating", () => {
    const opts = channelOptions(campaign({ status: "generating", variants }), statuses);
    expect(opts.every((o) => o.block !== null)).toBe(true);
  });
});

describe("events", () => {
  it("finds retryable channels and the WhatsApp share link", () => {
    const events = [
      ev({ channel: "x", outcome: "failed", at: "2026-09-02T00:00:00Z" }),
      ev({ channel: "x", outcome: "published", at: "2026-09-01T00:00:00Z" }),
      ev({ channel: "sandbox", outcome: "failed", at: "2026-09-01T00:00:00Z" }),
      ev({ channel: "sandbox", outcome: "published", at: "2026-09-03T00:00:00Z" }),
      ev({ channel: "whatsapp", outcome: "exported", external_url: "https://wa.me/?text=hi" }),
    ];
    expect(retryableChannels(events)).toEqual(["x"]);
    expect(whatsappShareUrl(events)).toBe("https://wa.me/?text=hi");
    expect(whatsappShareUrl([])).toBeNull();
  });
});

describe("images", () => {
  const assets = [
    { asset_id: "a1", format: "square" as const, path: "c/a1.png", provider: "template", prompt: "", seed: 1, overlay_text: null, created_at: "1" },
    { asset_id: "a2", format: "landscape" as const, path: "c/a2.png", provider: "template", prompt: "", seed: 1, overlay_text: null, created_at: "2" },
  ];
  it("uses the chosen asset, else the channel's preferred format", () => {
    expect(assetForVariant(assets, { channel: "x", asset_id: "a1" })?.asset_id).toBe("a1");
    expect(assetForVariant(assets, { channel: "x", asset_id: null })?.asset_id).toBe("a2");
    expect(assetForVariant(assets, { channel: "google_business", asset_id: "gone" })?.asset_id).toBe("a2");
    expect(assetForVariant([], { channel: "x", asset_id: null })).toBeNull();
  });
});

describe("admin token errors", () => {
  it("tells an unset server token from a rejected one", () => {
    const unset = new ApiError(403, "Set ADMIN_TOKEN to publish to real channels");
    expect(isTokenUnsetError(unset)).toBe(true);
    expect(isTokenRejected(unset)).toBe(false);
    expect(isTokenRejected(new ApiError(403, "Invalid admin token"))).toBe(true);
    expect(isTokenRejected(new ApiError(403, "campaign is not approved"))).toBe(false);
    expect(isTokenRejected(new ApiError(401, "Missing or wrong X-Admin-Token"))).toBe(true);
    expect(isTokenUnsetError(new ApiError(401, "Missing or wrong X-Admin-Token"))).toBe(false);
  });
});

describe("trend markers", () => {
  const times = [Date.parse("2026-09-01"), Date.parse("2026-09-03"), Date.parse("2026-09-05")];
  it("places an event between the checks around it", () => {
    expect(markerIndex(times, Date.parse("2026-09-02"))).toEqual({ index: 0.5, after: false });
    expect(markerIndex(times, Date.parse("2026-09-06"))).toEqual({ index: 2, after: true });
    expect(markerIndex(times, Date.parse("2026-09-05"))).toEqual({ index: 2, after: false });
    expect(markerIndex(times, Date.parse("2026-08-01"))).toBeNull();
  });

  const snap = (at: string, score: number, key = "k"): Snapshot =>
    ({
      run_id: at,
      comparability_key: key,
      collection_completed_at: at,
      collection_started_at: at,
      analysis_result: { composite_score: score },
    }) as unknown as Snapshot;

  it("measures the change since a campaign within one comparable segment", () => {
    const snaps = [snap("2026-09-01", 20), snap("2026-09-03", 25), snap("2026-09-05", 31)];
    expect(sinceDelta(snaps, "2026-09-02")).toBe(11);
    expect(sinceDelta(snaps, "2026-09-06")).toBeNull();
    expect(sinceDelta([snap("2026-09-01", 20), snap("2026-09-05", 31, "other")], "2026-09-02")).toBeNull();
  });

  it("one marker per campaign at its first publish", () => {
    const m = publishMarkers([
      campaign({
        events: [
          ev({ outcome: "published", at: "2026-09-04T00:00:00Z" }),
          ev({ outcome: "published", at: "2026-09-02T00:00:00Z" }),
          ev({ outcome: "failed", at: "2026-09-01T00:00:00Z" }),
        ],
      }),
      campaign({ campaign_id: "c2", events: [ev({ outcome: "failed" })] }),
    ]);
    expect(m).toEqual([{ at: "2026-09-02T00:00:00Z", headline: "Hot vada pav", campaignId: "c1" }]);
  });
});

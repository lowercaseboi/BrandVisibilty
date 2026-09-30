// Pure helpers for Campaign Studio: no React, no network. Character counting (per-channel limits),
// status → label mapping, what can be approved/published, event lookups and which image each
// channel previews. Everything here is unit-tested (campaignModel.test.ts).
import { TEXT_LIMITS } from "../../api/types";
import type {
  Asset,
  Campaign,
  CampaignStatus,
  ChannelId,
  ChannelMode,
  ChannelStatus,
  DistributionEvent,
  EventOutcome,
  ImageFormat,
  Variant,
} from "../../api/types";
import type { MessageKey } from "../../i18n";

// ---------------------------------------------------------------------------
// Copy: hashtags, the composed post and character counting
// ---------------------------------------------------------------------------

/** "#Vada Pav" → "VadaPav"; strips leading #'s and whitespace. Empty when nothing is left. */
export function normalizeHashtag(tag: string): string {
  return tag.replace(/^#+/, "").replace(/\s+/g, "").replace(/[,#]+$/g, "");
}

/** Splits typed input ("#a, b #c") into normalized, de-duplicated tags. */
export function parseHashtags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const t = normalizeHashtag(raw);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Tags as the server stores them: "#tag" (service.edit_variant adds the "#" anyway). */
export function hashtagsForServer(tags: string[]): string[] {
  return tags.map(normalizeHashtag).filter(Boolean).map((t) => `#${t}`);
}

/**
 * Exactly what a channel posts — mirrors the backend's `channels/base.py::compose_text`: the text,
 * then the link (unless the text already contains it), then the hashtags, separated by blank lines.
 * Google Business posts carry neither hashtags nor the link in the text (the link is a button).
 * The character counter and the previews both use this, so they match server validation.
 */
export function composePost(v: Pick<Variant, "text" | "hashtags" | "link"> & { channel?: ChannelId }): string {
  const text = (v.text ?? "").trim();
  const gbp = v.channel === "google_business";
  const parts = [text];
  const link = (v.link ?? "").trim();
  if (!gbp && link && !(v.text ?? "").includes(link)) parts.push(link);
  const tags = gbp ? [] : dedupeTags(v.hashtags ?? []);
  if (tags.length) parts.push(tags.map((t) => `#${t}`).join(" "));
  return parts.filter(Boolean).join("\n\n");
}

function dedupeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalizeHashtag(raw);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** X counts every link as 23 characters (t.co wrapping), whatever its real length. */
export const X_URL_LENGTH = 23;

// Same rule as the backend (channels/base.py): only scheme or www. links count as links.
const URL_RE = /(?:https?:\/\/|www\.)\S+/gi;

/** Code points in the X "weight 1" ranges (twitter-text v3); everything else — CJK, emoji — counts 2. */
function xWeight(cp: number): number {
  if (cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1;
  return 2;
}

function weigh(s: string): number {
  let n = 0;
  for (const ch of s) n += xWeight(ch.codePointAt(0) ?? 0);
  return n;
}

/**
 * X's weighted length, identical to the backend's `x_weighted_length`: NFC, every link = 23,
 * Latin/Devanagari = 1 per code point, CJK and emoji = 2 per code point (conservative for emoji).
 */
export function xLength(input: string): number {
  const s = input.normalize("NFC");
  let n = 0;
  let last = 0;
  for (const m of s.matchAll(URL_RE)) {
    n += weigh(s.slice(last, m.index)) + X_URL_LENGTH;
    last = (m.index ?? 0) + m[0].length;
  }
  return n + weigh(s.slice(last));
}

/** Characters a channel counts for `post`: X's weighted rule, code points elsewhere. */
export function charCount(channel: ChannelId, post: string): number {
  return channel === "x" ? xLength(post) : Array.from(post).length;
}

export type LimitState = "ok" | "near" | "over";

export interface CharBudget {
  count: number;
  limit: number;
  state: LimitState;
}

/** The composed post's length against the channel's hard limit; "near" from 90%. */
export function charBudget(channel: ChannelId, v: Pick<Variant, "text" | "hashtags" | "link">): CharBudget {
  const count = charCount(channel, composePost({ ...v, channel }));
  const limit = TEXT_LIMITS[channel];
  const state: LimitState = count > limit ? "over" : count >= limit * 0.9 ? "near" : "ok";
  return { count, limit, state };
}

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------

export type Tone = "info" | "muted" | "ok" | "warn" | "err" | "accent";

export const STATUS_LABEL: Record<CampaignStatus, MessageKey> = {
  generating: "board.campaign.status.generating",
  ready: "board.campaign.status.ready",
  approved: "board.campaign.status.approved",
  published: "board.campaign.status.published",
  partially_published: "board.campaign.status.partially_published",
  failed: "board.campaign.status.failed",
};

export const STATUS_TONE: Record<CampaignStatus, Tone> = {
  generating: "info",
  ready: "accent",
  approved: "ok",
  published: "ok",
  partially_published: "warn",
  failed: "err",
};

/** Label key + tone for a status; unknown values (a newer backend) read as "ready". */
export function statusView(status: string): { key: MessageKey; tone: Tone } {
  const s = (status in STATUS_LABEL ? status : "ready") as CampaignStatus;
  return { key: STATUS_LABEL[s], tone: STATUS_TONE[s] };
}

export const FORMAT_LABEL: Record<ImageFormat, MessageKey> = {
  square: "board.campaign.format.square",
  portrait: "board.campaign.format.portrait",
  landscape: "board.campaign.format.landscape",
  story: "board.campaign.format.story",
  gbp: "board.campaign.format.gbp",
};

export const MODE_LABEL: Record<ChannelMode, MessageKey> = {
  connected: "board.campaign.mode.connected",
  export_only: "board.campaign.mode.export_only",
  disabled: "board.campaign.mode.disabled",
};

export const OUTCOME_LABEL: Record<EventOutcome, MessageKey> = {
  published: "board.campaign.outcome.published",
  failed: "board.campaign.outcome.failed",
  exported: "board.campaign.outcome.exported",
  blocked: "board.campaign.outcome.blocked",
};

export const OUTCOME_TONE: Record<EventOutcome, Tone> = {
  published: "ok",
  failed: "err",
  exported: "info",
  blocked: "warn",
};

/** Fallback channel names when /channels hasn't loaded. */
export const CHANNEL_NAME: Record<ChannelId, string> = {
  facebook_page: "Facebook Page",
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
  google_business: "Google Business Profile",
  whatsapp: "WhatsApp",
  export: "Export pack",
  sandbox: "Sandbox",
};

export function channelName(channel: ChannelId, statuses?: ChannelStatus[] | null): string {
  return statuses?.find((s) => s.channel === channel)?.label || CHANNEL_NAME[channel] || channel;
}

// ---------------------------------------------------------------------------
// Approval and publishing
// ---------------------------------------------------------------------------

/** True while an approval stands (backend gate.is_approved): approved and not edited since. */
export function isApproved(c: Pick<Campaign, "status" | "approved_at">): boolean {
  return !!c.approved_at && c.status !== "generating" && c.status !== "ready";
}

export interface BlockingIssue {
  channel: ChannelId;
  message: string;
  /** Computed here (over the limit / empty) rather than reported by the server. */
  local: boolean;
}

// Server issues (copywriter.validate_variant) that are advice or a note about an automatic fix,
// not a problem: shown as "check before posting", they don't block approval.
const ADVISORY_RE = /^(Names competitor|Removed hashtag|Shortened to fit)/i;

/** True for a server issue that is advice (e.g. "Names competitor X — keep it factual"), not a blocker. */
export function isAdvisory(issue: string): boolean {
  return ADVISORY_RE.test(issue.trim());
}

/**
 * What stops approval: server-reported problems on an enabled variant (unsupported claims,
 * placeholders, too many hashtags… — advisories excluded), plus over-limit or empty copy computed
 * locally so the button reacts while typing, before the save lands.
 */
export function blockingIssues(variants: Variant[]): BlockingIssue[] {
  const out: BlockingIssue[] = [];
  for (const v of variants) {
    if (!v.enabled) continue;
    for (const message of v.issues ?? []) if (!isAdvisory(message)) out.push({ channel: v.channel, message, local: false });
    if (!(v.text ?? "").trim()) out.push({ channel: v.channel, message: "empty", local: true });
    const b = charBudget(v.channel, v);
    if (b.state === "over") out.push({ channel: v.channel, message: "over_limit", local: true });
  }
  return out;
}

/** Approve is possible only on a "ready" campaign with at least one enabled channel and no blocking issue. */
export function canApprove(c: Pick<Campaign, "status" | "variants">): boolean {
  return c.status === "ready" && c.variants.some((v) => v.enabled) && blockingIssues(c.variants).length === 0;
}

export type PublishBlock =
  | "not_approved"
  | "disabled"
  | "no_variant"
  | "variant_off"
  | "no_quota"
  | "has_issues";

export const BLOCK_LABEL: Record<PublishBlock, MessageKey> = {
  not_approved: "board.campaign.block.not_approved",
  disabled: "board.campaign.block.disabled",
  no_variant: "board.campaign.block.no_variant",
  variant_off: "board.campaign.block.variant_off",
  no_quota: "board.campaign.block.no_quota",
  has_issues: "board.campaign.block.has_issues",
};

/** "Publishing" here sends nothing to a platform (backend gate.EXPORT_CHANNELS): no approval needed. */
export const EXPORT_CHANNELS: ChannelId[] = ["export", "whatsapp"];

export interface ChannelOption {
  status: ChannelStatus;
  variant: Variant | null;
  /** null = can be ticked for publishing. */
  block: PublishBlock | null;
  /** What publishing does here: post for real, prepare an export / share link, or simulate. */
  effect: "post" | "export" | "simulate";
}

/**
 * Which channels can be ticked for publishing — the backend gate (gate.can_publish) seen from the
 * UI: every channel needs an enabled variant; the export pack and WhatsApp (nothing leaves the
 * server) need no approval; every other channel needs a standing approval, an adapter that isn't
 * disabled, quota left and no validation issues.
 */
export function channelOptions(c: Pick<Campaign, "status" | "approved_at" | "variants">, statuses: ChannelStatus[]): ChannelOption[] {
  const approved = isApproved(c);
  return statuses.map((status) => {
    const id = status.channel;
    const variant = c.variants.find((v) => v.channel === id) ?? null;
    const exportish = EXPORT_CHANNELS.includes(id);
    const effect: ChannelOption["effect"] =
      id === "sandbox" ? "simulate" : exportish || status.mode !== "connected" ? "export" : "post";
    let block: PublishBlock | null = null;
    if (status.mode === "disabled") block = "disabled";
    else if (!variant) block = "no_variant";
    else if (!variant.enabled) block = "variant_off";
    else if (c.status === "generating") block = "not_approved";
    else if (exportish) block = null;
    else if (status.quota_remaining === 0) block = "no_quota";
    else if (blockingIssues([variant]).length > 0) block = "has_issues";
    else if (!approved) block = "not_approved";
    return { status, variant, block, effect };
  });
}

/** The channels to tick by default: every selectable one that really posts (or simulates). */
export function defaultSelection(options: ChannelOption[]): ChannelId[] {
  return options.filter((o) => o.block === null && o.effect !== "export").map((o) => o.status.channel);
}

/** Channels a publish may send without an admin token when the server has no ADMIN_TOKEN set. */
export const TOKENLESS_CHANNELS: ChannelId[] = ["sandbox", "export", "whatsapp"];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function eventsNewestFirst(events: DistributionEvent[]): DistributionEvent[] {
  return [...events].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/** The newest attempt per channel. */
export function latestEventByChannel(events: DistributionEvent[]): Map<ChannelId, DistributionEvent> {
  const out = new Map<ChannelId, DistributionEvent>();
  for (const e of eventsNewestFirst(events)) if (!out.has(e.channel)) out.set(e.channel, e);
  return out;
}

/** Channels whose newest attempt failed (or was blocked) — the ones a Retry targets. */
export function retryableChannels(events: DistributionEvent[]): ChannelId[] {
  return [...latestEventByChannel(events).values()]
    .filter((e) => e.outcome === "failed" || e.outcome === "blocked")
    .map((e) => e.channel);
}

/** The wa.me share link from the newest WhatsApp event that produced one. */
export function whatsappShareUrl(events: DistributionEvent[]): string | null {
  const e = eventsNewestFirst(events).find(
    (ev) => ev.channel === "whatsapp" && !!ev.external_url && (ev.outcome === "published" || ev.outcome === "exported"),
  );
  return e?.external_url ?? null;
}

/** Newest successful publish time, or null (for trend markers). */
export function publishedAt(c: Pick<Campaign, "events">): string | null {
  const e = eventsNewestFirst(c.events ?? []).find((ev) => ev.outcome === "published");
  return e?.at ?? null;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Formats each channel posts, most natural first. */
export const CHANNEL_FORMATS: Record<ChannelId, ImageFormat[]> = {
  facebook_page: ["square", "landscape", "portrait"],
  instagram: ["square", "portrait"],
  x: ["landscape", "square"],
  linkedin: ["landscape", "square"],
  google_business: ["gbp", "landscape", "square"],
  whatsapp: ["square", "story"],
  export: ["square", "portrait", "landscape", "story", "gbp"],
  sandbox: ["square", "landscape"],
};

/** Newest asset per format. */
export function latestAssetByFormat(assets: Asset[]): Map<ImageFormat, Asset> {
  const out = new Map<ImageFormat, Asset>();
  for (const a of [...assets].sort((x, y) => (y.created_at ?? "").localeCompare(x.created_at ?? ""))) {
    if (!out.has(a.format)) out.set(a.format, a);
  }
  return out;
}

/** The image a channel posts: its chosen asset, else the newest asset in its preferred formats. */
export function assetForVariant(assets: Asset[], v: Pick<Variant, "channel" | "asset_id">): Asset | null {
  const chosen = v.asset_id ? assets.find((a) => a.asset_id === v.asset_id) : undefined;
  if (chosen) return chosen;
  const byFormat = latestAssetByFormat(assets);
  for (const f of CHANNEL_FORMATS[v.channel] ?? []) {
    const a = byFormat.get(f);
    if (a) return a;
  }
  return assets[0] ?? null;
}

/** True when any image came from the offline template renderer (shown honestly in the header). */
export function usesTemplateImages(assets: Asset[]): boolean {
  return assets.some((a) => a.provider === "template");
}

/** Deep-ish equality for patch fields (strings, booleans, null, string arrays). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

// Pure helpers for the guided Studio flow (review → where → publish → results): which step a
// campaign resumes at, what each server issue means in plain words (and the exact phrase a
// one-click fix can remove), where each channel would post for this brand, and how far drafting
// has got. No React, no network — unit-tested in studioFlow.test.ts.
import type { Campaign, ChannelId, ChannelStatus, Job, Variant } from "../../api/types";
import type { MessageKey } from "../../i18n";
import type { PublishBlock } from "./campaignModel";
import { EXPORT_CHANNELS, TOKENLESS_CHANNELS, blockingIssues, charBudget, normalizeHashtag } from "./campaignModel";

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type StepId = "review" | "where" | "publish" | "results";

export const STEPS: StepId[] = ["review", "where", "publish", "results"];

export const STEP_LABEL: Record<StepId, MessageKey> = {
  review: "board.campaign.step.review",
  where: "board.campaign.step.where",
  publish: "board.campaign.step.publish",
  results: "board.campaign.step.results",
};

export function parseStep(value: string | null | undefined): StepId | null {
  return STEPS.includes(value as StepId) ? (value as StepId) : null;
}

/** Where a campaign picks up: a draft is reviewed, an approved one is ready to publish, a sent one
 * shows its results. A failed campaign shows results when something was attempted, else the draft. */
export function stepForCampaign(c: Pick<Campaign, "status" | "events">): StepId {
  switch (c.status) {
    case "approved":
      return "publish";
    case "published":
    case "partially_published":
      return "results";
    case "failed":
      return (c.events?.length ?? 0) > 0 ? "results" : "review";
    default:
      return "review";
  }
}

/** Steps the user may open now: the draft and the channel choice always; publishing once nothing
 * blocks approval; results once something was attempted. Nothing but review while drafting. */
export function reachableSteps(c: Pick<Campaign, "status" | "events" | "variants">): Set<StepId> {
  const out = new Set<StepId>(["review"]);
  if (c.status === "generating" || c.variants.length === 0) return out;
  out.add("where");
  if (blockingIssues(c.variants).length === 0) out.add("publish");
  if ((c.events?.length ?? 0) > 0) out.add("results");
  return out;
}

/** The step to show: the URL's if it can be opened, else the campaign's resume step (or review). */
export function currentStep(c: Pick<Campaign, "status" | "events" | "variants">, fromUrl: StepId | null): StepId {
  const ok = reachableSteps(c);
  if (fromUrl && ok.has(fromUrl)) return fromUrl;
  const resume = stepForCampaign(c);
  return ok.has(resume) ? resume : "review";
}

// ---------------------------------------------------------------------------
// Issues in plain words
// ---------------------------------------------------------------------------

export type IssueKind =
  | "claim"
  | "hashtag_claim"
  | "too_many_tags"
  | "empty"
  | "too_long"
  | "placeholder"
  | "competitor"
  | "removed_tag"
  | "shortened"
  | "other";

export interface IssueView {
  kind: IssueKind;
  /** The exact words the issue is about (a claim token, a hashtag, a competitor name). */
  phrase: string | null;
  /** Numbers from the message: a hashtag cap, a character count / limit. */
  n: number | null;
  limit: number | null;
  /** Advice only: never blocks approval. */
  advisory: boolean;
  raw: string;
}

const view = (kind: IssueKind, raw: string, over: Partial<IssueView> = {}): IssueView => ({
  kind,
  phrase: null,
  n: null,
  limit: null,
  advisory: kind === "competitor" || kind === "removed_tag" || kind === "shortened",
  raw,
  ...over,
});

/**
 * Reads one issue string from the backend's copywriter / claims check (or a local "empty" /
 * "over_limit" key) into a kind plus the phrase it names. Unknown messages come back as "other"
 * with the raw text, so a newer backend still shows something.
 */
export function parseIssue(message: string): IssueView {
  const m = message.trim();
  let r: RegExpMatchArray | null;
  if (m === "empty" || /^The post text is empty/i.test(m)) return view("empty", m);
  if (m === "over_limit") return view("too_long", m);
  if ((r = m.match(/^Unsupported claim — “(.+?)” —/))) return view("claim", m, { phrase: r[1] });
  if ((r = m.match(/^Unsupported claim — .+? \("(.+?)"\)/))) return view("claim", m, { phrase: r[1] });
  if ((r = m.match(/^Hashtag (#\S+) carries an unsupported claim/))) return view("hashtag_claim", m, { phrase: r[1] });
  if ((r = m.match(/^Removed hashtag (#\S+)/))) return view("removed_tag", m, { phrase: r[1] });
  if ((r = m.match(/^More than (\d+) hashtags/))) return view("too_many_tags", m, { n: Number(r[1]) });
  if (/posts don't use hashtags$/.test(m)) return view("too_many_tags", m, { n: 0 });
  if ((r = m.match(/^Too long: (\d+)\/(\d+)/))) return view("too_long", m, { n: Number(r[1]), limit: Number(r[2]) });
  if ((r = m.match(/^Shortened to fit the (\d+)-character/))) return view("shortened", m, { limit: Number(r[1]) });
  if (/\[placeholder\]/i.test(m)) return view("placeholder", m);
  if ((r = m.match(/^Names competitor (.+?) — /))) return view("competitor", m, { phrase: r[1] });
  return view("other", m);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches `phrase` as written, but never inside a longer word ("best" is not found in "bestseller"). */
function phraseRe(phrase: string): RegExp {
  const edge = /^[\p{L}\p{N}]/u;
  const head = edge.test(phrase) ? "(?<![\\p{L}\\p{N}])" : "";
  const tail = edge.test([...phrase].pop() ?? "") ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${head}${escapeRe(phrase)}${tail}`, "gu");
}

/** True when `text` contains `phrase` as whole words. */
export function containsPhrase(text: string, phrase: string): boolean {
  return !!phrase && phraseRe(phrase).test(text);
}

/** A one-click fix exists: a claim whose exact words appear in the text, or a flagged hashtag in the list. */
export function fixFor(issue: IssueView, text: string, hashtags: string[] = []): "phrase" | "hashtag" | null {
  if (!issue.phrase) return null;
  if (issue.kind === "claim" && containsPhrase(text, issue.phrase)) return "phrase";
  if (issue.kind === "hashtag_claim") {
    const tag = normalizeHashtag(issue.phrase).toLowerCase();
    if (hashtags.some((h) => normalizeHashtag(h).toLowerCase() === tag)) return "hashtag";
  }
  return null;
}

const CUT = "\u0000";

/**
 * `text` with every whole-word occurrence of `phrase` taken out and the seams tidied: no doubled
 * spaces, no space before punctuation, no empty brackets or doubled commas, a sentence that now
 * starts with a lower-case letter is capitalised, blank lines kept as paragraph breaks. Unchanged
 * when the phrase isn't there.
 */
export function removePhrase(text: string, phrase: string): string {
  if (!containsPhrase(text, phrase)) return text;
  const parts = text.replace(phraseRe(phrase), CUT).split(CUT);
  let out = parts[0];
  for (const part of parts.slice(1)) {
    const prev = out.replaceAll(CUT, "");
    const startsSentence = prev.trim() === "" || /[.!?]\s*$/.test(prev) || /\n\s*$/.test(prev);
    // A cut at a sentence start drops the stray comma after it and capitalises what follows.
    const next = startsSentence
      ? part.replace(/^[ \t,;:]+/, /\s$/.test(prev) || prev === "" ? "" : " ").replace(/^(\s*)(\p{Ll})/u, (_, sp: string, ch: string) => sp + ch.toUpperCase())
      : part;
    out += CUT + next;
  }
  // Only the lines that lost something are tidied; the others (bullets, indentation) stay as written.
  const tidy = (line: string) =>
    line
      .replaceAll(CUT, "")
      .replace(/\(\s*\)|\[\s*\]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
      .replace(/[,;:]\s*([.!?])/g, "$1")
      .replace(/^[ \t]*[,;:]*[ \t]*/, "")
      .trimEnd();
  return out
    .split("\n")
    .map((line) => (line.includes(CUT) ? tidy(line) : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Everything to say about one enabled variant, as issue strings for parseIssue: local "empty" /
 * "over_limit" (react while typing) replace the server's matching messages, so none shows twice. */
export function variantIssues(v: Variant): string[] {
  if (!v.enabled) return [];
  const local = [...(!(v.text ?? "").trim() ? ["empty"] : []), ...(charBudget(v.channel, v).state === "over" ? ["over_limit"] : [])];
  const server = (v.issues ?? []).filter((m) => !/^(The post text is empty|Too long:)/.test(m));
  return [...local, ...server];
}

/** How many things must be fixed on this variant before approval (advice excluded). */
export function blockingCount(v: Variant): number {
  return variantIssues(v).filter((m) => !parseIssue(m).advisory).length;
}

/** The hashtag list without `tag` (compared without "#" and case). */
export function removeHashtag(hashtags: string[], tag: string): string[] {
  const t = normalizeHashtag(tag).toLowerCase();
  return hashtags.filter((h) => normalizeHashtag(h).toLowerCase() !== t);
}

// ---------------------------------------------------------------------------
// Where to post (step 2)
// ---------------------------------------------------------------------------

/**
 * What choosing a channel does for this brand:
 * post — its account is connected, so approving posts publicly;
 * simulate — the sandbox, nothing leaves the app;
 * share — WhatsApp: a share link you send yourself;
 * download — the export pack;
 * unconnected — no account for this brand: connect one, or export the files instead;
 * off — turned off on the server.
 */
export type DestinationKind = "post" | "simulate" | "share" | "download" | "unconnected" | "off";

export interface Destination {
  channel: ChannelId;
  status: ChannelStatus;
  variant: Variant;
  kind: DestinationKind;
  /** Why it can't be chosen right now (the approval still to come is not a block here). */
  block: Exclude<PublishBlock, "not_approved" | "no_variant"> | null;
  /** Sends to a platform, so it goes out only after approval (not WhatsApp or the export pack). */
  needsApproval: boolean;
}

function kindOf(status: ChannelStatus): DestinationKind {
  if (status.channel === "sandbox") return "simulate";
  if (status.channel === "whatsapp") return "share";
  if (status.channel === "export") return "download";
  if (status.mode === "disabled") return "off";
  return status.mode === "connected" ? "post" : "unconnected";
}

/** Every channel this campaign has copy for, as this brand would post to it. Channel order follows `statuses`. */
export function planDestinations(c: Pick<Campaign, "variants">, statuses: ChannelStatus[]): Destination[] {
  const out: Destination[] = [];
  for (const status of statuses) {
    const variant = c.variants.find((v) => v.channel === status.channel);
    if (!variant) continue;
    const kind = kindOf(status);
    let block: Destination["block"] = null;
    if (status.mode === "disabled") block = "disabled";
    else if (!variant.enabled) block = "variant_off";
    else if (blockingIssues([variant]).length > 0) block = "has_issues";
    else if (kind === "post" && status.quota_remaining === 0) block = "no_quota";
    out.push({ channel: status.channel, status, variant, kind, block, needsApproval: !EXPORT_CHANNELS.includes(status.channel) });
  }
  return out;
}

/** Chosen by default: what really posts, simulates or makes a share link. An unconnected channel
 * waits for the user to connect it or pick "Export instead"; the export pack is always downloadable. */
export function defaultPicks(dests: Destination[]): ChannelId[] {
  return dests.filter((d) => d.block === null && (d.kind === "post" || d.kind === "simulate" || d.kind === "share")).map((d) => d.channel);
}

/** The channels a publish will actually send, in destination order: picked and not blocked. */
export function sendList(dests: Destination[], picked: ChannelId[]): Destination[] {
  return dests.filter((d) => d.block === null && picked.includes(d.channel));
}

/** Publishing these needs the admin token up front (anything beyond sandbox / export / WhatsApp). */
export function needsTokenFirst(channels: ChannelId[]): boolean {
  return channels.some((ch) => !TOKENLESS_CHANNELS.includes(ch));
}

// ---------------------------------------------------------------------------
// Drafting progress
// ---------------------------------------------------------------------------

export type GenStage = "queued" | "copy" | "images" | "saving" | "done";

export const GEN_STAGES: GenStage[] = ["queued", "copy", "images", "saving", "done"];

/** How far drafting has got, from the job's message (service.generate: copy → image i of n → saving → ready). */
export function generationStage(job: Pick<Job, "message" | "done" | "total"> | null): {
  stage: GenStage;
  image: number | null;
  images: number | null;
} {
  const msg = job?.message ?? "";
  let r: RegExpMatchArray | null;
  if ((r = msg.match(/image (\d+) of (\d+)/i))) return { stage: "images", image: Number(r[1]), images: Number(r[2]) };
  if (/writing the copy/i.test(msg)) return { stage: "copy", image: null, images: null };
  if (/^saving/i.test(msg)) return { stage: "saving", image: null, images: null };
  if (/ready/i.test(msg)) return { stage: "done", image: null, images: null };
  if (!job || /queued/i.test(msg) || job.total === 0) return { stage: "queued", image: null, images: null };
  return { stage: job.done === 0 ? "copy" : "saving", image: null, images: null };
}

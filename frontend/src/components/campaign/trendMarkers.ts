// Pure helpers for the "Published" markers on the trend chart. The chart's x-axis is by check
// (index), not by time, so an event is placed between the two checks around it, proportionally.
import type { Campaign, Snapshot } from "../../api/types";
import { headline, isBreak } from "../dashboard/visibility";
import { eventsNewestFirst } from "./campaignModel";

/** One published campaign, as the trend chart draws it. */
export interface PublishMarker {
  at: string;
  headline: string;
  campaignId: string;
}

/** One marker per campaign: its first successful publish. Oldest first. */
export function publishMarkers(campaigns: Campaign[]): PublishMarker[] {
  const out: PublishMarker[] = [];
  for (const c of campaigns) {
    const published = eventsNewestFirst(c.events ?? []).filter((e) => e.outcome === "published");
    const first = published[published.length - 1];
    if (first?.at) out.push({ at: first.at, headline: c.headline || c.action, campaignId: c.campaign_id });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Where an event sits on an index axis of checks completed at `times` (ms, ascending): a fractional
 * index between the checks around it. `after` = later than the newest check (drawn just past it);
 * null = before the first check or an invalid time.
 */
export function markerIndex(times: number[], at: number): { index: number; after: boolean } | null {
  const n = times.length;
  if (!n || !Number.isFinite(at) || at < times[0]) return null;
  if (at >= times[n - 1]) return { index: n - 1, after: at > times[n - 1] };
  for (let i = 0; i < n - 1; i++) {
    const a = times[i];
    const b = times[i + 1];
    if (at >= a && at < b) return { index: i + (b > a ? (at - a) / (b - a) : 0), after: false };
  }
  return null;
}

/**
 * "Since this campaign" (chart flag tooltip): newest headline score (Visibility Index, or v1 composite)
 * minus the last one at or before the event, when no trend-line break separates them. The proper,
 * noise-aware answer is the impact ledger (ImpactCard); this is only the point difference on the chart.
 */
export function sinceDelta(snapshots: Snapshot[], at: string): number | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t) || snapshots.length < 2) return null;
  const time = (s: Snapshot) => Date.parse(s.collection_completed_at || s.collection_started_at);
  let from = -1;
  snapshots.forEach((s, i) => {
    if (time(s) <= t) from = i;
  });
  const last = snapshots.length - 1;
  if (from < 0 || from === last || time(snapshots[last]) <= t) return null;
  for (let i = from + 1; i <= last; i++) if (isBreak(snapshots[i - 1], snapshots[i])) return null;
  return headline(snapshots[last]).value - headline(snapshots[from]).value;
}

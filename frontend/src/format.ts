import type { Gap } from "./api/types";

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

// "improve_listing_presence" -> "Improve listing presence"
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Friendly names for query-set intent types (backend querysets/templates.py).
const INTENT_LABELS: Record<string, string> = {
  category_discovery: "Discovery — 'best … for …'",
  problem_first: "Problem-first — 'how do I …'",
  alternative_seeking: "Alternatives to competitors",
  attribute_constrained: "By attribute — 'most affordable …'",
  local_contextual: "Local — '… in <city>'",
  recommendation_seeking: "Who to hire",
  identity: "About your brand",
  fit: "About your brand — fit",
  commercial: "About your brand — pricing",
  head_to_head: "Your brand vs competitors",
  custom: "Your own questions",
};

export function intentLabel(intent: string | null | undefined): string {
  if (!intent) return "—";
  return INTENT_LABELS[intent] ?? humanize(intent);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function entityName(id: string, entities: Record<string, string> | undefined): string {
  return entities?.[id] ?? humanize(id);
}

function num(detail: Record<string, unknown>, key: string): number | undefined {
  const v = detail[key];
  return typeof v === "number" ? v : undefined;
}

export const GAP_TYPE_EXPLAINER: Record<string, string> = {
  presence: "The brand is rarely or never mentioned.",
  prominence: "Mentioned, but listed low in the answer.",
  competitive: "A competitor appears alongside and ranks higher.",
  representation: "Models describe the brand inconsistently or wrongly.",
  source: "Key category sources don't mention the brand.",
};

// Human-readable description of where a gap applies.
export function gapScope(gap: Gap, entities?: Record<string, string>): string {
  const d = gap.detail ?? {};
  if (gap.gap_type === "competitive" && typeof d.competitor_id === "string") {
    return `vs. ${entityName(d.competitor_id, entities)}`;
  }
  switch (d.scope) {
    case "overall":
      return "Across all providers and questions";
    case "provider":
      return `On ${String(d.provider_id)}`;
    case "intent":
      return `For "${humanize(String(d.intent_type))}" questions`;
  }
  if (gap.gap_type === "prominence") return "Across all mentions";
  return d.scope ? humanize(String(d.scope)) : "Overall";
}

// Key numbers for a gap as [label, value] pairs.
export function gapNumbers(gap: Gap): [string, string][] {
  const d = gap.detail ?? {};
  const out: [string, string][] = [];
  const coverage = num(d, "coverage");
  if (coverage !== undefined) out.push(["Coverage", pct(coverage)]);
  const meanRank = num(d, "mean_rank");
  if (meanRank !== undefined) out.push(["Mean rank", meanRank.toFixed(1)]);
  const co = num(d, "co_occurrence_rate");
  if (co !== undefined) out.push(["Co-occurs", pct(co)]);
  const beat = num(d, "beat_rate");
  if (beat !== undefined) out.push(["Out-ranks brand", pct(beat)]);
  const dis = num(d, "disagreement_rate");
  if (dis !== undefined) out.push(["Disagreement", pct(dis)]);
  const nonMentioning = num(d, "non_mentioning_count");
  const dominant = num(d, "dominant_source_count");
  if (nonMentioning !== undefined && dominant !== undefined) {
    out.push(["Sources missing brand", `${nonMentioning}/${dominant}`]);
  }
  return out;
}

export function evidenceHref(brandKey: string, runId: string, refs?: string[]): string {
  const base = `/brands/${encodeURIComponent(brandKey)}/runs/${encodeURIComponent(runId)}/evidence`;
  if (!refs || refs.length === 0) return base;
  return `${base}?refs=${refs.map(encodeURIComponent).join(",")}`;
}

// Small, pure helpers shared by the dashboard components (agent D).
import { useCallback, useMemo } from "react";
import type { Gap, ProviderInfo, Recommendation } from "../../api/types";
import { useLang, useT } from "../../i18n";
import type { Formatter, Lang, MessageKey, TFunction, Vars } from "../../i18n";

const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/** Composite fraction (0..1) -> whole score out of 100. */
export function toScore(fraction: number | null | undefined): number {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return 0;
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

/** Rating word for a 0–100 score. Bands: 0–24, 25–49, 50–74, 75–100. */
export function ratingKey(score: number): MessageKey {
  if (score >= 75) return "dashboard.hero.rating.top";
  if (score >= 50) return "dashboard.hero.rating.often";
  if (score >= 25) return "dashboard.hero.rating.sometimes";
  return "dashboard.hero.rating.rare";
}

export function ratingTone(score: number): "low" | "mid" | "good" | "top" {
  if (score >= 75) return "top";
  if (score >= 50) return "good";
  if (score >= 25) return "mid";
  return "low";
}

/** Effort chip: 1 -> quick, 3 -> some work, 5+ -> bigger change. */
export function effortKey(effort: number | undefined): MessageKey {
  if (effort !== undefined && effort >= 5) return "dashboard.next.effort.big";
  if (effort !== undefined && effort >= 2) return "dashboard.next.effort.some";
  return "dashboard.next.effort.quick";
}

/** Joins names the way the current language does ("A, B and C" / "A, B और C"). */
export function useListFormat(): (items: string[]) => string {
  const { lang } = useLang();
  return useMemo(() => {
    let lf: Intl.ListFormat | null = null;
    try {
      lf = new Intl.ListFormat(LOCALES[lang], { style: "long", type: "conjunction" });
    } catch {
      lf = null;
    }
    return (items: string[]) => (lf ? lf.format(items) : items.join(", "));
  }, [lang]);
}

/** "25 Sept" in the current language (Western digits). */
export function useShortDate(): (iso: string) => string {
  const { lang } = useLang();
  return useMemo(() => {
    const dtf = new Intl.DateTimeFormat(`${LOCALES[lang]}-u-nu-latn`, { day: "numeric", month: "short" });
    return (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "" : dtf.format(d);
    };
  }, [lang]);
}

/** "6:20 pm" in the current language (Western digits); used when checks share one day. */
export function useShortTime(): (iso: string) => string {
  const { lang } = useLang();
  return useMemo(() => {
    const dtf = new Intl.DateTimeFormat(`${LOCALES[lang]}-u-nu-latn`, { hour: "numeric", minute: "2-digit" });
    return (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "" : dtf.format(d);
    };
  }, [lang]);
}

/** Provider id -> display label ("gemini" -> "Google Gemini"); falls back to the id. */
// AI product names stay as-is; the two offline sources get translated plain names.
export function useProviderLabel(providers: ProviderInfo[] | null | undefined): (id: string) => string {
  const t = useT();
  return useCallback(
    (id: string) => {
      if (id === "synthetic") return t("dashboard.origin.synthetic");
      if (id === "replay") return t("dashboard.origin.replay");
      return providers?.find((p) => p.provider_id === id)?.label || id;
    },
    [providers, t],
  );
}

export function sortByPriority(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort(
    (a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      (b.delta_composite ?? 0) - (a.delta_composite ?? 0) ||
      a.recommendation_id.localeCompare(b.recommendation_id),
  );
}

export function humanizeId(value: string | null | undefined): string {
  if (!value) return "";
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function num(detail: Record<string, unknown>, key: string): number | undefined {
  const v = detail[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const INTENT_EXAMPLE: Record<string, MessageKey> = {
  category_discovery: "dashboard.intent.category_discovery",
  problem_first: "dashboard.intent.problem_first",
  alternative_seeking: "dashboard.intent.alternative_seeking",
  attribute_constrained: "dashboard.intent.attribute_constrained",
  local_contextual: "dashboard.intent.local_contextual",
  recommendation_seeking: "dashboard.intent.recommendation_seeking",
};

type Msg = { key: MessageKey; vars?: Vars };

/**
 * The plain "why" sentence for a gap, built from its structured detail (the same facts
 * as engine.py `_finding`), so it can be translated. Pass the result to <T k vars />.
 */
export function gapFinding(
  gap: Gap,
  t: TFunction,
  fmt: Formatter,
  entities: Record<string, string> | undefined,
  labelOf: (providerId: string) => string,
): Msg {
  const d = gap.detail ?? {};
  const pct = (x: number | undefined) => fmt.percent(x ?? 0);
  switch (gap.gap_type) {
    case "presence": {
      const cov = num(d, "coverage") ?? 0;
      if (d.scope === "provider") {
        const ai = labelOf(String(d.provider_id ?? ""));
        return cov === 0
          ? { key: "dashboard.why.presence.providerNone", vars: { ai } }
          : { key: "dashboard.why.presence.provider", vars: { ai, pct: pct(cov) } };
      }
      if (d.scope === "intent") {
        const exampleKey = INTENT_EXAMPLE[String(d.intent_type ?? "")];
        if (!exampleKey) return { key: "dashboard.why.presence.intentGeneric", vars: { pct: pct(cov) } };
        const example = t(exampleKey);
        return cov === 0
          ? { key: "dashboard.why.presence.intentNone", vars: { example } }
          : { key: "dashboard.why.presence.intent", vars: { example, pct: pct(cov) } };
      }
      return cov === 0
        ? { key: "dashboard.why.presence.overallNone" }
        : { key: "dashboard.why.presence.overall", vars: { pct: pct(cov) } };
    }
    case "prominence":
      return { key: "dashboard.why.prominence", vars: { rank: fmt.number(num(d, "mean_rank") ?? 0, 1) } };
    case "competitive": {
      const id = String(d.competitor_id ?? "");
      const competitor = entities?.[id] ?? humanizeId(id);
      return { key: "dashboard.why.competitive", vars: { competitor, pct: pct(num(d, "beat_rate")) } };
    }
    case "representation": {
      const rate = num(d, "disagreement_rate") ?? 0;
      const mixed = d.disagree_with_each_other === true;
      if (rate > 0 && mixed) return { key: "dashboard.why.representationBoth", vars: { pct: pct(rate) } };
      if (rate > 0) return { key: "dashboard.why.representation", vars: { pct: pct(rate) } };
      return { key: "dashboard.why.representationMixed" };
    }
    case "source":
      return {
        key: "dashboard.why.source",
        vars: { k: num(d, "non_mentioning_count") ?? 0, n: num(d, "dominant_source_count") ?? 0 },
      };
    default:
      return { key: "dashboard.why.unknown" };
  }
}

/** Where a gap applies (details view). */
export function gapScopeText(
  gap: Gap,
  t: TFunction,
  entities: Record<string, string> | undefined,
  labelOf: (providerId: string) => string,
): string {
  const d = gap.detail ?? {};
  if (gap.gap_type === "competitive" && typeof d.competitor_id === "string") {
    return t("dashboard.gaps.scope.competitor", { name: entities?.[d.competitor_id] ?? humanizeId(d.competitor_id) });
  }
  if (d.scope === "overall") return t("dashboard.gaps.scope.overall");
  if (d.scope === "provider") return t("dashboard.gaps.scope.provider", { ai: labelOf(String(d.provider_id ?? "")) });
  if (d.scope === "intent") return t("dashboard.gaps.scope.intent", { intent: String(d.intent_type ?? "") });
  if (gap.gap_type === "prominence") return t("dashboard.gaps.scope.mentions");
  return t("dashboard.gaps.scope.other");
}

/** Key numbers of a gap as [label, value] pairs (details view). */
export function gapNumberPairs(gap: Gap, t: TFunction, fmt: Formatter): [string, string][] {
  const d = gap.detail ?? {};
  const out: [string, string][] = [];
  const pct = (x: number) => fmt.percent(x, 1);
  const coverage = num(d, "coverage");
  if (coverage !== undefined) out.push([t("dashboard.gaps.num.coverage"), pct(coverage)]);
  const meanRank = num(d, "mean_rank");
  if (meanRank !== undefined) out.push([t("dashboard.gaps.num.meanRank"), fmt.number(meanRank, 1)]);
  const co = num(d, "co_occurrence_rate");
  if (co !== undefined) out.push([t("dashboard.gaps.num.co"), pct(co)]);
  const beat = num(d, "beat_rate");
  if (beat !== undefined) out.push([t("dashboard.gaps.num.beat"), pct(beat)]);
  const dis = num(d, "disagreement_rate");
  if (dis !== undefined) out.push([t("dashboard.gaps.num.disagree"), pct(dis)]);
  const missing = num(d, "non_mentioning_count");
  const dominant = num(d, "dominant_source_count");
  if (missing !== undefined && dominant !== undefined) {
    out.push([t("dashboard.gaps.num.sources"), `${fmt.number(missing)}/${fmt.number(dominant)}`]);
  }
  return out;
}

const GAP_TYPE_KEY: Record<string, MessageKey> = {
  presence: "dashboard.gaps.type.presence",
  prominence: "dashboard.gaps.type.prominence",
  competitive: "dashboard.gaps.type.competitive",
  representation: "dashboard.gaps.type.representation",
  source: "dashboard.gaps.type.source",
};

export function gapTypeText(gapType: string, t: TFunction): string {
  const key = GAP_TYPE_KEY[gapType];
  return key ? t(key) : humanizeId(gapType);
}


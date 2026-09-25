import { Link } from "react-router-dom";
import type { Gap, Recommendation } from "../api/types";
import { evidenceHref } from "../format";
import { useFormat, useT } from "../i18n";
import type { MessageKey } from "../i18n";
import { actionCopy } from "./dashboard/actions";
import { gapScopeText, gapTypeText, humanizeId, sortByPriority } from "./dashboard/helpers";

// delta_composite is already in composite points (0-100 scale, engine.py).
function deltaPoints(delta: number | undefined): number {
  return delta ?? 0;
}

// DESIGN §5.4 effort constants.
const EFFORT_LABEL: Record<number, MessageKey> = {
  1: "dashboard.recs.effortLabel.1",
  3: "dashboard.recs.effortLabel.3",
  5: "dashboard.recs.effortLabel.5",
  8: "dashboard.recs.effortLabel.8",
};

const CLASS_LABEL: Record<string, MessageKey> = {
  content: "dashboard.recs.class.content",
  messaging: "dashboard.recs.class.messaging",
  distribution: "dashboard.recs.class.distribution",
};

// PRD AC-7: every recommendation traces to a detected gap and its evidence. Details view only:
// the full ranked list with priority, confidence, effort and who drafted the text.
export function RecommendationList({
  recommendations,
  gaps,
  brandKey,
  runId,
  entities,
  onTraceGap,
  labelOf = (id: string) => id,
}: {
  recommendations: Recommendation[];
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  onTraceGap: (gapId: string) => void;
  labelOf?: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  if (recommendations.length === 0) {
    return <p className="empty">{t("dashboard.recs.empty")}</p>;
  }
  const gapById = new Map(gaps.map((g) => [g.gap_id, g]));
  const sorted = sortByPriority(recommendations);

  return (
    <ol className="rec-list">
      {sorted.map((rec, i) => {
        const gap = gapById.get(rec.gap_id);
        const refs = rec.evidence_refs ?? [];
        const delta = deltaPoints(rec.delta_composite);
        const copy = actionCopy(rec.action);
        const competitorId = typeof gap?.detail?.competitor_id === "string" ? gap.detail.competitor_id : null;
        const competitor = competitorId ? (entities?.[competitorId] ?? humanizeId(competitorId)) : null;
        const title = !copy
          ? humanizeId(rec.action)
          : copy.titleGeneric && !competitor
            ? t(copy.titleGeneric)
            : t(copy.title, { competitor: competitor ?? "" });
        const effortLabel = EFFORT_LABEL[rec.effort];
        return (
          <li key={rec.recommendation_id ?? i} className="card rec-card">
            <div className="rec-rank">#{i + 1}</div>
            <div className="rec-body">
              <div className="rec-head">
                <h4>{title}</h4>
                <span className="badge badge-accent">
                  {CLASS_LABEL[rec.action_class] ? t(CLASS_LABEL[rec.action_class]) : humanizeId(rec.action_class)}
                </span>
                <code className="rec-action small">{rec.action}</code>
              </div>
              <div className="rec-stats">
                <span className="kv">
                  <span className="kv-label">{t("dashboard.recs.delta")}</span>
                  <span className={`kv-value ${delta >= 0 ? "pos" : "neg"}`}>
                    {t("dashboard.recs.deltaValue", { n: `${delta >= 0 ? "+" : ""}${fmt.number(delta, 1)}` })}
                  </span>
                </span>
                <span className="kv">
                  <span className="kv-label">{t("dashboard.recs.priority")}</span>
                  <span className="kv-value">{fmt.number(rec.priority ?? 0, 2)}</span>
                </span>
                <span className="kv">
                  <span className="kv-label">{t("dashboard.recs.effort")}</span>
                  <span className="kv-value">
                    {effortLabel
                      ? t("dashboard.recs.effortValue", { n: rec.effort, label: t(effortLabel) })
                      : String(rec.effort ?? "—")}
                  </span>
                </span>
                {typeof rec.confidence === "number" && (
                  <span className="kv">
                    <span className="kv-label">{t("dashboard.recs.confidence")}</span>
                    <span className="kv-value">{fmt.percent(rec.confidence)}</span>
                  </span>
                )}
              </div>
              <p className="rec-reasoning">
                <span className="muted small">{t("dashboard.recs.reasoning")}</span>{" "}
                <span lang="en">{rec.reasoning}</span>
              </p>
              <div className="rec-trace">
                <a
                  href={`#gap-${rec.gap_id}`}
                  className="trace-link"
                  onClick={(e) => {
                    e.preventDefault();
                    onTraceGap(rec.gap_id);
                  }}
                >
                  {t("dashboard.recs.trace", { id: rec.gap_id })}
                  {gap && (
                    <span className="muted">
                      {" "}
                      ({gapTypeText(gap.gap_type, t)} · {gapScopeText(gap, t, entities, labelOf)})
                    </span>
                  )}
                </a>
                {refs.length > 0 && (
                  <Link to={evidenceHref(brandKey, runId, refs)} className="link-evidence">
                    {t.n("dashboard.recs.evidence", refs.length)}
                  </Link>
                )}
                <span className="muted small rec-drafted">
                  {rec.drafted_by === "template"
                    ? t("dashboard.recs.draftedTemplate")
                    : t("dashboard.recs.draftedOther", { by: rec.drafted_by })}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

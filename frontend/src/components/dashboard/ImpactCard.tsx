import { useEffect, useId, useState } from "react";
import { getImpact } from "../../api/client";
import type { ImpactEntry, ImpactResponse } from "../../api/types";
import { T, useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { Details } from "../../settings/details";
import { actionTitle } from "./actions";
import { VERDICT_KEY, verdictTone } from "./visibility";

/** The impact ledger for a brand; null until loaded or when the API has none. */
function useImpact(brandKey: string, version: string | undefined): ImpactResponse | null {
  const [data, setData] = useState<ImpactResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    getImpact(brandKey)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [brandKey, version]);
  return data;
}

function statusKey(e: ImpactEntry): MessageKey {
  const s = e.evaluation.status;
  if (s === "waiting") return "dashboard.impact.status.waiting";
  if (s === "no_baseline") return "dashboard.impact.status.no_baseline";
  if (s === "confounded") return "dashboard.impact.status.confounded";
  return VERDICT_KEY[s];
}

function Entry({ e, entities }: { e: ImpactEntry; entities?: Record<string, string> }) {
  const t = useT();
  const fmt = useFormat();
  const ev = e.evaluation;
  const p = ev.primary;
  const competitor = e.competitor_id ? (entities?.[e.competitor_id] ?? e.competitor_id) : null;
  return (
    <li className="impact-row">
      <div className="impact-row-top">
        <span className="impact-action">{actionTitle(e.action, competitor, t)}</span>
        <span className="status-pill" data-tone={verdictTone(ev.status)}>
          <T k={statusKey(e)} />
        </span>
      </div>
      <p className="muted small">
        {t(e.source === "campaign" ? "dashboard.impact.doneCampaign" : "dashboard.impact.done", { date: fmt.date(e.done_at) })}
        {e.closed_at && <> · {t("dashboard.impact.reopened")}</>}
      </p>
      {ev.basis === "overall" && <p className="muted small">{t("dashboard.impact.basisOverall")}</p>}
      <Details>
        {p && p.delta != null && p.ci95 && (
          <p className="small impact-detail">
            {t("dashboard.impact.detail", {
              before: fmt.number(p.vi_before ?? 0, 1),
              after: fmt.number(p.vi_after ?? 0, 1),
              delta: fmt.number(p.delta, 1),
              lo: fmt.number(p.ci95[0], 1),
              hi: fmt.number(p.ci95[1], 1),
              q: p.questions,
              mde: fmt.number(p.mde ?? 0, 1),
            })}
          </p>
        )}
        <ul className="impact-checks small muted">
          {ev.untargeted?.difference_in_differences != null && (
            <li>{t("dashboard.impact.untargeted", { delta: fmt.number(ev.untargeted.delta ?? 0, 1), did: fmt.number(ev.untargeted.difference_in_differences, 1) })}</li>
          )}
          {ev.market_drift != null && <li>{t("dashboard.impact.drift", { drift: fmt.number(ev.market_drift, 1) })}</li>}
          {ev.placebo && ev.placebo.pairs > 0 && (
            <li>{t("dashboard.impact.placebo", { fired: ev.placebo.fired, pairs: ev.placebo.pairs })}</li>
          )}
          {ev.prediction_check?.expected_gain_vi != null && ev.prediction_check.measured_overall != null && (
            <li>
              {t("dashboard.impact.prediction", {
                expected: fmt.number(ev.prediction_check.expected_gain_vi, 1),
                measured: fmt.number(ev.prediction_check.measured_overall, 1),
              })}
            </li>
          )}
          {ev.confounded_by && ev.confounded_by.length > 0 && <li>{t.n("dashboard.impact.confoundedBy", ev.confounded_by.length)}</li>}
        </ul>
      </Details>
    </li>
  );
}

/**
 * "Did it work?" — every action marked done (by hand on the board, or by a Campaign Studio publish)
 * with what the next checks measured: the change in your Visibility Index on the questions it was
 * meant to help, as a plain verdict that never claims cause ("rose after", not "worked"). The numbers,
 * the noise checks and the prediction it is compared against are Analytical view.
 */
export function ImpactCard({ brandKey, version, entities }: { brandKey: string; version?: string; entities?: Record<string, string> }) {
  const t = useT();
  const headingId = useId();
  const data = useImpact(brandKey, version);
  if (!data || data.entries.length === 0) return null;
  const entries = [...data.entries].sort((a, b) => b.done_at.localeCompare(a.done_at));
  return (
    <section className="card impact-card" aria-labelledby={headingId}>
      <p className="eyebrow">{t("dashboard.impact.eyebrow")}</p>
      <h2 id={headingId} className="cs-subhead">
        {t("dashboard.impact.title")}
      </h2>
      <p className="section-note">{t("dashboard.impact.intro")}</p>
      <ul className="impact-list">
        {entries.map((e) => (
          <Entry key={e.ledger_id} e={e} entities={entities} />
        ))}
      </ul>
    </section>
  );
}

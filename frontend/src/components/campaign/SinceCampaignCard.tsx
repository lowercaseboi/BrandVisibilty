import { useId } from "react";
import type { Snapshot, TrendVerdict } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { EmptyState } from "../EmptyState";
import { useBrandData } from "../../pages/brand/BrandContext";
import { TransitionLink } from "../module/transition";
import { campaignHref } from "./CampaignIndex";
import { sinceCampaign } from "./trendMarkers";
import type { PublishMarker } from "./trendMarkers";

function verdictKey(v: TrendVerdict | undefined): MessageKey | null {
  if (!v) return null;
  switch (v.status) {
    case "change_detected":
      return v.direction === "down" ? "board.since.verdict.change_detected_down" : "board.since.verdict.change_detected_up";
    case "insufficient_data":
    case "no_change_detected":
    case "no_clear_trend":
    case "improving":
    case "declining":
      return `board.since.verdict.${v.status}`;
    default:
      return null;
  }
}

/**
 * "Did it work?" on Analysis: the score from the last analysis before the newest campaign first
 * went out against the latest one, with the AC-8 trend verdict's wording. Honest when there is
 * nothing to compare yet (no later analysis, none before, or the method changed in between).
 */
export function SinceCampaignCard({ markers }: { markers: PublishMarker[] }) {
  const t = useT();
  const fmt = useFormat();
  const headingId = useId();
  const { brandKey, history, latest } = useBrandData();
  const since = sinceCampaign(history.length ? history : latest ? [latest] : [], markers);
  if (!since) return null;
  const { marker, before, after, comparable, delta } = since;
  const verdict = verdictKey(after?.trend_verdict ?? latest?.trend_verdict);
  const score = (s: Snapshot) => fmt.number(Math.round(s.analysis_result.composite_score));
  const when = (s: Snapshot) => fmt.date(s.collection_completed_at || s.collection_started_at);
  const signed = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt.number(Math.abs(Math.round(d * 10) / 10))}`;

  return (
    <section className="card cs-since" aria-labelledby={headingId}>
      <p className="eyebrow">{t("board.since.eyebrow")}</p>
      <h2 id={headingId} className="cs-subhead">
        {t("board.since.title", { date: fmt.date(marker.at) })}
      </h2>
      <p className="muted small">
        <TransitionLink to={campaignHref(brandKey, marker.campaignId)}>
          {marker.headline} · {t("board.since.open")} →
        </TransitionLink>
      </p>

      {after ? (
        <>
          <div className="cs-since-scores">
            {before && (
              <div>
                <span className="eyebrow">{t("board.since.before")}</span>
                <strong>{score(before)}</strong>
                <span className="muted small">{when(before)}</span>
              </div>
            )}
            <div>
              <span className="eyebrow">{t("board.since.latest")}</span>
              <strong>{score(after)}</strong>
              <span className="muted small">{when(after)}</span>
            </div>
            {delta != null && (
              <span className="status-pill" data-tone={delta > 0 ? "ok" : delta < 0 ? "err" : "muted"}>
                {t("board.since.delta", { delta: signed(delta) })}
              </span>
            )}
          </div>
          {!before && <p className="muted small">{t("board.since.noBefore")}</p>}
          {before && !comparable && <p className="cs-note is-warn">{t("board.since.notComparable")}</p>}
          {verdict && (
            <p className="small">
              <strong>{t("board.since.verdictLabel")}:</strong> {t(verdict)}
            </p>
          )}
        </>
      ) : (
        <EmptyState compact icon="chart" as="p" title={t("board.since.noAfter")} body={t("board.since.noAfterBody")} />
      )}
    </section>
  );
}

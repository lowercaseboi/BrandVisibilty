import { useId } from "react";
import { campaignExportUrl } from "../../api/client";
import { CHANNEL_IDS } from "../../api/types";
import type { ChannelId, ChannelStatus, DistributionEvent } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { EmptyState } from "../EmptyState";
import { brandHref } from "../module/modules";
import { TransitionLink } from "../module/transition";
import { OUTCOME_LABEL, channelName, latestEventByChannel } from "./campaignModel";
import { PublishLog } from "./PublishLog";

const TONE: Record<DistributionEvent["outcome"], string> = { published: "ok", exported: "info", failed: "err", blocked: "warn" };

function resultLine(e: DistributionEvent): MessageKey | null {
  if (e.channel === "sandbox" && e.outcome === "published") return "board.campaign.result.simulated";
  if (e.outcome === "exported" && e.channel !== "whatsapp") return "board.campaign.result.inPack";
  return null;
}

/**
 * Step 4: the newest attempt per channel — a live link, the WhatsApp share link, "in your download
 * pack", or what went wrong with "Try again" — then the download, the "did it work?" next step and
 * the full attempt log (AC-10) folded away.
 */
export function ResultsStep({
  events,
  statuses,
  brandKey,
  campaignId,
  busy,
  onRetry,
}: {
  events: DistributionEvent[];
  statuses: ChannelStatus[];
  brandKey: string;
  campaignId: string;
  busy: boolean;
  onRetry: (channel: ChannelId) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const nextId = useId();
  const latest = latestEventByChannel(events);
  const rows = CHANNEL_IDS.map((ch) => latest.get(ch)).filter((e): e is DistributionEvent => !!e);

  return (
    <div className="cs-results">
      {rows.length === 0 ? (
        <EmptyState compact as="p" title={t("board.campaign.results.none")} />
      ) : (
        <ul className="cs-sends">
          {rows.map((e) => {
            const line = resultLine(e);
            const failed = e.outcome === "failed" || e.outcome === "blocked";
            return (
              <li key={e.channel} className="card cs-sendrow">
                <div className="field-head">
                  <h3 className="cs-subhead">{channelName(e.channel, statuses)}</h3>
                  <span className="status-pill" data-tone={TONE[e.outcome] ?? "muted"}>
                    {OUTCOME_LABEL[e.outcome] ? t(OUTCOME_LABEL[e.outcome]) : e.outcome}
                  </span>
                </div>
                <p className="muted small">
                  <time dateTime={e.at} title={e.at}>
                    {fmt.relativeTime(e.at) || e.at}
                  </time>
                  {line && <> · {t(line)}</>}
                </p>
                {failed && e.error && <p className="field-error">{t("board.campaign.result.why", { error: e.error })}</p>}
                <div className="cs-dest-actions">
                  {e.external_url && e.channel === "whatsapp" && (
                    <a className="btn btn-primary btn-small" href={e.external_url} target="_blank" rel="noreferrer">
                      {t("board.campaign.result.openWa")}
                    </a>
                  )}
                  {e.external_url && e.channel !== "whatsapp" && (
                    <a className="btn btn-secondary btn-small" href={e.external_url} target="_blank" rel="noreferrer">
                      {t("board.campaign.result.view")}
                    </a>
                  )}
                  {failed && (
                    <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => onRetry(e.channel)}>
                      {t("board.campaign.result.retry")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="cs-dest-actions">
        <a className="btn btn-secondary" href={campaignExportUrl(brandKey, campaignId)} download>
          {t("board.campaign.results.download")}
        </a>
      </div>

      <section className="card cs-next-card" aria-labelledby={nextId}>
        <p className="eyebrow">{t("board.campaign.results.nextEyebrow")}</p>
        <h3 id={nextId} className="cs-subhead">
          {t("board.campaign.results.next")}
        </h3>
        <p className="muted">{t("board.campaign.results.nextBody")}</p>
        <TransitionLink to={brandHref(brandKey, "analysis")} className="btn btn-primary btn-small">
          {t("board.campaign.results.nextCta")}
        </TransitionLink>
      </section>

      <details className="cs-log-wrap">
        <summary>{t("board.campaign.log.title")}</summary>
        <PublishLog events={events} statuses={statuses} busy={busy} canRetry={false} onRetry={onRetry} />
      </details>
    </div>
  );
}

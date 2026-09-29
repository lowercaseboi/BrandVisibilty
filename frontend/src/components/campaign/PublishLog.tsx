import { useId } from "react";
import type { ChannelId, ChannelStatus, DistributionEvent } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import { OUTCOME_LABEL, OUTCOME_TONE, channelName, eventsNewestFirst, latestEventByChannel } from "./campaignModel";

/**
 * AC-10: every publish/export attempt, success or failure, newest first — channel, outcome, time,
 * the post's link, and the error with a Retry on the channel's newest failed attempt.
 */
export function PublishLog({
  events,
  statuses,
  busy,
  canRetry,
  onRetry,
}: {
  events: DistributionEvent[];
  statuses: ChannelStatus[];
  busy: boolean;
  canRetry: boolean;
  onRetry: (channel: ChannelId) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const headingId = useId();
  const newest = latestEventByChannel(events);
  const list = eventsNewestFirst(events);

  return (
    <section className="card cs-panel" aria-labelledby={headingId}>
      <div className="cs-panel-head">
        <h2 id={headingId}>{t("board.campaign.log.title")}</h2>
        <p className="muted small">{t("board.campaign.log.intro")}</p>
      </div>
      {list.length === 0 ? (
        <p className="muted small">{t("board.campaign.log.empty")}</p>
      ) : (
        <ol className="cs-log">
          {list.map((e) => {
            const retry = (e.outcome === "failed" || e.outcome === "blocked") && newest.get(e.channel) === e;
            return (
              <li key={e.event_id} className={`cs-log-row tone-${OUTCOME_TONE[e.outcome] ?? "muted"}`}>
                <span className="cs-log-dot" aria-hidden="true" />
                <span className="cs-log-channel">{channelName(e.channel, statuses)}</span>
                <span className="cs-log-outcome">{OUTCOME_LABEL[e.outcome] ? t(OUTCOME_LABEL[e.outcome]) : e.outcome}</span>
                <time className="cs-log-time" dateTime={e.at} title={e.at}>
                  {fmt.relativeTime(e.at) || e.at}
                </time>
                <span className="cs-log-extra">
                  {e.external_url && (
                    <a href={e.external_url} target="_blank" rel="noreferrer">
                      {e.channel === "whatsapp" ? t("board.campaign.log.openWa") : t("board.campaign.log.open")}
                    </a>
                  )}
                  {e.error && <span className="cs-log-error">{e.error}</span>}
                  {retry && (
                    <button type="button" className="btn btn-secondary btn-small" disabled={busy || !canRetry} onClick={() => onRetry(e.channel)}>
                      {t("board.campaign.log.retry")}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

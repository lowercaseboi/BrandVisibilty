import { useId, useState } from "react";
import { campaignExportUrl } from "../../api/client";
import { CHANNEL_IDS } from "../../api/types";
import type { ChannelId, ChannelStatus, DistributionEvent } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { ChannelIcon } from "../accounts/ChannelIcon";
import { EmptyState } from "../EmptyState";
import { brandHref } from "../module/modules";
import { TransitionLink } from "../module/transition";
import { channelName, latestEventByChannel } from "./campaignModel";
import { PublishLog } from "./PublishLog";
import { blockReason, canRetry, eventNote, resultKind } from "./studioFlow";
import type { BlockReason, ResultKind } from "./studioFlow";

const TONE: Record<ResultKind, string> = {
  posted: "ok",
  practice: "info",
  whatsapp: "info",
  exported: "info",
  unconnected: "warn",
  failed: "err",
  blocked: "warn",
};

const KIND_LABEL: Record<ResultKind, MessageKey> = {
  posted: "board.campaign.result.kind.posted",
  practice: "board.campaign.result.kind.practice",
  whatsapp: "board.campaign.result.kind.whatsapp",
  exported: "board.campaign.result.kind.exported",
  unconnected: "board.campaign.result.kind.unconnected",
  failed: "board.campaign.result.kind.failed",
  blocked: "board.campaign.result.kind.blocked",
};

const BLOCK_LINE: Record<BlockReason, MessageKey> = {
  token_unset: "board.campaign.result.block.token_unset",
  token_missing: "board.campaign.result.block.token_missing",
  not_approved: "board.campaign.result.block.not_approved",
  not_connected: "board.campaign.result.block.not_connected",
  switched_off: "board.campaign.result.block.switched_off",
  other: "board.campaign.result.block.other",
};

/**
 * Step 4: the newest attempt per channel, saying exactly what happened — Posted (with its link),
 * a practice run, ready / opened in WhatsApp, exported, Failed with the reason and "Try again", or
 * Blocked with the reason (e.g. no ADMIN_TOKEN) — then the download, the "did it work?" next step
 * and the full attempt log (AC-10) folded away.
 */
export function ResultsStep({
  events,
  statuses,
  brandKey,
  campaignId,
  connectHref,
  busy,
  onRetry,
}: {
  events: DistributionEvent[];
  statuses: ChannelStatus[];
  brandKey: string;
  campaignId: string;
  connectHref: string;
  busy: boolean;
  onRetry: (channel: ChannelId) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const nextId = useId();
  // WhatsApp can't be posted to: the user opens it and taps send. Remember that they opened it.
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const latest = latestEventByChannel(events);
  const rows = CHANNEL_IDS.map((ch) => latest.get(ch)).filter((e): e is DistributionEvent => !!e);

  return (
    <div className="cs-results">
      {rows.length === 0 ? (
        <EmptyState compact as="p" title={t("board.campaign.results.none")} />
      ) : (
        <ul className="cs-sends">
          {rows.map((e) => {
            const kind = resultKind(e);
            // Only a real web link is offered (the sandbox returns a sandbox:// id, not a page).
            const href = e.external_url && /^https?:\/\//i.test(e.external_url) ? e.external_url : null;
            const name = channelName(e.channel, statuses);
            const waOpened = kind === "whatsapp" && opened.has(e.event_id);
            const reason = kind === "blocked" ? blockReason(e.error) : null;
            let line: string;
            if (kind === "posted") line = href ? t("board.campaign.result.line.posted", { channel: name }) : t("board.campaign.result.line.postedNoLink");
            else if (kind === "whatsapp") line = waOpened ? t("board.campaign.result.line.whatsappOpened") : t("board.campaign.result.line.whatsapp");
            else if (kind === "unconnected") line = t("board.campaign.result.line.unconnected", { channel: name });
            else if (kind === "failed") line = t("board.campaign.result.line.failed", { error: e.error || "—" });
            else if (reason) line = t(BLOCK_LINE[reason], { channel: name, error: e.error || "—" });
            else line = t(kind === "practice" ? "board.campaign.result.line.practice" : "board.campaign.result.line.exported");
            const retry = canRetry(e);
            return (
              <li key={e.channel} className="card cs-sendrow" data-kind={kind}>
                <div className="field-head">
                  <h3 className="cs-subhead cs-sendrow-name">
                    <ChannelIcon channel={e.channel} size={18} />
                    {name}
                  </h3>
                  <span className="status-pill" data-tone={TONE[kind]}>
                    {t(waOpened ? "board.campaign.result.kind.whatsappOpened" : KIND_LABEL[kind])}
                  </span>
                </div>
                <p className={kind === "failed" || kind === "blocked" ? "cs-result-line is-bad" : "cs-result-line"} role={kind === "failed" || kind === "blocked" ? "alert" : undefined}>
                  {line}
                </p>
                {/* The server's note, unless the line above already says the same in plain words. */}
                {kind !== "unconnected" && kind !== "whatsapp" && eventNote(e) && eventNote(e) !== e.error && <p className="muted small">{eventNote(e)}</p>}
                <p className="muted small">
                  <time dateTime={e.at} title={e.at}>
                    {fmt.relativeTime(e.at) || e.at}
                  </time>
                </p>
                <div className="cs-dest-actions">
                  {href && e.channel === "whatsapp" && (
                    <a
                      className={`btn btn-small ${waOpened ? "btn-secondary" : "btn-primary"}`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpened((s) => new Set(s).add(e.event_id))}
                    >
                      {t("board.campaign.result.openWa")}
                    </a>
                  )}
                  {href && e.channel !== "whatsapp" && (
                    <a className="btn btn-secondary btn-small" href={href} target="_blank" rel="noreferrer">
                      {t("board.campaign.result.view")}
                    </a>
                  )}
                  {(kind === "unconnected" || reason === "not_connected") && (
                    <TransitionLink to={connectHref} className="btn btn-secondary btn-small">
                      {t("board.campaign.result.connect", { channel: name })}
                    </TransitionLink>
                  )}
                  {retry && (
                    <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => onRetry(e.channel)}>
                      {reason === "token_missing" ? t("board.campaign.result.retryToken") : t("board.campaign.result.retry")}
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

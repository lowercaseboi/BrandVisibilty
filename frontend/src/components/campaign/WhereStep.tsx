import { useId } from "react";
import type { ChannelId } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { ChannelIcon } from "../accounts/ChannelIcon";
import { EmptyState } from "../EmptyState";
import { TransitionLink } from "../module/transition";
import { rowState } from "./studioFlow";
import type { Destination, DestinationBlock, DestinationKind, Picks, RowState } from "./studioFlow";

const KIND_PILL: Record<DestinationKind, { key: MessageKey; tone: string }> = {
  post: { key: "board.campaign.mode.connected", tone: "ok" },
  unconnected: { key: "board.campaign.mode.export_only", tone: "warn" },
  simulate: { key: "board.campaign.mode.practice", tone: "info" },
  share: { key: "board.campaign.mode.share", tone: "info" },
  download: { key: "board.campaign.mode.download", tone: "muted" },
  off: { key: "board.campaign.mode.disabled", tone: "muted" },
};

const BLOCK_LINE: Record<DestinationBlock, MessageKey> = {
  disabled: "board.campaign.block.disabled",
  no_variant: "board.campaign.block.no_variant",
  variant_off: "board.campaign.block.variant_off",
  has_issues: "board.campaign.block.has_issues",
  no_quota: "board.campaign.block.no_quota",
};

/** The one plain line of what ticking this row will do. */
function lineFor(d: Destination, state: RowState, t: ReturnType<typeof useT>): string {
  if (d.block) return t(BLOCK_LINE[d.block]);
  switch (d.kind) {
    case "post":
      return d.account ? t("board.campaign.where.post", { name: d.account }) : t("board.campaign.where.postChannel", { channel: d.status.label });
    case "share":
      return t("board.campaign.where.share");
    case "download":
      return t("board.campaign.where.download");
    case "simulate":
      return t("board.campaign.where.simulate");
    case "off":
      return t("board.campaign.where.off");
    default:
      return state === "export" ? t("board.campaign.where.exportLine") : t("board.campaign.where.unconnected");
  }
}

/**
 * Step 2: a checklist of every channel — tick, icon + name, this brand's connection ("as <account>")
 * and one line of what will happen. Ticking a channel that isn't connected never turns it into an
 * export silently: the row asks "Connect <platform> in Details" (returning here, ticked) or
 * "Export it instead".
 */
export function WhereStep({
  dests,
  picks,
  connectHref,
  loading,
  error,
  joined,
  onRetry,
  onToggle,
  onExportInstead,
  onSelectAll,
  onSelectNone,
  onFix,
}: {
  dests: Destination[];
  picks: Picks;
  /** Details → Connected accounts, with ?return= back to this step. */
  connectHref: string;
  loading: boolean;
  error: boolean;
  /** Just back from Details with this channel connected (or still not). */
  joined: { channel: ChannelId; ok: boolean } | null;
  onRetry: () => void;
  onToggle: (channel: ChannelId, on: boolean) => void;
  onExportInstead: (channel: ChannelId, exportIt: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onFix: (channel: ChannelId) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const listId = useId();

  if (error)
    return (
      <EmptyState
        compact
        icon="error"
        tone="error"
        role="alert"
        as="p"
        title={t("board.campaign.channels.error")}
        primary={
          <button type="button" className="btn btn-secondary btn-small" onClick={onRetry}>
            {t("board.offline.retry")}
          </button>
        }
      />
    );
  if (loading) return <p className="status">{t("board.campaign.where.loading")}</p>;
  if (dests.length === 0) return <EmptyState compact as="p" title={t("board.campaign.channels.none")} />;

  const joinedName = joined ? (dests.find((d) => d.channel === joined.channel)?.status.label ?? joined.channel) : "";

  return (
    <div className="cs-where">
      {joined && (
        <p className={`cs-note${joined.ok ? " is-ok" : " is-warn"}`} role="status">
          {joined.ok ? t("board.campaign.where.joined", { channel: joinedName }) : t("board.campaign.where.joinedNot", { channel: joinedName })}
        </p>
      )}
      <div className="cs-picks-tools" role="group" aria-labelledby={listId}>
        <span id={listId} className="eyebrow">
          {t("board.campaign.where.listLabel")}
        </span>
        <button type="button" className="btn btn-ghost btn-small" onClick={onSelectAll}>
          {t("board.campaign.where.selectAll")}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onSelectNone}>
          {t("board.campaign.where.selectNone")}
        </button>
      </div>
      <ul className="cs-picks" aria-labelledby={listId}>
        {dests.map((d) => {
          const state = rowState(d, picks);
          const on = state !== "off" && state !== "blocked";
          const pill = KIND_PILL[d.kind];
          const inputId = `${listId}-${d.channel}`;
          const lineId = `${inputId}-line`;
          return (
            <li key={d.channel} className="cs-pick" data-state={state}>
              <div className="cs-pick-main">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={on}
                  disabled={!!d.block}
                  aria-describedby={lineId}
                  onChange={(e) => onToggle(d.channel, e.target.checked)}
                />
                <span className="cs-pick-icon" aria-hidden="true">
                  <ChannelIcon channel={d.channel} size={20} />
                </span>
                <label htmlFor={inputId} className="cs-pick-name">
                  {d.status.label}
                </label>
                <span className="cs-pick-status">
                  <span className="status-pill" data-tone={d.block ? "muted" : pill.tone}>
                    {t(pill.key)}
                  </span>
                  {d.account && <span className="muted small cs-pick-as">{t("board.campaign.where.as", { name: d.account })}</span>}
                </span>
              </div>
              <p id={lineId} className={state === "connect" ? "sr-only" : "cs-pick-line"}>
                {lineFor(d, state, t)}
                {d.kind === "post" && !d.block && d.status.quota_remaining != null && (
                  <span className="muted"> · {t("board.campaign.where.quota", { n: fmt.number(d.status.quota_remaining) })}</span>
                )}
              </p>
              {(d.block === "has_issues" || d.block === "variant_off") && (
                <div className="cs-pick-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => onFix(d.channel)}>
                    {t("board.campaign.where.fix")}
                  </button>
                </div>
              )}
              {state === "connect" && (
                <div className="cs-pick-prompt" role="group" aria-label={t("board.campaign.where.connectPrompt", { channel: d.status.label })}>
                  <p>{t("board.campaign.where.connectPrompt", { channel: d.status.label })}</p>
                  <div className="cs-pick-actions">
                    <TransitionLink to={connectHref} className="btn btn-primary btn-small">
                      {t("board.campaign.where.connect", { channel: d.status.label })} <span aria-hidden="true">→</span>
                    </TransitionLink>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => onExportInstead(d.channel, true)}>
                      {t("board.campaign.where.exportInstead")}
                    </button>
                  </div>
                </div>
              )}
              {state === "export" && (
                <div className="cs-pick-actions">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => onExportInstead(d.channel, false)}>
                    {t("board.campaign.where.connectInstead")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="cs-note">{t("board.campaign.where.waNote")}</p>
    </div>
  );
}


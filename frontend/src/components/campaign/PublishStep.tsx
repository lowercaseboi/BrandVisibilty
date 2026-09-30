import type { Asset, ChannelId } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { EmptyState } from "../EmptyState";
import type { Destination, DestinationKind } from "./studioFlow";
import { SendPreview } from "./WhereStep";

export type SendState = "waiting" | "working" | "done" | "failed" | "skipped";

const EFFECT: Record<DestinationKind, MessageKey> = {
  post: "board.campaign.effect.post",
  unconnected: "board.campaign.effect.unconnected",
  simulate: "board.campaign.effect.simulate",
  share: "board.campaign.effect.share",
  download: "board.campaign.effect.download",
  off: "board.campaign.effect.off",
};

const STATE_LABEL: Record<SendState, MessageKey> = {
  waiting: "board.campaign.progress.waiting",
  working: "board.campaign.progress.working",
  done: "board.campaign.progress.done",
  failed: "board.campaign.progress.failed",
  skipped: "board.campaign.progress.skipped",
};

const STATE_TONE: Record<SendState, string> = { waiting: "muted", working: "info", done: "ok", failed: "err", skipped: "muted" };

/**
 * Step 3: exactly what goes where, then one confirm in the action bar ("Looks good — approve and
 * publish"). While it runs, each channel shows its own progress (the Studio sends them one by one).
 */
export function PublishStep({
  sends,
  assets,
  approvedAt,
  progress,
  approving,
}: {
  sends: Destination[];
  assets: Asset[];
  /** Set while an approval stands (then the button only publishes). */
  approvedAt: string | null;
  progress: Partial<Record<ChannelId, SendState>>;
  approving: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  if (sends.length === 0) return <EmptyState compact as="p" title={t("board.campaign.publish.nothing")} />;
  return (
    <div className="cs-confirm">
      <p className="cs-note" role="status">
        {approving && <span className="cs-spinner" aria-hidden="true" />}
        {approving
          ? t("board.campaign.progress.approving")
          : approvedAt
            ? t("board.campaign.publish.approvedAt", { when: fmt.relativeTime(approvedAt) || approvedAt })
            : t("board.campaign.publish.notYet")}
      </p>
      <ol className="cs-sends">
        {sends.map((d) => {
          const state = progress[d.channel];
          return (
            <li key={d.channel} className="card cs-sendrow">
              <div className="field-head">
                <h3 className="cs-subhead">{d.status.label}</h3>
                {state ? (
                  <span className="status-pill" data-tone={STATE_TONE[state]} role="status">
                    {state === "working" && <span className="cs-spinner" aria-hidden="true" />}
                    {t(STATE_LABEL[state])}
                  </span>
                ) : (
                  <span className="muted small">{t(EFFECT[d.kind], { channel: d.status.label })}</span>
                )}
              </div>
              <SendPreview d={d} assets={assets} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

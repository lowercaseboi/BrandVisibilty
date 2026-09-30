import { mediaUrl } from "../../api/client";
import type { PreflightPlan } from "../../api/client";
import type { Asset, ChannelId } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { ChannelIcon } from "../accounts/ChannelIcon";
import { EmptyState } from "../EmptyState";
import { assetForVariant, charCount, composePost } from "./campaignModel";
import { planState } from "./studioFlow";
import type { DestinationKind, Sendable } from "./studioFlow";

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

/** Short "what will be sent": the image it posts and the start of the text. */
function SendPreview({ d, assets }: { d: Sendable; assets: Asset[] }) {
  const t = useT();
  const fmt = useFormat();
  const asset = assetForVariant(assets, d.variant);
  const post = composePost(d.variant);
  return (
    <div className="cs-send">
      {asset ? <img src={mediaUrl(asset.path, asset.created_at)} alt={d.variant.alt_text ?? ""} /> : <span className="cs-send-noimg" aria-hidden="true" />}
      <div>
        <p className="cs-send-text">{post || "—"}</p>
        <p className="muted small">
          {t("board.campaign.where.chars", { n: fmt.number(charCount(d.channel, post)) })} ·{" "}
          {asset ? t("board.campaign.where.withImage") : t("board.campaign.where.noImage")}
        </p>
      </div>
    </div>
  );
}

/**
 * Step 3: exactly what goes where, then one confirm in the action bar ("Approve & publish to 3
 * channels"). While it runs, each channel shows its own progress (the Studio sends them one by one).
 */
export function PublishStep({
  sends,
  assets,
  approvedAt,
  progress,
  plans,
  approving,
  tokenAhead,
}: {
  sends: Sendable[];
  assets: Asset[];
  /** Set while an approval stands (then the button only publishes). */
  approvedAt: string | null;
  progress: Partial<Record<ChannelId, SendState>>;
  /** The server's dry run per channel (null: not loaded, or an older backend). */
  plans: Map<ChannelId, PreflightPlan> | null;
  approving: boolean;
  /** Channels that will ask for the admin token when publishing starts (none stored yet). */
  tokenAhead: string[];
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
      {tokenAhead.length > 0 && (
        <p className="cs-note is-warn">
          {t("board.campaign.publish.tokenAhead", { names: tokenAhead.join(", ") })}
        </p>
      )}
      <ol className="cs-sends">
        {sends.map((d) => {
          const state = progress[d.channel];
          const plan = plans?.get(d.channel);
          const ps = planState(plan);
          const effect = d.kind === "post" && d.account ? t("board.campaign.where.post", { name: d.account }) : t(EFFECT[d.kind], { channel: d.status.label });
          return (
            <li key={d.channel} className="card cs-sendrow" data-plan={ps ?? undefined}>
              <div className="field-head">
                <h3 className="cs-subhead cs-sendrow-name">
                  <ChannelIcon channel={d.channel} size={18} />
                  {d.status.label}
                </h3>
                {state ? (
                  <span className="status-pill" data-tone={STATE_TONE[state]}>
                    {state === "working" && <span className="cs-spinner" aria-hidden="true" />}
                    {t(STATE_LABEL[state])}
                  </span>
                ) : ps === "blocked" ? (
                  <span className="status-pill" data-tone="warn">
                    {t("board.campaign.publish.wontSend")}
                  </span>
                ) : (
                  <span className="muted small">{effect}</span>
                )}
              </div>
              {ps === "blocked" && plan?.detail && (
                <p className="cs-result-line is-bad" role="note">
                  {plan.detail}
                </p>
              )}
              {ps === "approve" && <p className="muted small">{t("board.campaign.publish.approveFirst")}</p>}
              {(ps === "publish" || ps === "export") && plan?.detail && <p className="muted small">{plan.detail}</p>}
              <SendPreview d={d} assets={assets} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

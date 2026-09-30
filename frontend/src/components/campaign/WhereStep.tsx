import { mediaUrl } from "../../api/client";
import { EmptyState } from "../EmptyState";
import type { Asset, ChannelId } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { brandHref } from "../module/modules";
import { TransitionLink } from "../module/transition";
import { assetForVariant, charCount, composePost } from "./campaignModel";
import type { Destination, DestinationKind } from "./studioFlow";

const KIND_PILL: Record<DestinationKind, { key: MessageKey; tone: string }> = {
  post: { key: "board.campaign.mode.connected", tone: "ok" },
  unconnected: { key: "board.campaign.mode.export_only", tone: "warn" },
  simulate: { key: "board.campaign.mode.practice", tone: "info" },
  share: { key: "board.campaign.mode.share", tone: "info" },
  download: { key: "board.campaign.mode.download", tone: "muted" },
  off: { key: "board.campaign.mode.disabled", tone: "muted" },
};

const KIND_LINE: Record<DestinationKind, MessageKey> = {
  post: "board.campaign.where.post",
  unconnected: "board.campaign.where.unconnected",
  simulate: "board.campaign.where.simulate",
  share: "board.campaign.where.share",
  download: "board.campaign.where.download",
  off: "board.campaign.where.off",
};

const BLOCK_LINE: Record<NonNullable<Destination["block"]>, MessageKey> = {
  disabled: "board.campaign.block.disabled",
  variant_off: "board.campaign.block.variant_off",
  has_issues: "board.campaign.block.has_issues",
  no_quota: "board.campaign.block.no_quota",
};

/** Short "what will be sent": the image it posts and the start of the text. */
export function SendPreview({ d, assets }: { d: Destination; assets: Asset[] }) {
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
 * Step 2: every channel this campaign has copy for, as this brand would post to it — its
 * connection, exactly what will be sent, and a choice. An unconnected channel offers "Connect"
 * (Details → Connected accounts, returning here) or "Export instead"; WhatsApp and the export
 * pack never need an account.
 */
export function WhereStep({
  dests,
  picked,
  assets,
  brandKey,
  returnTo,
  loading,
  error,
  onRetry,
  onToggle,
  onFix,
}: {
  dests: Destination[];
  picked: ChannelId[];
  assets: Asset[];
  brandKey: string;
  /** Studio path (with ?step=where) the Details page sends the user back to after connecting. */
  returnTo: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onToggle: (channel: ChannelId, on: boolean) => void;
  onFix: (channel: ChannelId) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const connectHref = `${brandHref(brandKey, "details")}?return=${encodeURIComponent(returnTo)}#accounts`;

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

  return (
    <ul className="cs-dests">
      {dests.map((d) => {
        const on = d.block === null && picked.includes(d.channel);
        const pill = KIND_PILL[d.kind];
        return (
          <li key={d.channel} className={`card cs-dest${on ? " is-on" : ""}${d.block ? " is-blocked" : ""}`}>
            <div className="field-head">
              <h3 className="cs-subhead">{d.status.label}</h3>
              <span className="status-pill" data-tone={pill.tone}>
                {t(pill.key)}
              </span>
            </div>
            <p className="cs-dest-line">{t(KIND_LINE[d.kind])}</p>
            {/* The server's detail is setup advice for an unconnected channel; for a connected one it
                says which account posts, which is worth showing. */}
            {d.kind === "post" && (d.status.detail || d.status.quota_remaining != null) && (
              <p className="muted small">
                {d.status.detail}
                {d.status.detail && d.status.quota_remaining != null && " · "}
                {d.status.quota_remaining != null && t("board.campaign.where.quota", { n: fmt.number(d.status.quota_remaining) })}
              </p>
            )}
            <SendPreview d={d} assets={assets} />
            <div className="cs-dest-actions">
              {d.block ? (
                <>
                  <span className="field-error">{t(BLOCK_LINE[d.block])}</span>
                  {(d.block === "has_issues" || d.block === "variant_off") && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => onFix(d.channel)}>
                      {t("board.campaign.where.fix")}
                    </button>
                  )}
                </>
              ) : d.kind === "unconnected" ? (
                <>
                  <TransitionLink to={connectHref} className="btn btn-primary btn-small">
                    {t("board.campaign.where.connect", { channel: d.status.label })}
                  </TransitionLink>
                  <button type="button" className="btn btn-secondary btn-small" aria-pressed={on} onClick={() => onToggle(d.channel, !on)}>
                    {on ? `✓ ${t("board.campaign.where.exporting")}` : t("board.campaign.where.exportInstead")}
                  </button>
                </>
              ) : (
                <label className="cs-check">
                  <input type="checkbox" checked={on} onChange={(e) => onToggle(d.channel, e.target.checked)} />
                  {t("board.campaign.where.include", { channel: d.status.label })}
                </label>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

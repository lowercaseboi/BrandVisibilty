import { useEffect, useId, useRef } from "react";
import { mediaUrl } from "../../api/client";
import type { Asset, ChannelId } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { BLOCK_LABEL, MODE_LABEL, assetForVariant, composePost } from "./campaignModel";
import type { ChannelOption } from "./campaignModel";

const EFFECT_LABEL: Record<ChannelOption["effect"], MessageKey> = {
  post: "board.campaign.channels.effectPost",
  export: "board.campaign.channels.effectExport",
  simulate: "board.campaign.channels.effectSimulate",
};

/** Every channel adapter with its mode, detail and quota, and a tick box for the next publish. */
export function ChannelBar({
  options,
  selected,
  onToggle,
}: {
  options: ChannelOption[];
  selected: ChannelId[];
  onToggle: (channel: ChannelId, on: boolean) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  if (options.length === 0) return <p className="muted small">{t("board.campaign.channels.none")}</p>;
  return (
    <ul className="cs-channels">
      {options.map((o) => {
        const id = o.status.channel;
        const checked = o.block === null && selected.includes(id);
        return (
          <li key={id} className={`cs-channel cs-mode-${o.status.mode}${o.block ? " is-blocked" : ""}`}>
            <label className="cs-channel-main">
              <input type="checkbox" checked={checked} disabled={o.block !== null} onChange={(e) => onToggle(id, e.target.checked)} />
              <span className="cs-channel-name">{o.status.label}</span>
              <span className={`cs-mode cs-mode-${o.status.mode}`}>{t(MODE_LABEL[o.status.mode])}</span>
              {id === "sandbox" && <span className="cs-mode cs-mode-sim">{t("board.campaign.badge.simulated")}</span>}
            </label>
            <span className="cs-channel-detail">
              {o.status.detail && <span>{o.status.detail}</span>}
              {o.status.quota_remaining != null && (
                <span>{t("board.campaign.channels.quota", { n: fmt.number(o.status.quota_remaining) })}</span>
              )}
              <span className="muted">{o.block ? t(BLOCK_LABEL[o.block]) : t(EFFECT_LABEL[o.effect])}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Confirm step: every selected channel and exactly what it will send. */
export function PublishDialog({
  options,
  assets,
  onConfirm,
  onClose,
}: {
  options: ChannelOption[];
  assets: Asset[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
  }, []);

  return (
    <dialog
      ref={ref}
      className="cs-dialog cs-dialog-wide card"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="cs-dialog-body">
        <h2 id={titleId}>{t.n("board.campaign.publish.confirmTitle", options.length)}</h2>
        <p className="muted small">{t("board.campaign.publish.confirmIntro")}</p>
        <ul className="cs-confirm-list">
          {options.map((o) => {
            const asset = o.variant ? assetForVariant(assets, o.variant) : null;
            return (
              <li key={o.status.channel}>
                <div className="cs-confirm-head">
                  <strong>{o.status.label}</strong>
                  <span className={`cs-mode cs-mode-${o.status.mode}`}>{t(EFFECT_LABEL[o.effect])}</span>
                </div>
                {o.variant ? (
                  <div className="cs-confirm-body">
                    {asset && <img src={mediaUrl(asset.path, asset.created_at)} alt={o.variant.alt_text ?? ""} />}
                    <pre>{composePost(o.variant)}</pre>
                  </div>
                ) : (
                  <p className="muted small">{t("board.campaign.publish.exportAll")}</p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="cs-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("board.campaign.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {t.n("board.campaign.publish.confirm", options.length)}
          </button>
        </div>
      </div>
    </dialog>
  );
}

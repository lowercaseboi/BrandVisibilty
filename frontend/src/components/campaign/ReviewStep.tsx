import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { Asset, ChannelId, ChannelStatus, Deliverable, DeliverablePatch, RegenerateImageRequest, Variant, VariantPatch } from "../../api/types";
import { useT } from "../../i18n";
import { CHANNEL_FORMATS, assetForVariant, channelName } from "./campaignModel";
import { ImageStrip } from "./ImageStrip";
import { PlatformPreview } from "./Previews";
import { blockingCount } from "./studioFlow";
import type { SaveState } from "./useDraftSaver";
import { VariantEditor } from "./VariantEditor";
import { WebsiteText } from "./WebsiteText";

export type ReviewTab = ChannelId | "web";

export interface ReviewStepProps {
  variants: Variant[];
  assets: Asset[];
  deliverables: Deliverable[];
  statuses: ChannelStatus[];
  brandName: string;
  brandKey: string;
  tab: ReviewTab;
  onTab: (tab: ReviewTab) => void;
  variantStates: Record<string, SaveState>;
  deliverableStates: Record<string, SaveState>;
  locked: boolean;
  approved: boolean;
  regenerating: boolean;
  onEditVariant: (channel: ChannelId, patch: VariantPatch) => void;
  onEditDeliverable: (index: number, patch: DeliverablePatch) => void;
  onRegenerate: (req: RegenerateImageRequest, channel: ChannelId) => void;
}

/**
 * Step 1: one channel in focus — a large look-alike preview beside its editor and image strip —
 * with channel tabs that show ✓ or ⚠ (things to fix), and a "Website text" tab for the kit's
 * deliverables. Tabs follow the WAI-ARIA tabs pattern (arrow keys, Home / End).
 */
export function ReviewStep(p: ReviewStepProps) {
  const t = useT();
  const baseId = useId();
  const tabRefs = useRef(new Map<ReviewTab, HTMLButtonElement>());
  const tabs: ReviewTab[] = [...p.variants.map((v) => v.channel), ...(p.deliverables.length ? (["web"] as const) : [])];
  const tab = tabs.includes(p.tab) ? p.tab : tabs[0];
  const active = tab === "web" ? null : (p.variants.find((v) => v.channel === tab) ?? null);
  const idx = tabs.indexOf(tab);
  const next = tabs[idx + 1] ?? null;
  const tabId = (x: ReviewTab) => `${baseId}-tab-${x}`;
  const panelId = `${baseId}-panel`;

  const go = (x: ReviewTab, focus = false) => {
    p.onTab(x);
    if (focus) tabRefs.current.get(x)?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    go(tabs[(moves[e.key] + tabs.length) % tabs.length], true);
  };

  const label = (x: ReviewTab) => (x === "web" ? t("board.campaign.tab.website") : channelName(x, p.statuses));
  const activeAsset = active ? assetForVariant(p.assets, active) : null;

  return (
    <div className="cs-review">
      <div className="tabs" role="tablist" aria-label={t("board.campaign.tabs")} onKeyDown={onKey}>
        {tabs.map((x) => {
          const v = x === "web" ? null : p.variants.find((y) => y.channel === x);
          const n = v ? blockingCount(v) : 0;
          return (
            <button
              key={x}
              ref={(el) => {
                if (el) tabRefs.current.set(x, el);
                else tabRefs.current.delete(x);
              }}
              id={tabId(x)}
              type="button"
              role="tab"
              className="tab"
              aria-selected={x === tab}
              aria-controls={panelId}
              tabIndex={x === tab ? 0 : -1}
              onClick={() => go(x)}
            >
              {label(x)}
              {v && !v.enabled && <span className="tab-mark is-off">{t("board.campaign.tab.off")}</span>}
              {v?.enabled && n > 0 && (
                <span className="tab-mark is-warn">
                  <span aria-hidden="true">⚠ {n}</span>
                  <span className="sr-only">{t.n("board.campaign.tab.issues", n)}</span>
                </span>
              )}
              {v?.enabled && n === 0 && (
                <span className="tab-mark is-ok">
                  <span aria-hidden="true">✓</span>
                  <span className="sr-only">{t("board.campaign.tab.ok")}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="cs-panel">
        {active ? (
          <div className="cs-focus">
            <div className="cs-preview">
              <p className="eyebrow">{t("board.campaign.preview.title", { channel: label(active.channel) })}</p>
              <div className={active.enabled ? "" : "is-off"}>
                <PlatformPreview
                  variant={active}
                  asset={activeAsset}
                  assets={p.assets}
                  brandName={p.brandName}
                  handle={p.brandKey.replace(/[^a-z0-9_]/gi, "").toLowerCase()}
                  onPickAsset={p.locked ? undefined : (assetId) => p.onEditVariant(active.channel, { asset_id: assetId })}
                />
              </div>
            </div>
            <div className="cs-side">
              {p.approved && <p className="cs-note is-warn">{t("board.campaign.reapprove")}</p>}
              <div className="card">
                <VariantEditor
                  variant={active}
                  statuses={p.statuses}
                  saveState={p.variantStates[active.channel]}
                  locked={p.locked}
                  onChange={(patch) => p.onEditVariant(active.channel, patch)}
                />
              </div>
              <div className="card">
                <ImageStrip
                  key={active.channel}
                  assets={p.assets}
                  activeAssetId={activeAsset?.asset_id ?? null}
                  channelName={label(active.channel)}
                  formats={CHANNEL_FORMATS[active.channel] ?? ["square"]}
                  busy={p.regenerating}
                  disabled={p.locked}
                  onRegenerate={(req) => p.onRegenerate(req, active.channel)}
                  onUse={(assetId) => p.onEditVariant(active.channel, { asset_id: assetId })}
                />
              </div>
              {next && (
                <button type="button" className="btn btn-secondary cs-next" onClick={() => go(next, true)}>
                  {t("board.campaign.nextChannel", { channel: label(next) })} <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <WebsiteText deliverables={p.deliverables} states={p.deliverableStates} disabled={p.locked} onChange={p.onEditDeliverable} />
        )}
      </div>
    </div>
  );
}

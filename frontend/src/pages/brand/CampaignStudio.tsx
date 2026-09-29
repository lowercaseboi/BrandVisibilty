import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ApiError,
  approveCampaign,
  campaignExportUrl,
  createCampaign,
  deleteCampaign,
  listChannels,
  patchVariant,
  publishCampaign,
  regenerateImage,
  updateDeliverable,
} from "../../api/client";
import { CHANNEL_IDS } from "../../api/types";
import type {
  Campaign,
  ChannelId,
  ChannelStatus,
  DeliverablePatch,
  RegenerateImageRequest,
  Variant,
  VariantPatch,
} from "../../api/types";
import { campaignHref } from "../../components/campaign/CampaignIndex";
import {
  CHANNEL_FORMATS,
  assetForVariant,
  blockingIssues,
  canApprove,
  channelName,
  channelOptions,
  defaultSelection,
  hashtagsForServer,
  isApproved,
  statusView,
  TOKENLESS_CHANNELS,
  usesTemplateImages,
  whatsappShareUrl,
} from "../../components/campaign/campaignModel";
import { isTokenUnsetError } from "../../components/campaign/adminToken";
import { DeliverablesPanel } from "../../components/campaign/DeliverablesPanel";
import { ImagePanel } from "../../components/campaign/ImagePanel";
import { PlatformPreview } from "../../components/campaign/Previews";
import { ChannelBar, PublishDialog } from "../../components/campaign/PublishPanel";
import { PublishLog } from "../../components/campaign/PublishLog";
import { useAdminGate } from "../../components/campaign/useAdminGate";
import { useCampaign } from "../../components/campaign/useCampaign";
import { useDraftSaver } from "../../components/campaign/useDraftSaver";
import { VariantEditor } from "../../components/campaign/VariantEditor";
import { actionTitle } from "../../components/dashboard/actions";
import { gapTypeText, humanizeId, parseSuggestionKey } from "../../components/dashboard/helpers";
import { ModuleShell } from "../../components/module/ModuleShell";
import { brandHref, gapsHref } from "../../components/module/modules";
import { TransitionLink, useTransitionNavigate } from "../../components/module/transition";
import { toast } from "../../components/Toaster";
import { useFormat, useT } from "../../i18n";
import { useBrandData } from "./BrandContext";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const channelOrder = (a: Variant, b: Variant) => CHANNEL_IDS.indexOf(a.channel) - CHANNEL_IDS.indexOf(b.channel);

/**
 * Campaign Studio (PRD §11.5 / AC-10): a recommendation's campaign — live look-alike previews per
 * app, per-channel copy editors with limits, images, text deliverables, then Approve → Publish with
 * every attempt logged. The header traces back to the recommendation and its gap (AC-7).
 */
export function CampaignStudio() {
  const t = useT();
  const { campaignId = "" } = useParams();
  const { brandKey } = useBrandData();
  const { campaign, job, error, loading, setCampaign } = useCampaign(brandKey, campaignId);

  let body;
  if (loading && !campaign) body = <p className="status">{t("board.campaign.loading")}</p>;
  else if (!campaign)
    body = (
      <div className="card board-empty-state">
        <h2>{t("board.campaign.notFound")}</h2>
        <p className="muted">{error instanceof ApiError && error.status !== 404 ? errorText(error) : t("board.campaign.notFoundBody")}</p>
      </div>
    );
  else body = <Studio key={campaign.campaign_id} campaign={campaign} job={job} setCampaign={setCampaign} />;

  return (
    <ModuleShell id="recommendations">
      <p className="cs-back">
        <TransitionLink to={brandHref(brandKey, "recommendations")}>← {t("board.campaign.back")}</TransitionLink>
      </p>
      {body}
    </ModuleShell>
  );
}

function Studio({
  campaign,
  job,
  setCampaign,
}: {
  campaign: Campaign;
  job: ReturnType<typeof useCampaign>["job"];
  setCampaign: (c: Campaign) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const go = useTransitionNavigate();
  const { brandKey, brandName, latest, history } = useBrandData();
  const { runAdmin, dialog } = useAdminGate();
  const cid = campaign.campaign_id;

  // ---- channels (adapter status) ----
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [channelsError, setChannelsError] = useState(false);
  const loadChannels = useCallback(() => {
    listChannels()
      .then((c) => {
        setChannels(c);
        setChannelsError(false);
      })
      .catch(() => setChannelsError(true));
  }, []);
  useEffect(loadChannels, [loadChannels]);
  const statuses = useMemo(() => channels ?? [], [channels]);

  // ---- autosave (variants per channel, deliverables per index) ----
  const variantSaver = useDraftSaver<VariantPatch>(
    useCallback(
      async (channel: string, patch: VariantPatch) => setCampaign(await patchVariant(brandKey, cid, channel as ChannelId, patch)),
      [brandKey, cid, setCampaign],
    ),
  );
  const deliverableSaver = useDraftSaver<DeliverablePatch>(
    useCallback(
      async (key: string, patch: DeliverablePatch) => setCampaign(await updateDeliverable(brandKey, cid, Number(key.slice(1)), patch)),
      [brandKey, cid, setCampaign],
    ),
  );

  // What the user sees: the server copy with unsaved edits on top.
  const variants = useMemo(
    () => campaign.variants.map((v) => ({ ...v, ...(variantSaver.drafts[v.channel] ?? {}) }) as Variant).sort(channelOrder),
    [campaign.variants, variantSaver.drafts],
  );
  const deliverables = useMemo(
    () => campaign.deliverables.map((d, i) => ({ ...d, ...(deliverableSaver.drafts[`d${i}`] ?? {}) })),
    [campaign.deliverables, deliverableSaver.drafts],
  );
  const view = useMemo(() => ({ ...campaign, variants, deliverables }), [campaign, variants, deliverables]);

  const [active, setActive] = useState<ChannelId | null>(null);
  const activeVariant = variants.find((v) => v.channel === active) ?? variants[0] ?? null;
  const activeAsset = activeVariant ? assetForVariant(campaign.assets, activeVariant) : null;

  const editVariant = (channel: ChannelId, patch: VariantPatch) => {
    const out = { ...patch };
    if (out.hashtags) out.hashtags = hashtagsForServer(out.hashtags);
    variantSaver.edit(channel, out);
  };

  // ---- images ----
  const [regenerating, setRegenerating] = useState(false);
  const regenerate = (req: RegenerateImageRequest) => {
    setRegenerating(true);
    regenerateImage(brandKey, cid, req)
      .then(setCampaign)
      .catch((err: unknown) => toast(t("board.campaign.toast.regenFailed", { error: errorText(err) })))
      .finally(() => setRegenerating(false));
  };

  // ---- approve / publish / delete ----
  const [busy, setBusy] = useState<"approve" | "publish" | "delete" | "retry" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tokenUnset, setTokenUnset] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picked, setPicked] = useState<ChannelId[] | null>(null);

  const options = useMemo(() => channelOptions(view, statuses), [view, statuses]);
  const selectable = options.filter((o) => o.block === null);
  const selected = (picked ?? defaultSelection(options)).filter((c) => selectable.some((o) => o.status.channel === c));
  const selectedOptions = selectable.filter((o) => selected.includes(o.status.channel));

  const handleAdminError = (err: unknown) => {
    if (isTokenUnsetError(err)) setTokenUnset(true);
    else setActionError(errorText(err));
  };

  const approve = async () => {
    setActionError(null);
    setBusy("approve");
    try {
      await Promise.all([variantSaver.flushAll(), deliverableSaver.flushAll()]);
      const c = await runAdmin((token) => approveCampaign(brandKey, cid, token), { promptFirst: false });
      if (c) {
        setCampaign(c);
        toast(t("board.campaign.toast.approved"));
      }
    } catch (err) {
      handleAdminError(err);
    } finally {
      setBusy(null);
    }
  };

  const publish = async (list: ChannelId[], kind: "publish" | "retry") => {
    setConfirming(false);
    setActionError(null);
    setBusy(kind);
    try {
      // Ask for the token up front: a tokenless attempt at a real channel would be logged as blocked.
      const local = list.every((ch) => TOKENLESS_CHANNELS.includes(ch));
      const c = await runAdmin((token) => publishCampaign(brandKey, cid, list, token), { promptFirst: !local });
      if (c) {
        setCampaign(c);
        const fresh = c.events.filter((e) => list.includes(e.channel));
        const failed = new Set(fresh.filter((e) => e.outcome === "failed" || e.outcome === "blocked").map((e) => e.channel));
        toast(failed.size ? t.n("board.campaign.toast.publishedSome", failed.size) : t("board.campaign.toast.published"));
        loadChannels(); // quotas moved
      }
    } catch (err) {
      handleAdminError(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("board.campaign.deleteConfirm"))) return;
    setActionError(null);
    setBusy("delete");
    try {
      const done = await runAdmin((token) => deleteCampaign(brandKey, cid, token), { promptFirst: false });
      if (done !== null) {
        variantSaver.reset();
        deliverableSaver.reset();
        toast(t("board.campaign.toast.deleted"));
        go(brandHref(brandKey, "recommendations"));
      }
    } catch (err) {
      handleAdminError(err);
    } finally {
      setBusy(null);
    }
  };

  const [retrying, setRetrying] = useState(false);
  const regenerateCampaign = () => {
    setRetrying(true);
    createCampaign(brandKey, campaign.recommendation_id)
      .then(({ campaign: c }) => go(campaignHref(brandKey, c.campaign_id)))
      .catch((err: unknown) => toast(t("board.campaign.toast.createFailed", { error: errorText(err) })))
      .finally(() => setRetrying(false));
  };

  // ---- header facts ----
  const { competitorId } = parseSuggestionKey(campaign.suggestion_key || campaign.action);
  const competitor = competitorId ? (latest?.entities?.[competitorId] ?? humanizeId(competitorId)) : null;
  const recTitle = actionTitle(campaign.action, competitor, t);
  const gapSnap = [...history].reverse().find((s) => s.gaps?.some((g) => g.gap_id === campaign.gap_id)) ?? latest;
  const gap = gapSnap?.gaps?.find((g) => g.gap_id === campaign.gap_id);
  const gapType = gap ? gapTypeText(gap.gap_type, t) : humanizeId(campaign.gap_id);
  const sv = statusView(campaign.status);
  const generating = campaign.status === "generating";
  const approved = isApproved(campaign);
  const issues = blockingIssues(variants);
  const approvable = canApprove(view);
  const waUrl = whatsappShareUrl(campaign.events ?? []);
  const imageProviders = [...new Set(campaign.assets.map((a) => a.provider))].filter((p) => p !== "template");
  const hasSandbox = variants.some((v) => v.channel === "sandbox") || selected.includes("sandbox");
  const headingId = useId();
  const editorId = useId();

  return (
    <div className="cs-studio">
      {dialog}
      {confirming && (
        <PublishDialog
          options={selectedOptions}
          assets={campaign.assets}
          onClose={() => setConfirming(false)}
          onConfirm={() => void publish(selected, "publish")}
        />
      )}

      <header className="card cs-header" aria-labelledby={headingId}>
        <div className="cs-header-top">
          <span className={`cs-status tone-${sv.tone}`}>
            {generating && <span className="cs-spinner" aria-hidden="true" />}
            {t(sv.key)}
          </span>
          <span className="cs-badges">
            <span className="cs-badge">
              {!campaign.drafted_by || campaign.drafted_by === "template"
                ? t("board.campaign.badge.templateCopy")
                : t("board.campaign.badge.draftedBy", { by: campaign.drafted_by })}
            </span>
            {usesTemplateImages(campaign.assets) && <span className="cs-badge is-honest">{t("board.campaign.badge.templateImage")}</span>}
            {imageProviders.length > 0 && (
              <span className="cs-badge">{t("board.campaign.badge.images", { by: imageProviders.join(", ") })}</span>
            )}
            {hasSandbox && <span className="cs-badge is-honest">{t("board.campaign.badge.simulated")}</span>}
          </span>
        </div>
        <h2 id={headingId} className="cs-headline">
          {campaign.headline || recTitle}
        </h2>
        <p className="cs-trace">
          <span className="muted">{t("board.campaign.fromRec")} </span>
          <TransitionLink to={brandHref(brandKey, "recommendations")} className="cs-trace-rec">
            {recTitle}
          </TransitionLink>{" "}
          <TransitionLink
            to={gapsHref(brandKey, { gapId: campaign.gap_id, runId: gapSnap?.run_id })}
            className="rec-trace"
            title={t("board.card.traceTitle", { id: campaign.gap_id })}
          >
            <span aria-hidden="true">↳ </span>
            {t("board.card.trace", { type: gapType })}
          </TransitionLink>
        </p>
        <p className="cs-dates muted small">
          {t("board.campaign.created", { when: fmt.relativeTime(campaign.created_at) || campaign.created_at })}
          {campaign.approved_at && approved && (
            <> · {t("board.campaign.approvedAt", { when: fmt.relativeTime(campaign.approved_at) || campaign.approved_at })}</>
          )}
        </p>
      </header>

      {generating && (
        <div className="card cs-generating" role="status">
          <span className="cs-spinner cs-spinner-lg" aria-hidden="true" />
          <div>
            <strong>{t("board.campaign.generating.title")}</strong>
            <p className="muted small">{job?.message || t("board.campaign.generating.body")}</p>
            {job && job.total > 0 && (
              <div className="progress" aria-hidden="true">
                <div className="progress-bar" style={{ width: `${Math.round((job.done / job.total) * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {campaign.status === "failed" && !campaign.approved_at && variants.length === 0 && (
        <div className="alert alert-error" role="alert">
          <p>{job?.error || t("board.campaign.failedBody")}</p>
          <button type="button" className="btn btn-secondary btn-small" disabled={retrying} onClick={regenerateCampaign}>
            {t("board.campaign.retryCreate")}
          </button>
        </div>
      )}

      {variants.length > 0 && activeVariant && (
        <>
          <div className="cs-tabs" role="group" aria-label={t("board.campaign.tabs")}>
            {variants.map((v) => {
              const n = issues.filter((i) => i.channel === v.channel).length;
              return (
                <button
                  key={v.channel}
                  type="button"
                  className={`cs-tab${v.channel === activeVariant.channel ? " is-active" : ""}${v.enabled ? "" : " is-off"}`}
                  aria-pressed={v.channel === activeVariant.channel}
                  aria-controls={editorId}
                  onClick={() => setActive(v.channel)}
                >
                  {channelName(v.channel, statuses)}
                  {!v.enabled && <span className="cs-tab-note">{t("board.campaign.tabOff")}</span>}
                  {v.enabled && n > 0 && (
                    <span className="cs-tab-issues" aria-label={t.n("board.campaign.tabIssues", n)}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="cs-grid">
            <div className="cs-left">
              <div className="cs-preview-frame">
                <p className="eyebrow">{t("board.campaign.preview.title", { channel: channelName(activeVariant.channel, statuses) })}</p>
                <div className={activeVariant.enabled ? "" : "cs-preview-off"}>
                  <PlatformPreview
                    variant={activeVariant}
                    asset={activeAsset}
                    assets={campaign.assets}
                    brandName={brandName}
                    handle={brandKey.replace(/[^a-z0-9_]/gi, "").toLowerCase()}
                    onPickAsset={generating ? undefined : (assetId) => editVariant(activeVariant.channel, { asset_id: assetId })}
                  />
                </div>
              </div>
            </div>

            <div className="cs-right" id={editorId}>
              {approved && <p className="cs-reapprove">{t("board.campaign.reapprove")}</p>}
              <div className="card cs-panel">
                <VariantEditor
                  variant={activeVariant}
                  localIssues={issues.filter((i) => i.channel === activeVariant.channel && i.local).map((i) => i.message)}
                  assets={campaign.assets}
                  status={statuses.find((s) => s.channel === activeVariant.channel)}
                  statuses={statuses}
                  saveState={variantSaver.states[activeVariant.channel]}
                  locked={generating}
                  onChange={(patch) => editVariant(activeVariant.channel, patch)}
                />
              </div>
              <ImagePanel
                key={activeVariant.channel}
                assets={campaign.assets}
                activeAssetId={activeAsset?.asset_id ?? null}
                activeChannelName={channelName(activeVariant.channel, statuses)}
                defaultFormat={activeAsset?.format ?? CHANNEL_FORMATS[activeVariant.channel]?.[0] ?? "square"}
                busy={regenerating}
                disabled={generating}
                onRegenerate={regenerate}
                onUse={(assetId) => editVariant(activeVariant.channel, { asset_id: assetId })}
              />
            </div>
          </div>
        </>
      )}

      <DeliverablesPanel
        deliverables={deliverables}
        states={deliverableSaver.states}
        disabled={generating}
        onChange={(i: number, patch: DeliverablePatch) => deliverableSaver.edit(`d${i}`, patch)}
      />

      {!generating && (
        <section className="card cs-panel cs-publish" aria-label={t("board.campaign.publish.title")}>
          <div className="cs-panel-head">
            <h2>{t("board.campaign.publish.title")}</h2>
            <p className="muted small">{t("board.campaign.publish.intro")}</p>
          </div>
          {channelsError && (
            <p className="board-notice" role="status">
              <span className="board-notice-dot" aria-hidden="true" />
              {t("board.campaign.channels.error")}{" "}
              <button type="button" className="btn-link" onClick={loadChannels}>
                {t("board.offline.retry")}
              </button>
            </p>
          )}
          {channels && (
            <ChannelBar
              options={options}
              selected={selected}
              onToggle={(ch, on) =>
                setPicked((prev) => {
                  const base = prev ?? selected;
                  return on ? [...new Set([...base, ch])] : base.filter((c) => c !== ch);
                })
              }
            />
          )}

          {tokenUnset && (
            <div className="alert alert-warn" role="alert">
              {t("board.campaign.token.unset")}
            </div>
          )}
          {actionError && (
            <div className="alert alert-error" role="alert">
              {actionError}
            </div>
          )}

          <div className="cs-actions">
            {approved ? (
              <span className="cs-approved">
                <span className="cs-approved-dot" aria-hidden="true" />
                {t("board.campaign.approved")}
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!approvable || busy !== null || variantSaver.dirty || deliverableSaver.dirty}
                onClick={() => void approve()}
                title={issues.length ? t.n("board.campaign.approveBlocked", issues.length) : undefined}
              >
                {busy === "approve" && <span className="cs-spinner" aria-hidden="true" />}
                {t("board.campaign.approve")}
              </button>
            )}
            <button
              type="button"
              className={`btn ${approved ? "btn-primary" : "btn-secondary"}`}
              disabled={selected.length === 0 || busy !== null || variantSaver.dirty}
              onClick={() => setConfirming(true)}
            >
              {busy === "publish" && <span className="cs-spinner" aria-hidden="true" />}
              {t.n("board.campaign.publish.button", selected.length)}
            </button>
            <a className="btn btn-secondary" href={campaignExportUrl(brandKey, cid)} download>
              {t("board.campaign.export")}
            </a>
            {waUrl && (
              <a className="btn btn-secondary" href={waUrl} target="_blank" rel="noreferrer">
                {t("board.campaign.openWhatsApp")}
              </a>
            )}
            <span className="cs-grow" />
            <button type="button" className="btn-link cs-delete" disabled={busy !== null} onClick={() => void remove()}>
              {t("board.campaign.delete")}
            </button>
          </div>
          {!approved && issues.length > 0 && (
            <p className="field-error">{t.n("board.campaign.approveBlocked", issues.length)}</p>
          )}
          {!approved && issues.length === 0 && !generating && (
            <p className="field-hint">{t("board.campaign.approveHint")}</p>
          )}
        </section>
      )}

      <PublishLog
        events={campaign.events ?? []}
        statuses={statuses}
        busy={busy !== null}
        canRetry
        onRetry={(ch) => void publish([ch], "retry")}
      />
    </div>
  );
}

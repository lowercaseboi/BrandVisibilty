import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  approveCampaign,
  createCampaign,
  deleteCampaign,
  listBrandChannels,
  patchVariant,
  publishCampaign,
  regenerateImage,
  updateDeliverable,
} from "../../api/client";
import { CHANNEL_IDS } from "../../api/types";
import type { Campaign, ChannelId, ChannelStatus, DeliverablePatch, RegenerateImageRequest, Variant, VariantPatch } from "../../api/types";
import { campaignHref } from "../../components/campaign/CampaignIndex";
import {
  TOKENLESS_CHANNELS,
  blockingIssues,
  hashtagsForServer,
  isApproved,
  latestEventByChannel,
  statusView,
  usesTemplateImages,
} from "../../components/campaign/campaignModel";
import { isTokenUnsetError } from "../../components/campaign/adminToken";
import { PublishStep } from "../../components/campaign/PublishStep";
import type { SendState } from "../../components/campaign/PublishStep";
import { ResultsStep } from "../../components/campaign/ResultsStep";
import { ReviewStep } from "../../components/campaign/ReviewStep";
import type { ReviewTab } from "../../components/campaign/ReviewStep";
import { ActionBar, Generating, Stepper } from "../../components/campaign/StudioChrome";
import { EmptyState } from "../../components/EmptyState";
import { STEPS, STEP_LABEL, currentStep, defaultPicks, parseStep, planDestinations, reachableSteps, sendList } from "../../components/campaign/studioFlow";
import type { StepId } from "../../components/campaign/studioFlow";
import { useAdminGate } from "../../components/campaign/useAdminGate";
import { useCampaign } from "../../components/campaign/useCampaign";
import { useDraftSaver } from "../../components/campaign/useDraftSaver";
import type { SaveState } from "../../components/campaign/useDraftSaver";
import { SaveIndicator } from "../../components/campaign/VariantEditor";
import { WhereStep } from "../../components/campaign/WhereStep";
import { actionTitle } from "../../components/dashboard/actions";
import { gapTypeText, humanizeId, parseSuggestionKey } from "../../components/dashboard/helpers";
import { ModuleShell } from "../../components/module/ModuleShell";
import { brandHref, gapsHref } from "../../components/module/modules";
import { TransitionLink, useTransitionNavigate } from "../../components/module/transition";
import { toast } from "../../components/Toaster";
import { useFormat, useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { useReducedMotion } from "../../settings/motion";
import { useBrandData } from "./BrandContext";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const channelOrder = (a: Variant, b: Variant) => CHANNEL_IDS.indexOf(a.channel) - CHANNEL_IDS.indexOf(b.channel);

const STEP_INTRO: Record<StepId, MessageKey> = {
  review: "board.campaign.review.intro",
  where: "board.campaign.where.intro",
  publish: "board.campaign.publish.intro",
  results: "board.campaign.results.intro",
};

// The step-2 choice survives a trip to Details (connecting an account) and reloads, per tab.
const picksKey = (cid: string) => `bv.campaignPicks.${cid}`;
function readPicks(cid: string): ChannelId[] | null {
  try {
    const raw = sessionStorage.getItem(picksKey(cid));
    const list: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list.filter((c): c is ChannelId => CHANNEL_IDS.includes(c as ChannelId)) : null;
  } catch {
    return null;
  }
}
function writePicks(cid: string, picks: ChannelId[]): void {
  try {
    sessionStorage.setItem(picksKey(cid), JSON.stringify(picks));
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}

/** One save indicator for the whole draft. */
function overallSave(states: Record<string, SaveState>[]): SaveState | undefined {
  const all = states.flatMap((s) => Object.values(s));
  if (all.includes("error")) return "error";
  if (all.some((s) => s === "saving" || s === "pending")) return "saving";
  return all.includes("saved") ? "saved" : undefined;
}

/**
 * Campaign Studio (PRD §11.5 / AC-10): a recommendation's campaign as a guided four-step flow —
 * review the draft, choose where to post, approve & publish, results — under a sticky progress
 * header, with the step's primary action in a sticky bottom bar. The page traces back to the
 * recommendation and its gap (AC-7); every publish attempt is logged (AC-10).
 */
export function CampaignStudio() {
  const t = useT();
  const { campaignId = "" } = useParams();
  const { brandKey } = useBrandData();
  const { campaign, job, error, loading, setCampaign, reload } = useCampaign(brandKey, campaignId);

  let body;
  if (loading && !campaign) body = <p className="status">{t("board.campaign.loading")}</p>;
  else if (!campaign)
    body = (
      <EmptyState
        icon="compass"
        title={t("board.campaign.notFound")}
        body={error instanceof ApiError && error.status !== 404 ? errorText(error) : t("board.campaign.notFoundBody")}
        primary={
          <TransitionLink to={brandHref(brandKey, "recommendations")} className="btn btn-primary">
            {t("board.campaign.back")}
          </TransitionLink>
        }
      />
    );
  else body = <Studio key={campaign.campaign_id} campaign={campaign} job={job} setCampaign={setCampaign} reload={reload} />;

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
  reload,
}: {
  campaign: Campaign;
  job: ReturnType<typeof useCampaign>["job"];
  setCampaign: (c: Campaign) => void;
  reload: () => Promise<void>;
}) {
  const t = useT();
  const fmt = useFormat();
  const go = useTransitionNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();
  const { brandKey, brandName, latest, history } = useBrandData();
  const { runAdmin, dialog } = useAdminGate();
  const cid = campaign.campaign_id;

  // The newest campaign, also between renders (the publish loop reads it after each await).
  const campaignRef = useRef(campaign);
  useEffect(() => {
    campaignRef.current = campaign;
  }, [campaign]);
  const commit = useCallback(
    (c: Campaign) => {
      campaignRef.current = c;
      setCampaign(c);
    },
    [setCampaign],
  );

  // ---- this brand's channels (its connected accounts) ----
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [channelsError, setChannelsError] = useState(false);
  const loadChannels = useCallback(() => {
    listBrandChannels(brandKey)
      .then((c) => {
        setChannels(c);
        setChannelsError(false);
      })
      .catch(() => setChannelsError(true));
  }, [brandKey]);
  useEffect(() => {
    loadChannels();
    // Back from connecting an account in another tab: check again.
    const onVisible = () => document.visibilityState === "visible" && loadChannels();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadChannels]);
  const statuses = useMemo(() => channels ?? [], [channels]);

  // ---- autosave (variants per channel, deliverables per index) ----
  const variantSaver = useDraftSaver<VariantPatch>(
    useCallback(
      async (channel: string, patch: VariantPatch) => commit(await patchVariant(brandKey, cid, channel as ChannelId, patch)),
      [brandKey, cid, commit],
    ),
  );
  const deliverableSaver = useDraftSaver<DeliverablePatch>(
    useCallback(
      async (key: string, patch: DeliverablePatch) => commit(await updateDeliverable(brandKey, cid, Number(key.slice(1)), patch)),
      [brandKey, cid, commit],
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

  const editVariant = (channel: ChannelId, patch: VariantPatch) => {
    const out = { ...patch };
    if (out.hashtags) out.hashtags = hashtagsForServer(out.hashtags);
    variantSaver.edit(channel, out);
  };

  // ---- steps: ?step= in the URL (Back / Forward work), else resume from the status ----
  const [params, setParams] = useSearchParams();
  const step = currentStep(view, parseStep(params.get("step")));
  const reachable = reachableSteps(view);
  const goStep = useCallback(
    (s: StepId) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("step", s);
        return next;
      }),
    [setParams],
  );
  const [tab, setTab] = useState<ReviewTab>(variants[0]?.channel ?? "web");

  // Focus the new step's heading and bring the studio's top into view (not on first load).
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus({ preventScroll: true });
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 88, behavior: reduced ? "auto" : "smooth" });
  }, [step, reduced]);

  // ---- where to post (step 2) ----
  const [picked, setPicked] = useState<ChannelId[] | null>(() => {
    const stored = readPicks(cid);
    const joined = new URLSearchParams(window.location.search).get("connected") as ChannelId | null;
    if (!stored || !joined || !CHANNEL_IDS.includes(joined) || stored.includes(joined)) return stored;
    writePicks(cid, [...stored, joined]);
    return [...stored, joined];
  });
  const dests = useMemo(() => planDestinations(view, statuses), [view, statuses]);
  const chosen = picked ?? defaultPicks(dests);
  const sends = sendList(dests, chosen);
  const toggle = useCallback(
    (ch: ChannelId, on: boolean) => {
      const base = picked ?? defaultPicks(dests);
      const next = on ? [...new Set([...base, ch])] : base.filter((c) => c !== ch);
      setPicked(next);
      writePicks(cid, next);
    },
    [picked, dests, cid],
  );
  // Back from Details with ?connected=<channel>: the stored choice gains that channel (the default
  // choice already includes every connected channel); then the param is dropped from the URL.
  const connected = params.get("connected");
  useEffect(() => {
    if (!connected) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("connected");
        return next;
      },
      { replace: true },
    );
  }, [connected, setParams]);

  // ---- images ----
  const [regenerating, setRegenerating] = useState(false);
  const regenerate = (req: RegenerateImageRequest, channel: ChannelId) => {
    const before = new Set(campaign.assets.map((a) => a.asset_id));
    setRegenerating(true);
    regenerateImage(brandKey, cid, req)
      .then((c) => {
        commit(c);
        // The new take is what the user wanted for this channel: use it here.
        const fresh = c.assets.find((a) => !before.has(a.asset_id) && a.format === req.format);
        if (fresh) editVariant(channel, { asset_id: fresh.asset_id });
      })
      .catch((err: unknown) => toast(t("board.campaign.toast.regenFailed", { error: errorText(err) })))
      .finally(() => setRegenerating(false));
  };

  // ---- approve & publish (one confirm; channels sent one by one for per-channel progress) ----
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<ChannelId, SendState>>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [tokenUnset, setTokenUnset] = useState(false);

  const send = async (list: ChannelId[]) => {
    if (!list.length || busy) return;
    setBusy(true);
    setActionError(null);
    setTokenUnset(false);
    setProgress(Object.fromEntries(list.map((c) => [c, "waiting" as SendState])));
    let failed = 0;
    try {
      await Promise.all([variantSaver.flushAll(), deliverableSaver.flushAll()]);
      if (!isApproved(campaignRef.current)) {
        setApproving(true);
        const approved = await runAdmin((token) => approveCampaign(brandKey, cid, token), { promptFirst: false });
        setApproving(false);
        if (!approved) {
          setProgress({});
          return;
        }
        commit(approved);
      }
      for (let i = 0; i < list.length; i++) {
        const ch = list[i];
        setProgress((p) => ({ ...p, [ch]: "working" }));
        try {
          // Ask for the token up front for a real channel: a tokenless attempt is logged as blocked.
          const out = await runAdmin((token) => publishCampaign(brandKey, cid, [ch], token), {
            promptFirst: !TOKENLESS_CHANNELS.includes(ch),
          });
          if (!out) {
            setProgress((p) => ({ ...p, ...Object.fromEntries(list.slice(i).map((c) => [c, "skipped" as SendState])) }));
            break;
          }
          commit(out);
          const e = latestEventByChannel(out.events ?? []).get(ch);
          const ok = !!e && (e.outcome === "published" || e.outcome === "exported");
          if (!ok) failed++;
          setProgress((p) => ({ ...p, [ch]: ok ? "done" : "failed" }));
        } catch (err) {
          failed++;
          if (isTokenUnsetError(err)) setTokenUnset(true);
          else setActionError(errorText(err));
          setProgress((p) => ({ ...p, [ch]: "failed" }));
        }
      }
      await reload(); // refused attempts are logged server-side too
      loadChannels(); // quotas moved
      toast(failed ? t.n("board.campaign.toast.publishedSome", failed) : t("board.campaign.toast.published"));
      goStep("results");
    } catch (err) {
      if (isTokenUnsetError(err)) setTokenUnset(true);
      else setActionError(errorText(err));
    } finally {
      setApproving(false);
      setBusy(false);
    }
  };

  // ---- delete / redraft ----
  const remove = async () => {
    if (!window.confirm(t("board.campaign.deleteConfirm"))) return;
    try {
      const done = await runAdmin((token) => deleteCampaign(brandKey, cid, token), { promptFirst: false });
      if (done !== null) {
        variantSaver.reset();
        deliverableSaver.reset();
        try {
          sessionStorage.removeItem(picksKey(cid));
        } catch {
          /* storage unavailable */
        }
        toast(t("board.campaign.toast.deleted"));
        go(brandHref(brandKey, "recommendations"));
      }
    } catch (err) {
      if (isTokenUnsetError(err)) setTokenUnset(true);
      else toast(errorText(err));
    }
  };
  const [redrafting, setRedrafting] = useState(false);
  const redraft = () => {
    setRedrafting(true);
    createCampaign(brandKey, campaign.recommendation_id)
      .then(({ campaign: c }) => go(campaignHref(brandKey, c.campaign_id)))
      .catch((err: unknown) => toast(t("board.campaign.toast.createFailed", { error: errorText(err) })))
      .finally(() => setRedrafting(false));
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
  const issues = blockingIssues(variants).length;
  const imageProviders = [...new Set(campaign.assets.map((a) => a.provider))].filter((p) => p !== "template");
  const stepHeadingId = useId();
  const n = STEPS.indexOf(step) + 1;
  const returnTo = `${location.pathname}?step=where`;
  const showHead = !generating && variants.length > 0;

  let content;
  let bar = null;
  if (generating) content = <Generating job={job} />;
  else if (variants.length === 0)
    content = (
      <EmptyState
        icon="error"
        tone="error"
        role="alert"
        title={t("board.campaign.failedBody")}
        body={job?.error ?? undefined}
        primary={
          <button type="button" className="btn btn-primary" disabled={redrafting} onClick={redraft}>
            {t("board.campaign.retryCreate")}
          </button>
        }
      />
    );
  else if (step === "review") {
    content = (
      <ReviewStep
        variants={variants}
        assets={campaign.assets}
        deliverables={deliverables}
        statuses={statuses}
        brandName={brandName}
        brandKey={brandKey}
        tab={tab}
        onTab={setTab}
        variantStates={variantSaver.states}
        deliverableStates={deliverableSaver.states}
        locked={busy}
        approved={approved}
        regenerating={regenerating}
        onEditVariant={editVariant}
        onEditDeliverable={(i, patch) => deliverableSaver.edit(`d${i}`, patch)}
        onRegenerate={regenerate}
      />
    );
    bar = (
      <ActionBar note={issues > 0 ? t.n("board.campaign.bar.fixFirst", issues) : t("board.campaign.bar.reviewNote")}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={issues > 0}
          onClick={() => void Promise.all([variantSaver.flushAll(), deliverableSaver.flushAll()]).then(() => goStep("where"))}
        >
          {t("board.campaign.bar.toWhere")} <span aria-hidden="true">→</span>
        </button>
      </ActionBar>
    );
  } else if (step === "where") {
    content = (
      <WhereStep
        dests={dests}
        picked={chosen}
        assets={campaign.assets}
        brandKey={brandKey}
        returnTo={returnTo}
        loading={channels === null && !channelsError}
        error={channelsError}
        onRetry={loadChannels}
        onToggle={toggle}
        onFix={(ch) => {
          setTab(ch);
          goStep("review");
        }}
      />
    );
    bar = (
      <ActionBar
        back={{ label: t(STEP_LABEL.review), onClick: () => goStep("review") }}
        note={sends.length ? t.n("board.campaign.where.chosen", sends.length) : t("board.campaign.where.noneChosen")}
      >
        <button type="button" className="btn btn-primary" disabled={!sends.length || !reachable.has("publish")} onClick={() => goStep("publish")}>
          {t("board.campaign.bar.toPublish")} <span aria-hidden="true">→</span>
        </button>
      </ActionBar>
    );
  } else if (step === "publish") {
    content = <PublishStep sends={sends} assets={campaign.assets} approvedAt={approved ? campaign.approved_at : null} progress={progress} approving={approving} />;
    bar = (
      <ActionBar back={busy ? undefined : { label: t(STEP_LABEL.where), onClick: () => goStep("where") }} note={t("board.campaign.bar.publishNote")}>
        <button type="button" className="btn btn-primary" disabled={busy || !sends.length} onClick={() => void send(sends.map((d) => d.channel))}>
          {busy && <span className="cs-spinner" aria-hidden="true" />}
          {busy ? t("board.campaign.publish.working") : approved ? t("board.campaign.publish.goApproved") : t("board.campaign.publish.go")}
        </button>
      </ActionBar>
    );
  } else {
    content = (
      <ResultsStep events={campaign.events ?? []} statuses={statuses} brandKey={brandKey} campaignId={cid} busy={busy} onRetry={(ch) => void send([ch])} />
    );
    bar = (
      <ActionBar back={{ label: t("board.campaign.bar.postMore"), onClick: () => goStep("where") }}>
        <TransitionLink to={brandHref(brandKey, "recommendations")} className="btn btn-primary">
          {t("board.campaign.bar.done")}
        </TransitionLink>
      </ActionBar>
    );
  }

  return (
    <div className="cs-studio" ref={rootRef}>
      {dialog}
      <div className="cs-top">
        <div className="cs-top-row">
          <span className="status-pill" data-tone={sv.tone}>
            {generating && <span className="cs-spinner" aria-hidden="true" />}
            {t(sv.key)}
          </span>
          <p className="cs-title" title={campaign.headline || recTitle}>
            {campaign.headline || recTitle}
          </p>
          <SaveIndicator state={overallSave([variantSaver.states, deliverableSaver.states])} />
        </div>
        <Stepper current={generating ? "review" : step} reachable={reachable} onGo={goStep} />
      </div>

      <div className="cs-trace">
        <span className="muted">{t("board.campaign.fromRec")}</span>
        <TransitionLink to={brandHref(brandKey, "recommendations")} className="cs-trace-rec">
          {recTitle}
        </TransitionLink>
        <TransitionLink
          to={gapsHref(brandKey, { gapId: campaign.gap_id, runId: gapSnap?.run_id })}
          className="rec-trace"
          title={t("board.card.traceTitle", { id: campaign.gap_id })}
        >
          <span aria-hidden="true">↳ </span>
          {t("board.card.trace", { type: gapType })}
        </TransitionLink>
        <span className="muted">· {t("board.campaign.created", { when: fmt.relativeTime(campaign.created_at) || campaign.created_at })}</span>
        <span className="cs-badges">
          <span className="cs-badge">
            {!campaign.drafted_by || campaign.drafted_by === "template"
              ? t("board.campaign.badge.templateCopy")
              : t("board.campaign.badge.draftedBy", { by: campaign.drafted_by })}
          </span>
          {usesTemplateImages(campaign.assets) && <span className="cs-badge is-honest">{t("board.campaign.badge.templateImage")}</span>}
          {imageProviders.length > 0 && <span className="cs-badge">{t("board.campaign.badge.images", { by: imageProviders.join(", ") })}</span>}
        </span>
        {!generating && (
          <button type="button" className="btn-link cs-delete" disabled={busy} onClick={() => void remove()}>
            {t("board.campaign.delete")}
          </button>
        )}
      </div>

      <section className="cs-step" aria-labelledby={showHead ? stepHeadingId : undefined}>
        {showHead && (
          <div className="cs-step-head">
            <p className="eyebrow">{t("board.campaign.step.of", { n, total: STEPS.length })}</p>
            <h2 id={stepHeadingId} ref={headingRef} tabIndex={-1}>
              {t(STEP_LABEL[step])}
            </h2>
            <p className="muted">{t(STEP_INTRO[step])}</p>
          </div>
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
        {content}
      </section>

      {bar}
    </div>
  );
}

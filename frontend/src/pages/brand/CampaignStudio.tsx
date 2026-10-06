import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  ApiError,
  approveCampaign,
  createCampaign,
  deleteCampaign,
  listAccounts,
  listBrandChannels,
  patchVariant,
  preflightCampaign,
  publishCampaign,
  regenerateImage,
  updateDeliverable,
} from "../../api/client";
import { CHANNEL_IDS } from "../../api/types";
import type { PreflightPlan } from "../../api/client";
import type { AccountStatus, Campaign, ChannelId, ChannelStatus, DeliverablePatch, RegenerateImageRequest, Variant, VariantPatch } from "../../api/types";
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
import { isTokenUnsetError, readAdminToken } from "../../components/campaign/adminToken";
import { PublishStep } from "../../components/campaign/PublishStep";
import type { SendState } from "../../components/campaign/PublishStep";
import { ResultsStep } from "../../components/campaign/ResultsStep";
import { ReviewStep } from "../../components/campaign/ReviewStep";
import type { ReviewTab } from "../../components/campaign/ReviewStep";
import { ActionBar, Generating, Stepper } from "../../components/campaign/StudioChrome";
import { EmptyState } from "../../components/EmptyState";
import {
  STEPS,
  STEP_LABEL,
  currentStep,
  defaultPicks,
  joinConnected,
  needsTokenFirst,
  parsePicks,
  parseStep,
  planDestinations,
  reachableSteps,
  selectAll,
  sendList,
  sendable,
  setExportInstead,
  togglePick,
  whereGate,
} from "../../components/campaign/studioFlow";
import type { Picks, StepId } from "../../components/campaign/studioFlow";
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
function readPicks(cid: string): Picks | null {
  try {
    return parsePicks(sessionStorage.getItem(picksKey(cid)));
  } catch {
    return null;
  }
}
function writePicks(cid: string, picks: Picks): void {
  try {
    sessionStorage.setItem(picksKey(cid), JSON.stringify(picks));
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}

/** A send / progress glyph for the primary publish button. */
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l16-8-6 16-2.5-6.5z" />
      <path d="M11.5 13.5L20 4" />
    </svg>
  );
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
        <TransitionLink to={brandHref(brandKey, "recommendations")} direction="back">
          ← {t("board.campaign.back")}
        </TransitionLink>
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
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [channelsError, setChannelsError] = useState(false);
  const loadChannels = useCallback(() => {
    listBrandChannels(brandKey)
      .then((c) => {
        setChannels(c);
        setChannelsError(false);
      })
      .catch(() => setChannelsError(true));
    // Only for "as <account name>": an older backend without it still works.
    listAccounts(brandKey)
      .then(setAccounts)
      .catch(() => setAccounts([]));
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
  // Back from Details with ?connected=<channel>: that channel is ticked (read once, then dropped
  // from the URL below). The statuses were fetched fresh on mount, so the row shows it connected.
  const [joinedChannel] = useState<ChannelId | null>(() => {
    const j = new URLSearchParams(window.location.search).get("connected") as ChannelId | null;
    return j && CHANNEL_IDS.includes(j) ? j : null;
  });
  const [picked, setPicked] = useState<Picks | null>(() => {
    const stored = readPicks(cid);
    if (!stored || !joinedChannel) return stored;
    const next = joinConnected(stored, joinedChannel);
    writePicks(cid, next);
    return next;
  });
  const dests = useMemo(() => planDestinations(view, statuses, accounts), [view, statuses, accounts]);
  const picks: Picks = useMemo(
    () => picked ?? joinConnected({ on: defaultPicks(dests), exportInstead: [] }, joinedChannel),
    [picked, dests, joinedChannel],
  );
  const sends = sendList(dests, picks);
  const sendKey = sends.map((d) => d.channel).join(",");
  const gate = whereGate(dests, picks);
  const savePicks = useCallback(
    (next: Picks) => {
      setPicked(next);
      writePicks(cid, next);
    },
    [cid],
  );
  const joined =
    joinedChannel && channels
      ? { channel: joinedChannel, ok: dests.find((d) => d.channel === joinedChannel)?.kind !== "unconnected" }
      : null;
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

  // ---- step 3: the server's dry run of each chosen channel (what it will really do) ----
  const [plans, setPlans] = useState<{ key: string; map: Map<ChannelId, PreflightPlan> } | null>(null);
  const planKey = `${sendKey}|${campaign.updated_at}`;
  useEffect(() => {
    if (step !== "publish" || !sendKey) return;
    let cancelled = false;
    preflightCampaign(brandKey, cid, sendKey.split(",") as ChannelId[])
      .then((list) => !cancelled && setPlans({ key: planKey, map: new Map((list ?? []).map((p) => [p.channel, p])) }))
      .catch(() => !cancelled && setPlans(null));
    return () => {
      cancelled = true;
    };
  }, [step, sendKey, planKey, brandKey, cid]);
  const planMap = plans?.key === planKey && plans.map.size > 0 ? plans.map : null;
  const goList = sendable(sends, planMap);

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
  const [sentCount, setSentCount] = useState<{ i: number; n: number } | null>(null);

  const send = async (list: ChannelId[]) => {
    if (!list.length || busy) return;
    setBusy(true);
    setActionError(null);
    setTokenUnset(false);
    setProgress(Object.fromEntries(list.map((c) => [c, "waiting" as SendState])));
    setSentCount(null);
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
        setSentCount({ i: i + 1, n: list.length });
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
      setSentCount(null);
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
  const connectHref = `${brandHref(brandKey, "details")}?return=${encodeURIComponent(returnTo)}#accounts`;
  const gateNote =
    gate.reason === "connect"
      ? t("board.campaign.where.waiting", { names: gate.waiting.map((d) => d.status.label).join(", ") })
      : gate.reason === "none"
        ? t("board.campaign.where.noneChosen")
        : t.n("board.campaign.where.chosen", gate.count);
  const tokenAhead = readAdminToken() === null && needsTokenFirst(goList.map((d) => d.channel)) ? goList.filter((d) => d.needsApproval && d.channel !== "sandbox").map((d) => d.status.label) : [];
  const publishLabel = busy
    ? approving
      ? t("board.campaign.progress.approving")
      : sentCount
        ? t("board.campaign.publish.progressN", { i: sentCount.i, n: sentCount.n })
        : t("board.campaign.publish.working")
    : approved
      ? t.n("board.campaign.publish.goApprovedN", goList.length)
      : t.n("board.campaign.publish.goN", goList.length);
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
        picks={picks}
        connectHref={connectHref}
        loading={channels === null && !channelsError}
        error={channelsError}
        joined={joined}
        onRetry={loadChannels}
        onToggle={(ch, on) => savePicks(togglePick(picks, ch, on))}
        onExportInstead={(ch, exportIt) => savePicks(setExportInstead(picks, ch, exportIt))}
        onSelectAll={() => savePicks(selectAll(dests, picks))}
        onSelectNone={() => savePicks({ on: [], exportInstead: picks.exportInstead })}
        onFix={(ch) => {
          setTab(ch);
          goStep("review");
        }}
      />
    );
    const canGo = gate.reason === null && reachable.has("publish");
    bar = (
      <ActionBar back={{ label: t(STEP_LABEL.review), onClick: () => goStep("review") }} note={gateNote} noteTone={gate.reason ? "warn" : undefined}>
        <button type="button" className="btn btn-primary" disabled={!canGo} onClick={() => goStep("publish")}>
          {t("board.campaign.bar.toPublish")} <span aria-hidden="true">→</span>
        </button>
      </ActionBar>
    );
  } else if (step === "publish") {
    content = (
      <PublishStep
        sends={sends}
        assets={campaign.assets}
        approvedAt={approved ? campaign.approved_at : null}
        progress={progress}
        plans={planMap}
        approving={approving}
        tokenAhead={busy ? [] : tokenAhead}
      />
    );
    const none = goList.length === 0;
    const noneNote = sends.length ? t("board.campaign.publish.allBlocked") : t("board.campaign.where.noneChosen");
    bar = (
      <ActionBar
        back={busy ? undefined : { label: t(STEP_LABEL.where), onClick: () => goStep("where") }}
        note={
          none
            ? noneNote
            : busy
              ? t("board.campaign.bar.publishingNote")
              : goList.length < sends.length
                ? t.n("board.campaign.publish.someBlocked", sends.length - goList.length)
                : t("board.campaign.bar.publishNote")
        }
        noteTone={none || (!busy && goList.length < sends.length) ? "warn" : undefined}
      >
        <button
          type="button"
          className={`btn btn-primary btn-publish${busy ? " is-busy" : ""}`}
          disabled={none}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          onClick={() => !busy && void send(goList.map((d) => d.channel))}
        >
          {busy ? <span className="cs-spinner" aria-hidden="true" /> : <SendIcon />}
          <span aria-live="polite">{publishLabel}</span>
        </button>
      </ActionBar>
    );
  } else {
    content = (
      <ResultsStep
        events={campaign.events ?? []}
        statuses={statuses}
        brandKey={brandKey}
        campaignId={cid}
        connectHref={connectHref}
        busy={busy}
        onRetry={(ch) => void send([ch])}
      />
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

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createCampaign, getObservations, listCampaigns } from "../../api/client";
import type { BoardColumn, Campaign, Observation } from "../../api/types";
import { useAsync } from "../../api/useAsync";
import { InfoTip } from "../../components/InfoTip";
import { CampaignsStrip } from "../../components/board/CampaignsStrip";
import { HowItWorks } from "../../components/board/HowItWorks";
import { buildBoard, clearLegacyDone, migrateLegacyDone, removeCard, setStatus } from "../../components/board/boardModel";
import { RecList } from "../../components/board/RecList";
import { capLine } from "../../components/board/recView";
import { useBoardState } from "../../components/board/useBoardState";
import {
  CampaignIndexContext,
  campaignHref,
  indexCampaigns,
  syncBoardWithCampaigns,
} from "../../components/campaign/CampaignIndex";
import type { CampaignIndexValue } from "../../components/campaign/CampaignIndex";
import type { BoardStatus } from "../../components/board/useBoardState";
import { groupSuggestions, useShortDate } from "../../components/dashboard/helpers";
import { ModuleShell } from "../../components/module/ModuleShell";
import { brandHref } from "../../components/module/modules";
import { TransitionLink, useTransitionNavigate } from "../../components/module/transition";
import { toast } from "../../components/Toaster";
import { useFormat, useT } from "../../i18n";
import { Details } from "../../settings/details";
import { useBrandData } from "./BrandContext";

/** Drafting crashed for this run: the scores are fine, the suggestions just need another run. */
function DraftFailed({ brandKey, error }: { brandKey: string; error: string | null | undefined }) {
  const t = useT();
  return (
    <div className="card board-empty-state board-failed" role="status">
      <p className="eyebrow board-failed-eyebrow">
        <span className="board-notice-dot" aria-hidden="true" />
        {t("board.eyebrow")}
      </p>
      <h2>{t("board.failed.title")}</h2>
      <p className="muted">{t("board.failed.body")}</p>
      {error && (
        <Details>
          <p className="board-failed-detail small">{t("board.failed.detail", { error })}</p>
        </Details>
      )}
      <TransitionLink to={brandHref(brandKey, "analysis")} className="btn btn-primary">
        {t("board.failed.cta")}
      </TransitionLink>
    </div>
  );
}

/** Placeholder cards while the saved statuses load (same shimmer as the hub previews). */
function BoardSkeleton() {
  const t = useT();
  return (
    <div className="rec-skeleton" role="status" aria-label={t("board.skeleton.label")}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card rec-skeleton-card" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function EmptyBoard({ brandKey, noneFound }: { brandKey: string; noneFound: boolean }) {
  const t = useT();
  return (
    <div className="card board-empty-state">
      <p className="eyebrow">{t("board.eyebrow")}</p>
      <h2>{noneFound ? t("board.empty.noneTitle") : t("board.empty.title")}</h2>
      <p className="muted">{noneFound ? t("board.empty.noneBody") : t("board.empty.body")}</p>
      <TransitionLink to={brandHref(brandKey, "analysis")} className="btn btn-primary">
        {t("board.empty.cta")}
      </TransitionLink>
    </div>
  );
}

/**
 * Recommendation engine: the latest run's suggestions as a priority-sorted grid of cards, each with
 * a status (Suggested · Saved for later · In progress · Done · Rejected — PRD §11.4's approve /
 * reject / save-for-later) saved to the backend board; every card links back to its gap (AC-7).
 */
export function BoardModule() {
  const t = useT();
  const fmt = useFormat();
  const { brandKey, latest, labelOf } = useBrandData();
  const { state, status, retrying, commit, retry } = useBoardState(brandKey);
  const shortDate = useShortDate();
  const headingId = useId();

  const recs = latest?.recommendations;
  const gaps = latest?.gaps;
  const entities = latest?.entities;
  // Old snapshots have no status: treat them as "ok". A failed run keeps its saved statuses as they
  // are (no ghost "resolved" cards, no sync or migration saves) until a run drafts suggestions again.
  const draftFailed = latest?.recommendation_status === "failed";
  const cap = capLine(latest?.recommendations_total, recs?.length ?? 0);

  // The run's responses, for each card's plain "Why" (a real customer question). Loaded after the
  // cards render; until then (or if it fails) cards show the translated gap finding instead.
  const runId = latest?.run_id ?? null;
  const hasRecs = (recs?.length ?? 0) > 0;
  const obsState = useAsync(
    () => (runId && hasRecs ? getObservations(brandKey, runId) : Promise.resolve(null)),
    [brandKey, runId, hasRecs],
  );
  const observations = useMemo(() => {
    const list: Observation[] = obsState.status === "ready" ? (obsState.data?.observations ?? []) : [];
    return list.length ? new Map(list.map((o) => [o.observation_id, o])) : null;
  }, [obsState]);
  const columns = useMemo(() => buildBoard(recs, gaps, entities, state), [recs, gaps, entities, state]);
  const groups = useMemo(
    () => groupSuggestions(recs ?? [], new Map((gaps ?? []).map((g) => [g.gap_id, g]))),
    [recs, gaps],
  );

  // One-time import of the old checklist's "done" ticks (localStorage). Runs once the board has
  // loaded (again if a retry turns "offline" into "ready"); storage is cleared only after a save.
  const migratedIn = useRef<BoardStatus | null>(null);
  useEffect(() => {
    if (status === "loading" || !latest || draftFailed || migratedIn.current === status) return;
    migratedIn.current = status;
    const m = migrateLegacyDone(brandKey, state, groups);
    if (!m) return;
    if (m.migrated.length === 0) {
      if (status === "ready") clearLegacyDone(brandKey);
      return;
    }
    commit(m.state)
      .then((r) => {
        if (r !== "saved") return;
        clearLegacyDone(brandKey);
        toast(t.n("board.toast.migrated", m.migrated.length));
      })
      .catch(() => {});
  }, [status, latest, draftFailed, brandKey, state, groups, commit, t]);

  const onStatus = useCallback(
    (key: string, to: BoardColumn) => {
      const next = setStatus(state, columns, key, to);
      if (next !== state) commit(next).catch(() => {});
    },
    [commit, state, columns],
  );

  // Campaign Studio: one list of this brand's campaigns, so each card can show "Open campaign".
  // Card statuses follow their campaigns (drafted → In progress, published → Done).
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const go = useTransitionNavigate();
  useEffect(() => {
    let cancelled = false;
    listCampaigns(brandKey)
      .then((list) => !cancelled && setCampaigns(list))
      .catch(() => !cancelled && setCampaigns([]));
    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  // Once per loaded list (a failed save reverts the board; retrying in a loop would hammer the API).
  const syncedFor = useRef<Campaign[] | null>(null);
  useEffect(() => {
    if (status !== "ready" || !latest || draftFailed || !campaigns?.length || syncedFor.current === campaigns) return;
    syncedFor.current = campaigns;
    const next = syncBoardWithCampaigns(state, columns, campaigns);
    if (next !== state) commit(next).catch(() => {});
  }, [status, latest, draftFailed, campaigns, state, columns, commit]);

  const campaignIndex = useMemo<CampaignIndexValue>(() => {
    const byKey = indexCampaigns(campaigns ?? []);
    return {
      find: (cardKey, recId) => byKey.get(cardKey) ?? (recId ? byKey.get(recId) : undefined) ?? null,
      creating,
      create: (cardKey, recId) => {
        if (creating) return;
        setCreating(cardKey);
        createCampaign(brandKey, recId)
          .then(({ campaign }) => {
            setCampaigns((prev) => [campaign, ...(prev ?? [])]);
            go(campaignHref(brandKey, campaign.campaign_id));
          })
          .catch((err: unknown) => toast(t("board.campaign.toast.createFailed", { error: err instanceof Error ? err.message : String(err) })))
          .finally(() => setCreating(null));
      },
    };
  }, [campaigns, creating, brandKey, go, t]);

  const onRemove = useCallback(
    (key: string) => {
      commit(removeCard(state, key)).catch(() => {});
    },
    [commit, state],
  );

  const hasCards = columns.some((c) => c.cards.length > 0);
  const runDate = latest ? shortDate(latest.collection_completed_at || latest.collection_started_at) : "";

  let body;
  if (!latest) body = <EmptyBoard brandKey={brandKey} noneFound={false} />;
  else if (draftFailed) body = <DraftFailed brandKey={brandKey} error={latest.recommendation_error} />;
  else if (status === "loading") body = <BoardSkeleton />;
  else if (!hasCards) body = <EmptyBoard brandKey={brandKey} noneFound />;
  else
    body = (
      <section className="board-section" aria-labelledby={headingId}>
        <div className="module-section-head">
          <div>
            <p className="eyebrow">{t("board.eyebrow")}</p>
            <h2 id={headingId}>{t("board.title")}</h2>
            <p>{t("board.intro")}</p>
          </div>
          {runDate && <p className="board-run">{t("board.meta.run", { date: runDate })}</p>}
        </div>
        {cap && (
          <p className="board-cap">
            {t("board.cap.line", { n: fmt.number(cap.n), total: fmt.number(cap.total) })}
            <InfoTip text={t("board.cap.tip")} label={t("board.cap.tipLabel")} />
          </p>
        )}
        {status === "offline" && (
          <p className="board-notice" role="status">
            <span className="board-notice-dot" aria-hidden="true" />
            {t("board.offline.notice")}{" "}
            <button type="button" className="btn-link" onClick={retry} disabled={retrying}>
              {retrying ? t("board.offline.retrying") : t("board.offline.retry")}
            </button>
          </p>
        )}
        <CampaignIndexContext.Provider value={campaignIndex}>
          <RecList
            columns={columns}
            brandKey={brandKey}
            runId={latest.run_id}
            entities={entities}
            labelOf={labelOf}
            observations={observations}
            campaignsReady={campaigns !== null}
            onStatus={onStatus}
            onRemove={onRemove}
          />
        </CampaignIndexContext.Provider>
      </section>
    );

  return (
    <ModuleShell id="recommendations">
      <div className="board-stack">
        <HowItWorks />
        <CampaignsStrip brandKey={brandKey} campaigns={campaigns} />
        {body}
      </div>
    </ModuleShell>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, getLatestSnapshot, getQuestions, getSnapshots, listBrands, listProviders } from "../api/client";
import type { Snapshot } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AdmissionBanner } from "../components/AdmissionBanner";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { GapList } from "../components/GapList";
import { MetricCards } from "../components/MetricCards";
import { ProviderTable } from "../components/ProviderTable";
import { RecommendationList } from "../components/RecommendationList";
import { RunPanel } from "../components/RunPanel";
import { TrendChart } from "../components/TrendChart";
import { HonestyBanners } from "../components/dashboard/Banners";
import { CompetitorBars } from "../components/dashboard/CompetitorBars";
import { NextSteps } from "../components/dashboard/NextSteps";
import { SampleAnswer } from "../components/dashboard/SampleAnswer";
import { ScoreHero } from "../components/dashboard/ScoreHero";
import { competitiveLeaderName, useListFormat, useProviderLabel } from "../components/dashboard/helpers";
import { evidenceHref } from "../format";
import { useFormat, useT } from "../i18n";
import { Details, DetailsToggle } from "../settings/details";

interface DashboardData {
  brandName: string | null;
  latest: Snapshot | null;
  history: Snapshot[];
}

async function loadDashboard(brandKey: string): Promise<DashboardData> {
  const latestP = getLatestSnapshot(brandKey).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  });
  const historyP = getSnapshots(brandKey).catch(() => [] as Snapshot[]);
  const [latest, history] = await Promise.all([latestP, historyP]);
  let brandName = latest?.brand ?? null;
  if (!brandName) {
    const brands = await listBrands().catch(() => []);
    brandName = brands.find((b) => b.brand_key === brandKey)?.brand ?? null;
  }
  return { brandName, latest, history };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv">
      <dt className="kv-label">{label}</dt>
      <dd className="kv-value">{children}</dd>
    </div>
  );
}

export function BrandDashboardPage() {
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  const location = useLocation();
  const t = useT();
  const fmt = useFormat();
  const list = useListFormat();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [highlightedGap, setHighlightedGap] = useState<string | null>(null);
  const [gapsForceOpen, setGapsForceOpen] = useState(false);
  const [nextSummary, setNextSummary] = useState<{ done: number; total: number } | null>(null);
  const [sampleAiName, setSampleAiName] = useState<string | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  const scrollTimer = useRef<number | undefined>(undefined);
  const handledHash = useRef<string | null>(null);

  // AI display names ("Google Gemini") and the current question set (for the
  // "questions changed" / "only N questions" banners and the run plan).
  const providersState = useAsync(listProviders, []);
  const providers = providersState.status === "ready" ? providersState.data : null;
  const questionsState = useAsync(() => getQuestions(brandKey), [brandKey, reload]);
  const questions = questionsState.status === "ready" ? questionsState.data : null;
  const labelOf = useProviderLabel(providers);

  // Keep showing the previous data while refreshing, so the run panel and
  // page don't flicker when a run completes.
  useEffect(() => {
    let cancelled = false;
    loadDashboard(brandKey)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [brandKey, reload]);

  const traceGap = useCallback((gapId: string) => {
    // Force the Gaps section open first, then wait for it to expand before scrolling to the card
    // — otherwise scrollIntoView measures a still-collapsed (zero-height) container.
    setGapsForceOpen(true);
    setHighlightedGap(gapId);
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      document.getElementById(`gap-${gapId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 260);
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setHighlightedGap(null), 3500);
  }, []);

  const handleNextSummary = useCallback((done: number, total: number) => {
    setNextSummary((prev) => (prev && prev.done === done && prev.total === total ? prev : { done, total }));
  }, []);

  // Deep link: /brands/x#gap-<id> scrolls to and highlights that gap once loaded (once per hash).
  const hasData = !!data?.latest;
  useEffect(() => {
    if (!hasData || !location.hash.startsWith("#gap-") || handledHash.current === location.hash) return;
    handledHash.current = location.hash;
    const id = decodeURIComponent(location.hash.slice(5));
    const timer = window.setTimeout(() => traceGap(id), 50);
    return () => window.clearTimeout(timer);
  }, [hasData, location.hash, traceGap]);

  useEffect(
    () => () => {
      window.clearTimeout(clearTimer.current);
      window.clearTimeout(scrollTimer.current);
    },
    [],
  );

  const onRunComplete = useCallback(() => setReload((n) => n + 1), []);

  const snapshot = data?.latest ?? null;
  const history = data?.history ?? [];
  const title = data ? (data.brandName ?? brandKey) : " ";
  const selfName = data?.brandName ?? brandKey;

  const idx = snapshot ? history.findIndex((s) => s.run_id === snapshot.run_id) : -1;
  const previous = idx > 0 ? history[idx - 1] : null;
  const askedIds = snapshot
    ? (snapshot.providers ?? snapshot.analysis_result.per_provider_coverage.map((p) => p.provider_id))
    : [];
  const unscoredCount = snapshot?.unscored_observation_count ?? 0;
  const analysisCount = history.length > 0 ? history.length : snapshot ? 1 : 0;
  const gapsCount = snapshot?.gaps?.length ?? 0;
  const leaderName = snapshot ? competitiveLeaderName(snapshot.mention_summary, snapshot.entities, selfName) : null;

  return (
    <div className="dash">
      {/* Navy top band, continuing seamlessly from the navy app header — light theme only; no
          effect at all in dark theme (see .dash-band, dashboard.css). */}
      <div className="on-band-light dash-band">
        <p className="crumbs">
          <Link to="/app">{t("dashboard.crumbs.back")}</Link>
        </p>
        <div className="page-head dash-head">
          <div>
            <h1>{title}</h1>
            {snapshot && (
              <p className="run-meta">
                {snapshot.data_origin === "synthetic"
                  ? t("dashboard.head.lastCheckedPractice", { when: fmt.relativeTime(snapshot.collection_completed_at) })
                  : t("dashboard.head.lastChecked", {
                      when: fmt.relativeTime(snapshot.collection_completed_at),
                      ais: list(askedIds.map(labelOf)),
                    })}
              </p>
            )}
          </div>
          <div className="page-head-actions">
            <Link to={`/brands/${encodeURIComponent(brandKey)}/questions`} className="btn btn-secondary">
              {t("dashboard.head.questions")}
            </Link>
            {snapshot && (
              <Link to={evidenceHref(brandKey, snapshot.run_id)} className="btn btn-secondary">
                {t("dashboard.head.answers")}
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {t("dashboard.error.load")}
            <Details>
              <p className="small" lang="en">
                {error}
              </p>
            </Details>
          </div>
        )}
        {!data && !error && <p className="status">{t("dashboard.loading")}</p>}

        {data && <HonestyBanners snapshot={snapshot} questions={questions} brandKey={brandKey} labelOf={labelOf} />}

        {data && !snapshot && (
          <div className="card empty-state dash-empty">
            <h2>{t("dashboard.empty.title")}</h2>
            <p>{t("dashboard.empty.body")}</p>
            <p className="muted">{t("dashboard.empty.body2")}</p>
          </div>
        )}

        {snapshot && <ScoreHero snapshot={snapshot} previous={previous} />}
      </div>

      {data && (
        <RunPanel
          brandKey={brandKey}
          providers={providers}
          questions={questions}
          hasData={!!snapshot}
          onComplete={onRunComplete}
        />
      )}

      {snapshot && (
        <>
          <CollapsibleSection id="trend" title={t("dashboard.trend.title")} summary={t.n("dashboard.trend.count", analysisCount)}>
            <div className="card">
              <TrendChart snapshots={history.length ? history : [snapshot]} currentRunId={snapshot.run_id} labelOf={labelOf} />
            </div>
          </CollapsibleSection>

          {/* Gaps are found by deterministic rules (DESIGN §5.1); technical fields show in the numbers view. */}
          <CollapsibleSection
            id="gaps"
            title={t("dashboard.gaps.title")}
            summary={t.n("dashboard.gaps.count", gapsCount)}
            forceOpen={gapsForceOpen}
          >
            <p className="section-note">{t("dashboard.gaps.intro")}</p>
            <GapList
              gaps={snapshot.gaps ?? []}
              brandKey={brandKey}
              runId={snapshot.run_id}
              entities={snapshot.entities}
              highlightedGapId={highlightedGap}
              labelOf={labelOf}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="next"
            title={t("dashboard.next.title")}
            summary={nextSummary && nextSummary.total > 0 ? t("dashboard.next.progress", nextSummary) : undefined}
          >
            <NextSteps
              recommendations={snapshot.recommendations ?? []}
              gaps={snapshot.gaps ?? []}
              brandKey={brandKey}
              runId={snapshot.run_id}
              entities={snapshot.entities}
              labelOf={labelOf}
              onSummaryChange={handleNextSummary}
            />
          </CollapsibleSection>

          <div className="dash-details-switch">
            <DetailsToggle variant="inline" />
          </div>
          <Details>
            <CollapsibleSection id="details" title={t("dashboard.details.title")}>
              <p className="section-note">{t("dashboard.details.intro")}</p>

              <dl className="card dash-facts">
                <Fact label={t("dashboard.details.runId")}>
                  <code>{snapshot.run_id}</code>
                </Fact>
                <Fact label={t("dashboard.details.checkedOn")}>{fmt.date(snapshot.collection_completed_at)}</Fact>
                <Fact label={t("dashboard.details.scored")}>{fmt.number(snapshot.observation_count)}</Fact>
                <Fact label={t("dashboard.details.mentioning")}>{fmt.number(snapshot.mentioned_count)}</Fact>
                <Fact label={t("dashboard.details.unscored")}>{fmt.number(unscoredCount)}</Fact>
                <Fact label={t("dashboard.details.clusters")}>{fmt.number(snapshot.cluster_count)}</Fact>
                <Fact label={t("dashboard.details.samples")}>
                  {fmt.number(snapshot.sampling_config?.samples_per_query ?? 0)}
                </Fact>
              </dl>

              <h3 className="dash-sub">{t("dashboard.details.metrics")}</h3>
              <MetricCards analysis={snapshot.analysis_result} />

              <h3 className="dash-sub">{t("dashboard.details.admission")}</h3>
              <AdmissionBanner admission={snapshot.admission} runStatus={snapshot.status} labelOf={labelOf} />

              <h3 className="dash-sub">{t("dashboard.details.perAi")}</h3>
              <div className="card card-flush">
                <ProviderTable providers={snapshot.analysis_result.per_provider_coverage ?? []} labelOf={labelOf} />
              </div>

              <h3 className="dash-sub">
                {t("dashboard.details.recs")} <span className="count">{snapshot.recommendations?.length ?? 0}</span>
              </h3>
              <p className="section-note">{t("dashboard.details.recsNote")}</p>
              <RecommendationList
                recommendations={snapshot.recommendations ?? []}
                gaps={snapshot.gaps ?? []}
                brandKey={brandKey}
                runId={snapshot.run_id}
                entities={snapshot.entities}
                onTraceGap={traceGap}
                labelOf={labelOf}
              />
            </CollapsibleSection>
          </Details>

          <CollapsibleSection id="landscape" title={t("dashboard.who.title")} summary={leaderName}>
            <CompetitorBars summary={snapshot.mention_summary} entities={snapshot.entities} selfName={selfName} />
          </CollapsibleSection>

          <CollapsibleSection id="sample" title={t("dashboard.sample.title")} summary={sampleAiName}>
            <SampleAnswer brandKey={brandKey} runId={snapshot.run_id} labelOf={labelOf} onSample={setSampleAiName} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, getLatestSnapshot, getQuestions, getSnapshots, listBrands, listProviders } from "../api/client";
import type { Snapshot } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AdmissionBanner } from "../components/AdmissionBanner";
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
import { useListFormat, useProviderLabel } from "../components/dashboard/helpers";
import { evidenceHref } from "../format";
import { useFormat, useT } from "../i18n";
import { Details, DetailsToggle, useDetails } from "../settings/details";

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
  const { showDetails, setShowDetails } = useDetails();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [highlightedGap, setHighlightedGap] = useState<string | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);
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
    setHighlightedGap(gapId);
    document.getElementById(`gap-${gapId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setHighlightedGap(null), 3500);
  }, []);

  // Deep link: /brands/x#gap-<id> turns on the numbers view (gaps live there) and
  // highlights that gap once loaded. Handled once per hash so the switch can be turned off again.
  const hasData = !!data?.latest;
  useEffect(() => {
    if (!hasData || !location.hash.startsWith("#gap-") || handledHash.current === location.hash) return;
    if (!showDetails) {
      setShowDetails(true);
      return;
    }
    handledHash.current = location.hash;
    const id = decodeURIComponent(location.hash.slice(5));
    const timer = window.setTimeout(() => traceGap(id), 50);
    return () => window.clearTimeout(timer);
  }, [hasData, location.hash, showDetails, setShowDetails, traceGap]);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const onRunComplete = useCallback(() => setReload((n) => n + 1), []);

  const snapshot = data?.latest ?? null;
  const history = data?.history ?? [];
  const title = data ? (data.brandName ?? brandKey) : " ";
  const shopName = data?.brandName ?? brandKey;

  const idx = snapshot ? history.findIndex((s) => s.run_id === snapshot.run_id) : -1;
  const previous = idx > 0 ? history[idx - 1] : null;
  const askedIds = snapshot
    ? (snapshot.providers ?? snapshot.analysis_result.per_provider_coverage.map((p) => p.provider_id))
    : [];
  const unscoredCount = snapshot?.unscored_observation_count ?? 0;

  return (
    <div className="dash">
      <p className="crumbs">
        <Link to="/">{t("dashboard.crumbs.back")}</Link>
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

      {snapshot && (
        <>
          <ScoreHero snapshot={snapshot} previous={previous} />

          <NextSteps
            recommendations={snapshot.recommendations ?? []}
            gaps={snapshot.gaps ?? []}
            brandKey={brandKey}
            runId={snapshot.run_id}
            entities={snapshot.entities}
            labelOf={labelOf}
          />

          <CompetitorBars summary={snapshot.mention_summary} entities={snapshot.entities} shopName={shopName} />

          <SampleAnswer brandKey={brandKey} runId={snapshot.run_id} labelOf={labelOf} />

          <section className="dash-section" aria-labelledby="trend-title">
            <h2 id="trend-title">{t("dashboard.trend.title")}</h2>
            <div className="card">
              <TrendChart snapshots={history.length ? history : [snapshot]} currentRunId={snapshot.run_id} labelOf={labelOf} />
            </div>
          </section>
        </>
      )}

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
          <div className="dash-details-switch">
            <DetailsToggle variant="inline" />
          </div>
          <Details>
            <section className="dash-details" aria-labelledby="details-title">
              <h2 id="details-title">{t("dashboard.details.title")}</h2>
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
                {t("dashboard.details.gaps")} <span className="count">{snapshot.gaps?.length ?? 0}</span>
              </h3>
              <p className="section-note">{t("dashboard.details.gapsNote")}</p>
              <GapList
                gaps={snapshot.gaps ?? []}
                brandKey={brandKey}
                runId={snapshot.run_id}
                entities={snapshot.entities}
                highlightedGapId={highlightedGap}
                labelOf={labelOf}
              />

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
            </section>
          </Details>
        </>
      )}
    </div>
  );
}

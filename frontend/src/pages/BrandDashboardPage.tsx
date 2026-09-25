import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, getLatestSnapshot, getSnapshots, listBrands } from "../api/client";
import type { Snapshot } from "../api/types";
import { AdmissionBanner } from "../components/AdmissionBanner";
import { GapList } from "../components/GapList";
import { MetricCards } from "../components/MetricCards";
import { OriginBanner } from "../components/OriginBanner";
import { ProviderTable } from "../components/ProviderTable";
import { RecommendationList } from "../components/RecommendationList";
import { RunPanel } from "../components/RunPanel";
import { TrendChart } from "../components/TrendChart";
import { evidenceHref, formatDate } from "../format";

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

export function BrandDashboardPage() {
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  const location = useLocation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [highlightedGap, setHighlightedGap] = useState<string | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);

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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard.");
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

  // Deep link: /brands/x#gap-<id> highlights that gap once loaded.
  const hasData = !!data?.latest;
  useEffect(() => {
    if (hasData && location.hash.startsWith("#gap-")) {
      const id = decodeURIComponent(location.hash.slice(5));
      const t = window.setTimeout(() => traceGap(id), 50);
      return () => window.clearTimeout(t);
    }
  }, [hasData, location.hash, traceGap]);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const onRunComplete = useCallback(() => setReload((n) => n + 1), []);

  const snapshot = data?.latest ?? null;
  const title = data ? (data.brandName ?? brandKey) : "\u00a0";

  return (
    <div>
      <p className="crumbs">
        <Link to="/">← All brands</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {snapshot && (
            <p className="run-meta">
              Latest run <code>{snapshot.run_id.slice(0, 8)}</code> · {formatDate(snapshot.collection_completed_at)} ·{" "}
              {(snapshot.providers ?? snapshot.analysis_result.per_provider_coverage.map((p) => p.provider_id)).join(", ")}{" "}
              · {snapshot.observation_count} answers ({snapshot.mentioned_count} mention the brand) ·{" "}
              {snapshot.cluster_count} question clusters
            </p>
          )}
        </div>
        <div className="page-head-actions">
          <Link to={`/brands/${encodeURIComponent(brandKey)}/questions`} className="btn btn-secondary">
            Questions asked
          </Link>
          {snapshot && (
            <Link to={evidenceHref(brandKey, snapshot.run_id)} className="btn btn-secondary">
              Browse all responses
            </Link>
          )}
        </div>
      </div>

      {snapshot && <OriginBanner origin={snapshot.data_origin} />}

      <RunPanel brandKey={brandKey} onComplete={onRunComplete} />

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <p className="status">Loading dashboard…</p>}

      {data && !snapshot && (
        <div className="card empty-state">
          <h3>No measurements yet</h3>
          <p className="muted">
            Run the first analysis above. With no API keys configured, the platform uses synthetic offline data
            so you can still see the full pipeline.
          </p>
        </div>
      )}

      {snapshot && (
        <>
          <AdmissionBanner admission={snapshot.admission} runStatus={snapshot.status} />

          <section>
            <h2>Visibility metrics</h2>
            <p className="section-note">Computed over unprompted questions only (the brand name is never in the question).</p>
            <MetricCards analysis={snapshot.analysis_result} />
          </section>

          <section>
            <h2>Trend</h2>
            <div className="card">
              <TrendChart snapshots={data?.history ?? [snapshot]} currentRunId={snapshot.run_id} />
            </div>
          </section>

          <section>
            <h2>Per-provider coverage</h2>
            <div className="card card-flush">
              <ProviderTable providers={snapshot.analysis_result.per_provider_coverage ?? []} />
            </div>
          </section>

          <section>
            <h2>
              Gaps <span className="count">{snapshot.gaps.length}</span>
            </h2>
            <p className="section-note">Detected by deterministic rules over the observations — no LLM involved.</p>
            <GapList
              gaps={snapshot.gaps ?? []}
              brandKey={brandKey}
              runId={snapshot.run_id}
              entities={snapshot.entities}
              highlightedGapId={highlightedGap}
            />
          </section>

          <section>
            <h2>
              Recommendations <span className="count">{snapshot.recommendations?.length ?? 0}</span>
            </h2>
            <p className="section-note">
              Ranked by priority. Every recommendation traces to a detected gap and the answers behind it.
            </p>
            <RecommendationList
              recommendations={snapshot.recommendations ?? []}
              gaps={snapshot.gaps ?? []}
              brandKey={brandKey}
              runId={snapshot.run_id}
              entities={snapshot.entities}
              onTraceGap={traceGap}
            />
          </section>
        </>
      )}
    </div>
  );
}

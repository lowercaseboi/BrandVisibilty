import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLatestSnapshot, getRuns } from "../api/client";
import { ApiError } from "../api/client";
import { useAsync } from "../api/useAsync";
import { MetricCards } from "../components/MetricCards";
import { ProviderTable } from "../components/ProviderTable";
import { GapList } from "../components/GapList";
import { AdmissionBanner } from "../components/AdmissionBanner";
import { RunHistory } from "../components/RunHistory";

type Tab = "latest" | "history";

export function BrandDashboardPage() {
  const { brandKey } = useParams<{ brandKey: string }>();
  const [tab, setTab] = useState<Tab>("latest");
  const state = useAsync(() => getLatestSnapshot(brandKey!), [brandKey]);

  if (state.status === "loading") return <p className="status">Loading snapshot…</p>;

  if (state.status === "error") {
    const message =
      state.error instanceof ApiError && state.error.status === 404
        ? "No snapshot data for this brand yet."
        : "Failed to load snapshot.";
    return <p className="status status-error">{message}</p>;
  }

  const snapshot = state.data;

  return (
    <div>
      <p>
        <Link to="/">← All brands</Link>
      </p>
      <h1>{snapshot.brand}</h1>
      <p className="run-meta">
        Run {snapshot.run_id} · {new Date(snapshot.collection_completed_at).toLocaleString()} ·{" "}
        {snapshot.observation_count} observations ({snapshot.mentioned_count} mentioned,{" "}
        {snapshot.cluster_count} clusters)
      </p>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === "latest" ? "tab tab-active" : "tab"}
          aria-selected={tab === "latest"}
          onClick={() => setTab("latest")}
        >
          Latest run
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "history" ? "tab tab-active" : "tab"}
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
        >
          Run history
        </button>
      </div>

      {tab === "latest" ? (
        <>
          <AdmissionBanner admission={snapshot.admission} />
          <MetricCards analysis={snapshot.analysis_result} />

          <section>
            <h2>Per-provider breakdown</h2>
            <ProviderTable providers={snapshot.analysis_result.per_provider_coverage} />
          </section>

          <section>
            <h2>Gaps ({snapshot.gaps.length})</h2>
            <GapList gaps={snapshot.gaps} />
          </section>
        </>
      ) : (
        <RunHistorySection brandKey={brandKey!} />
      )}
    </div>
  );
}

function RunHistorySection({ brandKey }: { brandKey: string }) {
  const state = useAsync(() => getRuns(brandKey), [brandKey]);

  if (state.status === "loading") return <p className="status">Loading run history…</p>;
  if (state.status === "error") return <p className="status status-error">Failed to load run history.</p>;

  return (
    <section>
      <h2>All runs ({state.data.length})</h2>
      <RunHistory runs={state.data} />
    </section>
  );
}

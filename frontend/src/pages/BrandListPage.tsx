import { useState } from "react";
import { Link } from "react-router-dom";
import { getLatestSnapshot, listBrands } from "../api/client";
import type { BrandSummary } from "../api/types";
import { useAsync } from "../api/useAsync";
import { AddBrandForm } from "../components/AddBrandForm";
import { formatDate, pct } from "../format";

function BrandCard({ brand }: { brand: BrandSummary }) {
  const latest = useAsync(
    () => (brand.has_data ? getLatestSnapshot(brand.brand_key) : Promise.resolve(null)),
    [brand.brand_key, brand.has_data],
  );
  const snap = latest.status === "ready" ? latest.data : null;

  return (
    <Link to={`/brands/${encodeURIComponent(brand.brand_key)}`} className="card brand-card">
      <div className="brand-card-top">
        <h3>{brand.brand}</h3>
        {brand.is_pilot && <span className="badge badge-accent">Pilot</span>}
      </div>
      <code className="muted small">{brand.brand_key}</code>
      <div className="brand-card-body">
        {!brand.has_data ? (
          <span className="status-dot status-dot-idle">No runs yet — open to run analysis</span>
        ) : snap ? (
          <>
            <div className="brand-card-score">
              <span className="brand-card-score-value">{pct(snap.analysis_result.composite_score)}</span>
              <span className="muted small">
                composite · CI {pct(snap.analysis_result.ci_low, 0)}–{pct(snap.analysis_result.ci_high, 0)}
              </span>
            </div>
            <span className="muted small">
              Last run {formatDate(snap.collection_completed_at)}
              {snap.data_origin && snap.data_origin !== "live" && (
                <span className={`badge badge-${snap.data_origin} badge-inline`}>{snap.data_origin}</span>
              )}
            </span>
          </>
        ) : (
          <span className="status-dot status-dot-ok">Has tracking data</span>
        )}
      </div>
    </Link>
  );
}

export function BrandListPage() {
  const [reload, setReload] = useState(0);
  const state = useAsync(listBrands, [reload]);
  const [q, setQ] = useState("");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Brands</h1>
          <p className="lede">
            Each brand is tracked by asking LLMs unprompted category questions (e.g. "best vada pav in
            Mumbai?") and measuring whether, and how prominently, the brand is mentioned.
          </p>
        </div>
      </div>

      {state.status === "loading" && <p className="status">Loading brands…</p>}
      {state.status === "error" && (
        <div className="alert alert-error">
          Failed to load brands. {state.error instanceof Error ? state.error.message : ""}
        </div>
      )}
      {state.status === "ready" &&
        (state.data.length === 0 ? (
          <p className="empty">No brands yet — add one below.</p>
        ) : (
          <>
          {state.data.length > 3 && (
            <input
              className="search-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter brands…"
              aria-label="Filter brands"
            />
          )}
          <div className="brand-grid">
            {state.data.filter((b) => `${b.brand} ${b.brand_key}`.toLowerCase().includes(q.trim().toLowerCase())).map((b) => (
              <BrandCard key={b.brand_key} brand={b} />
            ))}
          </div>
          </>
        ))}

      <section>
        <h2>Add a brand</h2>
        <AddBrandForm onCreated={() => setReload((n) => n + 1)} />
      </section>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { Gap } from "../api/types";

function scopeLabel(gap: Gap): string {
  const scope = gap.detail.scope;
  if (scope === "provider") return `Provider: ${gap.detail.provider_id}`;
  if (scope === "intent") return `Intent: ${gap.detail.intent_type}`;
  if (scope === "overall") return "Overall";
  return String(scope ?? "—");
}

function detailCoverage(gap: Gap): number | undefined {
  const coverage = gap.detail.coverage;
  return typeof coverage === "number" ? coverage : undefined;
}

function detailProviderId(gap: Gap): string | undefined {
  const providerId = gap.detail.provider_id;
  return typeof providerId === "string" ? providerId : undefined;
}

export function GapList({ gaps }: { gaps: Gap[] }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [query, setQuery] = useState("");

  const gapTypes = useMemo(() => Array.from(new Set(gaps.map((g) => g.gap_type))).sort(), [gaps]);
  const providers = useMemo(
    () => Array.from(new Set(gaps.map(detailProviderId).filter((p): p is string => !!p))).sort(),
    [gaps]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gaps.filter((gap) => {
      if (typeFilter !== "all" && gap.gap_type !== typeFilter) return false;
      if (providerFilter !== "all" && detailProviderId(gap) !== providerFilter) return false;
      if (q && !`${gap.gap_type} ${scopeLabel(gap)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gaps, typeFilter, providerFilter, query]);

  if (gaps.length === 0) {
    return <p className="empty">No gaps detected.</p>;
  }

  return (
    <div>
      <div className="gap-filters">
        <input
          type="search"
          className="search-box"
          placeholder="Filter gaps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter gaps by text"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by gap type">
          <option value="all">All types</option>
          {gapTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {providers.length > 0 && (
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            aria-label="Filter by provider"
          >
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No gaps match the current filters.</p>
      ) : (
        <ul className="gap-list">
          {filtered.map((gap, i) => {
            const coverage = detailCoverage(gap);
            return (
              <li key={i} className="gap-item">
                <span className="gap-type">{gap.gap_type}</span>
                <span className="gap-scope">{scopeLabel(gap)}</span>
                {coverage !== undefined && (
                  <span className="gap-coverage">{(coverage * 100).toFixed(1)}% coverage</span>
                )}
                <span className="gap-evidence">{gap.evidence_refs.length} evidence refs</span>
                {gap.is_inferred && <span className="gap-inferred">inferred</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="gap-filter-summary">
        Showing {filtered.length} of {gaps.length} gaps
      </p>
    </div>
  );
}

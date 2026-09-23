import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listBrands } from "../api/client";
import { useAsync } from "../api/useAsync";

export function BrandListPage() {
  const state = useAsync(listBrands, []);
  const [query, setQuery] = useState("");

  if (state.status === "loading") return <p className="status">Loading brands…</p>;
  if (state.status === "error") return <p className="status status-error">Failed to load brands.</p>;

  return <BrandList brands={state.data} query={query} onQueryChange={setQuery} />;
}

function BrandList({
  brands,
  query,
  onQueryChange,
}: {
  brands: { brand_key: string; brand: string; has_data: boolean }[];
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.brand.toLowerCase().includes(q));
  }, [brands, query]);

  return (
    <div>
      <h1>Brands</h1>
      <input
        type="search"
        className="search-box"
        placeholder="Search brands…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search brands"
      />
      {filtered.length === 0 ? (
        <p className="empty">No brands match “{query}”.</p>
      ) : (
        <ul className="brand-list">
          {filtered.map((b) => (
            <li key={b.brand_key}>
              {b.has_data ? (
                <Link to={`/brands/${b.brand_key}`}>{b.brand}</Link>
              ) : (
                <span className="brand-no-data" title="No tracking data yet">
                  {b.brand} (no data)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

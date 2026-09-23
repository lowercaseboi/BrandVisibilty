import { Link } from "react-router-dom";
import { listBrands } from "../api/client";
import { useAsync } from "../api/useAsync";

export function BrandListPage() {
  const state = useAsync(listBrands, []);

  if (state.status === "loading") return <p className="status">Loading brands…</p>;
  if (state.status === "error") return <p className="status status-error">Failed to load brands.</p>;

  return (
    <div>
      <h1>Brands</h1>
      <ul className="brand-list">
        {state.data.map((b) => (
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
    </div>
  );
}

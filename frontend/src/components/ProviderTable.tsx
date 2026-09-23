import type { ProviderBreakdown } from "../api/types";
import { pct } from "../format";

export function ProviderTable({ providers }: { providers: ProviderBreakdown[] }) {
  if (providers.length === 0) {
    return <p className="empty pad">No provider data.</p>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Provider</th>
          <th>Coverage</th>
          <th className="num">Answers</th>
          <th className="num">Mention brand</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.provider_id}>
            <td>
              <strong>{p.provider_id}</strong>
            </td>
            <td>
              <div className="bar-cell">
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, p.coverage * 100)}%` }} />
                </div>
                <span>{pct(p.coverage)}</span>
              </div>
            </td>
            <td className="num">{p.observation_count}</td>
            <td className="num">{p.mentioned_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

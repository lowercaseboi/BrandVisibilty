import type { ProviderBreakdown } from "../api/types";

export function ProviderTable({ providers }: { providers: ProviderBreakdown[] }) {
  if (providers.length === 0) {
    return <p className="empty">No provider data.</p>;
  }

  return (
    <table className="provider-table">
      <thead>
        <tr>
          <th>Provider</th>
          <th>Coverage</th>
          <th>Observations</th>
          <th>Mentioned</th>
        </tr>
      </thead>
      <tbody>
        {providers.map((p) => (
          <tr key={p.provider_id}>
            <td>{p.provider_id}</td>
            <td>{(p.coverage * 100).toFixed(1)}%</td>
            <td>{p.observation_count}</td>
            <td>{p.mentioned_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import type { DataOrigin } from "../api/types";

export function OriginBanner({ origin }: { origin?: DataOrigin }) {
  if (origin === "synthetic") {
    return (
      <div className="alert alert-synthetic">
        <strong>Synthetic demo data</strong> — generated offline, not a real measurement.
      </div>
    );
  }
  if (origin === "replay") {
    return (
      <div className="alert alert-replay">
        <strong>Replayed recorded responses</strong> — real LLM answers captured earlier and re-scored offline.
      </div>
    );
  }
  return null;
}

import { useEffect, useState } from "react";

type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

// Re-runs whenever any value in deps changes, by identity — same contract as useEffect.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });

  // Deps are supplied by the caller (same contract as useEffect's own array) and re-run this
  // effect by identity; `fn` is intentionally excluded so callers don't need to memoize it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fn()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
    };
    // deps is a caller-supplied array (not a literal), so this can't be statically verified.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

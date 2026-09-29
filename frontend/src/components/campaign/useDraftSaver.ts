import { useCallback, useEffect, useRef, useState } from "react";
import { sameValue } from "./campaignModel";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const DELAY_MS = 700;

/**
 * Debounced autosave for small patch objects keyed by id (a channel, a deliverable index). Local
 * edits sit in `drafts` (shown over the server copy) until the save lands; fields the user changed
 * again while it was in flight stay as drafts, so typing is never overwritten by a response.
 */
export function useDraftSaver<P extends object>(save: (key: string, patch: P) => Promise<void>) {
  const [drafts, setDrafts] = useState<Record<string, P>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const draftsRef = useRef(drafts);
  const timers = useRef(new Map<string, number>());
  const inflight = useRef(new Map<string, Promise<void>>());
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const setState = (key: string, s: SaveState) => setStates((prev) => (prev[key] === s ? prev : { ...prev, [key]: s }));

  const commitDrafts = (next: Record<string, P>) => {
    draftsRef.current = next;
    setDrafts(next);
  };

  const flush = useCallback(async (key: string): Promise<void> => {
    const timer = timers.current.get(key);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(key);
    }
    await inflight.current.get(key);
    const sent = draftsRef.current[key];
    if (!sent || Object.keys(sent).length === 0) return;
    setState(key, "saving");
    const run = (async () => {
      try {
        await saveRef.current(key, sent);
        // Drop the fields that went out unchanged; keep anything typed since.
        const cur = draftsRef.current[key] ?? ({} as P);
        const rest = Object.fromEntries(
          Object.entries(cur).filter(([f, v]) => !sameValue(v, (sent as Record<string, unknown>)[f])),
        ) as P;
        const next = { ...draftsRef.current };
        if (Object.keys(rest).length) next[key] = rest;
        else delete next[key];
        commitDrafts(next);
        setState(key, Object.keys(rest).length ? "pending" : "saved");
      } catch {
        setState(key, "error");
      }
    })();
    inflight.current.set(key, run);
    await run;
    if (inflight.current.get(key) === run) inflight.current.delete(key);
  }, []);

  const edit = useCallback(
    (key: string, patch: P) => {
      commitDrafts({ ...draftsRef.current, [key]: { ...(draftsRef.current[key] ?? ({} as P)), ...patch } });
      setState(key, "pending");
      const old = timers.current.get(key);
      if (old !== undefined) window.clearTimeout(old);
      timers.current.set(
        key,
        window.setTimeout(() => {
          timers.current.delete(key);
          void flush(key);
        }, DELAY_MS),
      );
    },
    [flush],
  );

  /** Save everything now (before approving, or leaving the page). */
  const flushAll = useCallback(async () => {
    const keys = new Set([...Object.keys(draftsRef.current), ...timers.current.keys()]);
    await Promise.all([...keys].map((k) => flush(k)));
  }, [flush]);

  /** Forget unsaved edits (e.g. the campaign was replaced). */
  const reset = useCallback(() => {
    for (const t of timers.current.values()) window.clearTimeout(t);
    timers.current.clear();
    commitDrafts({});
    setStates({});
  }, []);

  // Save pending edits when the page goes away.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const [key, timer] of t) {
        window.clearTimeout(timer);
        const sent = draftsRef.current[key];
        if (sent) void saveRef.current(key, sent).catch(() => {});
      }
      t.clear();
    };
  }, []);

  const dirty = Object.keys(drafts).length > 0 || Object.values(states).some((s) => s === "saving");
  return { drafts, states, edit, flush, flushAll, reset, dirty };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getBoard, saveBoard } from "../../api/client";
import type { BoardState } from "../../api/types";
import { useT } from "../../i18n";
import { toast } from "../Toaster";
import { emptyBoardState } from "./boardModel";

/**
 * "loading" until the first GET answers; "ready" when the saved board loaded (moves are saved);
 * "offline" when it couldn't be loaded (endpoint missing or failing) — the board then starts empty
 * and moves stay local, because saving over a board we never read could wipe it.
 */
export type BoardStatus = "loading" | "ready" | "offline";

/** Resolves "saved" once the change (or a newer one) is stored, "local" when offline; rejects when
 * the save failed (the board has then already rolled back and shown a toast). */
export type CommitResult = "saved" | "local";

interface Waiter {
  resolve(r: CommitResult): void;
  reject(e: unknown): void;
}

interface Pending {
  state: BoardState;
  waiters: Waiter[];
}

function normalize(b: BoardState | null | undefined, brandKey: string): BoardState {
  const cards = b && typeof b.cards === "object" && b.cards ? b.cards : {};
  return { brand_key: brandKey, cards };
}

/**
 * The brand's saved board, with optimistic saves. Saves go out one at a time and coalesce (only
 * the newest pending state is sent — each PUT carries the whole board), so rapid moves can't
 * arrive out of order. If the newest save fails, the board rolls back to the last saved state.
 */
export function useBoardState(brandKey: string) {
  const t = useT();
  const [state, setState] = useState<BoardState>(() => emptyBoardState(brandKey));
  const [status, setStatus] = useState<BoardStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const statusRef = useRef<BoardStatus>("loading");
  const lastSaved = useRef<BoardState>(emptyBoardState(brandKey));
  const pending = useRef<Pending | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getBoard(brandKey)
      .then((b) => {
        if (cancelled) return;
        const clean = normalize(b, brandKey);
        lastSaved.current = clean;
        statusRef.current = "ready";
        setState(clean);
        setStatus("ready");
        setRetrying(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRetrying(false);
        if (statusRef.current === "ready") return;
        statusRef.current = "offline";
        setStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [brandKey, attempt]);

  const flush = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    while (pending.current) {
      const { state: next, waiters } = pending.current;
      pending.current = null;
      try {
        await saveBoard(brandKey, next);
        lastSaved.current = next;
        for (const w of waiters) w.resolve("saved");
      } catch (err) {
        // (Read through a cast: TS still thinks it's null from the line above, but commit() may
        // have queued a newer board while this save was in flight.)
        const queued = pending.current as Pending | null;
        if (queued) {
          // The newer board carries this change too; let its save settle these waiters.
          queued.waiters.unshift(...waiters);
          continue;
        }
        setState(lastSaved.current);
        toast(t("board.toast.saveFailed"));
        for (const w of waiters) w.reject(err);
      }
    }
    inflight.current = false;
  }, [brandKey, t]);

  /** Show `next` now and save it (unless offline). */
  const commit = useCallback(
    (next: BoardState): Promise<CommitResult> => {
      setState(next);
      if (statusRef.current !== "ready") return Promise.resolve("local");
      return new Promise<CommitResult>((resolve, reject) => {
        pending.current = { state: next, waiters: [...(pending.current?.waiters ?? []), { resolve, reject }] };
        void flush();
      });
    },
    [flush],
  );

  /** Offline only: try loading the saved board again (it replaces the local, unsaved one). */
  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt((n) => n + 1);
  }, []);

  return { state, status, retrying, commit, retry };
}

import { useCallback, useState } from "react";

// One place for "remember this on/off choice": a "1"/"0" flag in localStorage that never throws
// (private windows, blocked storage). Replaces the hand-rolled copies in the collapsible sections,
// the board's how-it-works panel and the numbers-view toggle.

/** Reads a stored flag; anything other than "1"/"0" (or unavailable storage) gives `fallback`. */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

export function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

/** useState for a boolean that survives reloads. */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => readFlag(key, fallback));
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      writeFlag(key, v);
    },
    [key],
  );
  return [value, set];
}

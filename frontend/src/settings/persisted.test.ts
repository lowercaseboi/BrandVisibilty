import { afterEach, describe, expect, it, vi } from "vitest";
import { readFlag, writeFlag } from "./persisted";

function stubStorage(store: Record<string, string>) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => void (store[k] = v),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("persisted flags", () => {
  it("round-trips true and false", () => {
    const store: Record<string, string> = {};
    stubStorage(store);
    writeFlag("k", true);
    expect(store.k).toBe("1");
    expect(readFlag("k", false)).toBe(true);
    writeFlag("k", false);
    expect(readFlag("k", true)).toBe(false);
  });

  it("uses the fallback for missing or garbage values", () => {
    stubStorage({ junk: "yes" });
    expect(readFlag("missing", true)).toBe(true);
    expect(readFlag("junk", false)).toBe(false);
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readFlag("k", true)).toBe(true);
    expect(() => writeFlag("k", true)).not.toThrow();
  });
});

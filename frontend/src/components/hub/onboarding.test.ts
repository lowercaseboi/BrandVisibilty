import { describe, expect, it } from "vitest";
import type { AccountStatus, BrandProfile, Campaign, Snapshot } from "../../api/types";
import { deriveChecklist, firstPublishedAt, profileComplete } from "./onboarding";

const profile: BrandProfile = {
  brand_key: "gvp",
  brand: "Gajanan Vada Pav",
  is_pilot: false,
  category: "street food",
  cities: ["Pune"],
  competitors: ["Joshi Vadewale"],
  aliases: [],
  audiences: ["students"],
  jobs_to_be_done: [],
};

const snap = (at: string) => ({ collection_started_at: at, collection_completed_at: at }) as Snapshot;
const account = (state: AccountStatus["state"]) => ({ channel: "facebook_page", state }) as AccountStatus;
const campaign = (over: Partial<Campaign>): Campaign =>
  ({ campaign_id: "c1", status: "ready", updated_at: "2026-09-01T00:00:00Z", events: [], ...over }) as Campaign;

const base = { brandKey: "gvp", profile: null, history: [], accounts: null, campaigns: null };

describe("onboarding checklist", () => {
  it("a new brand starts at the profile step", () => {
    const c = deriveChecklist(base);
    expect(c.doneCount).toBe(0);
    expect(c.current).toBe("profile");
    expect(c.steps.map((s) => s.href)).toEqual([
      "/brands/gvp/details#profile",
      "/brands/gvp/details#accounts",
      "/brands/gvp/analysis",
      "/brands/gvp/recommendations",
      "/brands/gvp/analysis",
    ]);
  });

  it("profile needs category, a city, a competitor and an audience", () => {
    expect(profileComplete(profile)).toBe(true);
    expect(profileComplete({ ...profile, audiences: [] })).toBe(false);
    expect(profileComplete({ ...profile, category: "  " })).toBe(false);
    expect(profileComplete(null)).toBe(false);
  });

  it("accounts count only when one is actually connected", () => {
    expect(deriveChecklist({ ...base, accounts: [account("expired")] }).steps[1].done).toBe(false);
    expect(deriveChecklist({ ...base, accounts: [account("connected")] }).steps[1].done).toBe(true);
  });

  it("campaign links to the newest unfinished draft", () => {
    const c = deriveChecklist({
      ...base,
      campaigns: [campaign({ campaign_id: "old" }), campaign({ campaign_id: "new", updated_at: "2026-09-10T00:00:00Z" })],
    });
    expect(c.steps[3]).toMatchObject({ done: false, href: "/brands/gvp/recommendations/new" });
  });

  it("measure is done only by an analysis started after the first publish", () => {
    const published = campaign({
      status: "published",
      events: [{ outcome: "published", at: "2026-09-05T00:00:00Z" } as Campaign["events"][number]],
    });
    expect(firstPublishedAt([published])).toBe(Date.parse("2026-09-05T00:00:00Z"));
    const before = deriveChecklist({ ...base, profile, accounts: [account("connected")], history: [snap("2026-09-01T00:00:00Z")], campaigns: [published] });
    expect(before.current).toBe("measure");
    expect(before.doneCount).toBe(4);
    const after = deriveChecklist({
      ...base,
      profile,
      accounts: [account("connected")],
      history: [snap("2026-09-01T00:00:00Z"), snap("2026-09-08T00:00:00Z")],
      campaigns: [published],
    });
    expect(after.current).toBeNull();
    expect(after.doneCount).toBe(5);
  });

  it("a published campaign without events still counts, from its last update", () => {
    expect(firstPublishedAt([campaign({ status: "partially_published", updated_at: "2026-09-03T00:00:00Z" })])).toBe(Date.parse("2026-09-03T00:00:00Z"));
    expect(firstPublishedAt([campaign({ status: "failed" })])).toBeNull();
  });
});

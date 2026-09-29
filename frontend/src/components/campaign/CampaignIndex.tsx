/* oxlint-disable react/only-export-components -- provider, hook and pure helpers belong together */
import { createContext, useContext } from "react";
import type { BoardState, Campaign } from "../../api/types";
import { setStatus } from "../board/boardModel";
import type { BoardColumnView } from "../board/boardModel";
import { brandHref } from "../module/modules";

/** The studio for one campaign: `/brands/<key>/recommendations/<campaignId>`. */
export function campaignHref(brandKey: string, campaignId: string): string {
  return `${brandHref(brandKey, "recommendations")}/${encodeURIComponent(campaignId)}`;
}

/** Newest campaign per board card key (suggestion_key) and per recommendation id. */
export function indexCampaigns(campaigns: Campaign[]): Map<string, Campaign> {
  const out = new Map<string, Campaign>();
  const newest = [...campaigns].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  for (const c of newest) {
    if (c.suggestion_key && !out.has(c.suggestion_key)) out.set(c.suggestion_key, c);
    if (c.recommendation_id && !out.has(c.recommendation_id)) out.set(c.recommendation_id, c);
  }
  return out;
}

/**
 * Card statuses follow their campaigns, forwards only: a drafted campaign moves a Suggested / Saved
 * card to In progress; a (partly) published one moves it to Done. Rejected or already-done cards
 * are never touched. Returns `state` itself when nothing changes.
 */
export function syncBoardWithCampaigns(state: BoardState, columns: BoardColumnView[], campaigns: Campaign[]): BoardState {
  let next = state;
  let cols = columns;
  const byKey = indexCampaigns(campaigns);
  for (const col of columns) {
    for (const card of col.cards) {
      const c = byKey.get(card.key);
      if (!c) continue;
      const published = c.status === "published" || c.status === "partially_published";
      let to: BoardColumnView["id"] | null = null;
      if (published && card.column !== "done" && card.column !== "rejected") to = "done";
      else if (!published && (card.column === "suggested" || card.column === "saved")) to = "in_progress";
      if (!to) continue;
      const moved = setStatus(next, cols, card.key, to);
      if (moved !== next) {
        next = moved;
        // Keep `cols` consistent with `next` for the following moves.
        cols = cols.map((cv) => ({
          ...cv,
          cards:
            cv.id === to
              ? [...cv.cards.filter((x) => x.key !== card.key), { ...card, column: to }]
              : cv.cards.filter((x) => x.key !== card.key),
        }));
      }
    }
  }
  return next;
}

export interface CampaignIndexValue {
  /** Campaign for a card key or recommendation id. */
  find(cardKey: string, recommendationId: string | null): Campaign | null;
  /** Card key currently being created (button shows a spinner). */
  creating: string | null;
  create(cardKey: string, recommendationId: string): void;
}

export const CampaignIndexContext = createContext<CampaignIndexValue | null>(null);

/** null outside the recommendations module (e.g. a card rendered elsewhere): no campaign button then. */
export function useCampaignIndex(): CampaignIndexValue | null {
  return useContext(CampaignIndexContext);
}

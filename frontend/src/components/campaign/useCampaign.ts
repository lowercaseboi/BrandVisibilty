import { useCallback, useEffect, useRef, useState } from "react";
import { getCampaign, getJob } from "../../api/client";
import type { Campaign, Job } from "../../api/types";

const POLL_MS = 1500;
const TERMINAL = new Set(["completed", "partial", "failed", "cancelled", "interrupted"]);

export interface CampaignState {
  campaign: Campaign | null;
  /** The generation job while drafting (progress message), else null. */
  job: Job | null;
  error: unknown;
  loading: boolean;
  setCampaign(c: Campaign): void;
  reload(): Promise<void>;
}

interface Loaded {
  id: string;
  campaign: Campaign | null;
  error: unknown;
}

/**
 * One campaign, kept fresh while it is generating: polls its job (GET /jobs/{id}) until the job
 * ends, then refetches the campaign; without a job id it polls the campaign itself.
 */
export function useCampaign(brandKey: string, campaignId: string): CampaignState {
  const id = `${brandKey}/${campaignId}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const current = useRef(id);

  useEffect(() => {
    current.current = id;
  }, [id]);

  // State from an earlier campaign (route param changed) is never shown.
  const mine = loaded?.id === id ? loaded : null;
  const campaign = mine?.campaign ?? null;

  const setCampaign = useCallback(
    (c: Campaign) => {
      if (current.current === id) setLoaded({ id, campaign: c, error: null });
    },
    [id],
  );

  const reload = useCallback(async () => {
    try {
      const c = await getCampaign(brandKey, campaignId);
      if (current.current === id) setLoaded({ id, campaign: c, error: null });
    } catch (error) {
      if (current.current === id) setLoaded((prev) => ({ id, campaign: prev?.id === id ? prev.campaign : null, error }));
    }
  }, [brandKey, campaignId, id]);

  useEffect(() => {
    let cancelled = false;
    getCampaign(brandKey, campaignId)
      .then((c) => !cancelled && setLoaded({ id, campaign: c, error: null }))
      .catch((error: unknown) => !cancelled && setLoaded({ id, campaign: null, error }));
    return () => {
      cancelled = true;
    };
  }, [brandKey, campaignId, id]);

  const generating = campaign?.status === "generating";
  const jobId = campaign?.job_id ?? null;

  useEffect(() => {
    if (!generating) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        if (jobId) {
          const j = await getJob(jobId);
          if (cancelled) return;
          setJob(j);
          // The campaign may lag its job by a moment; the next tick checks again.
          if (TERMINAL.has(j.status)) await reload();
        } else {
          await reload();
        }
      } catch {
        // Job endpoint gone (server restart): fall back to the campaign's own status.
        await reload();
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [generating, jobId, reload]);

  return {
    campaign,
    job: generating || campaign?.status === "failed" ? job : null,
    error: mine?.error ?? null,
    loading: mine === null,
    setCampaign,
    reload,
  };
}

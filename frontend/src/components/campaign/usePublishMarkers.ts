import { useEffect, useState } from "react";
import { listCampaigns } from "../../api/client";
import { publishMarkers } from "./trendMarkers";
import type { PublishMarker } from "./trendMarkers";

/** Published-campaign markers for the trend chart (empty until loaded, or when the API has none). */
export function usePublishMarkers(brandKey: string): PublishMarker[] {
  const [markers, setMarkers] = useState<PublishMarker[]>([]);
  useEffect(() => {
    let cancelled = false;
    listCampaigns(brandKey)
      .then((list) => !cancelled && setMarkers(publishMarkers(list)))
      .catch(() => !cancelled && setMarkers([]));
    return () => {
      cancelled = true;
    };
  }, [brandKey]);
  return markers;
}

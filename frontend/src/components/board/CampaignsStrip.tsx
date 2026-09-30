import { useId } from "react";
import type { Campaign } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import { campaignHref } from "../campaign/CampaignIndex";
import { channelName, statusView } from "../campaign/campaignModel";
import { useListFormat } from "../dashboard/helpers";
import { TransitionLink } from "../module/transition";

/**
 * "Your campaigns": every campaign for this brand, newest first — status, channels switched on,
 * when it last changed and a link back into the Studio — so a draft is never lost.
 */
export function CampaignsStrip({ brandKey, campaigns }: { brandKey: string; campaigns: Campaign[] | null }) {
  const t = useT();
  const fmt = useFormat();
  const headingId = useId();
  const listFmt = useListFormat();
  if (!campaigns?.length) return null;
  const list = [...campaigns].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return (
    <section className="cs-strip-wrap" aria-labelledby={headingId}>
      <div className="module-section-head">
        <div>
          <h2 id={headingId}>{t("board.campaigns.title")}</h2>
          <p>{t("board.campaigns.intro")}</p>
        </div>
      </div>
      <ul className="cs-cards">
        {list.map((c) => {
          const sv = statusView(c.status);
          const on = c.variants.filter((v) => v.enabled).map((v) => channelName(v.channel));
          const title = c.headline || c.action;
          return (
            <li key={c.campaign_id} className="card cs-mini">
              <span className="status-pill" data-tone={sv.tone}>
                {t(sv.key)}
              </span>
              <strong className="cs-mini-title">{title}</strong>
              <span className="muted small">{on.length ? listFmt(on) : t("board.campaigns.noChannels")}</span>
              <span className="muted small">
                <time dateTime={c.updated_at} title={c.updated_at}>
                  {t("board.campaigns.updated", { when: fmt.relativeTime(c.updated_at) || c.updated_at })}
                </time>
              </span>
              <TransitionLink
                to={campaignHref(brandKey, c.campaign_id)}
                className="btn btn-secondary btn-small"
                aria-label={t("board.campaigns.openLabel", { title })}
              >
                {t("board.campaigns.open")} <span aria-hidden="true">→</span>
              </TransitionLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

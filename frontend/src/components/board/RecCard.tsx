import { useId, useMemo, useState } from "react";
import { BOARD_COLUMNS } from "../../api/types";
import type { BoardColumn, Observation } from "../../api/types";
import { T, useFormat, useT } from "../../i18n";
import { Details } from "../../settings/details";
import { InfoTip } from "../InfoTip";
import { actionCopy } from "../dashboard/actions";
import { campaignHref, useCampaignIndex } from "../campaign/CampaignIndex";
import { statusView } from "../campaign/campaignModel";
import { effortLevel, gapFinding, gapTypeText, humanizeId } from "../dashboard/helpers";
import { gapsHref } from "../module/modules";
import { TransitionLink } from "../module/transition";
import type { BoardCard } from "./boardModel";
import { CLASS_LABEL, STATUS_LABEL } from "./columns";
import {
  FULL_EVIDENCE,
  effortWordKey,
  evidenceCount,
  impactOf,
  isExportOnly,
  localizeReasoningParams,
  plainWhy,
  reasoningMessages,
} from "./recView";

export interface RecCardProps {
  card: BoardCard;
  title: string;
  brandKey: string;
  runId: string | null;
  entities?: Record<string, string>;
  labelOf: (providerId: string) => string;
  /** The run's responses by id, for the plain "Why" line; null until loaded (or unavailable). */
  observations: ReadonlyMap<string, Observation> | null;
  /** False while the brand's campaigns are still loading (the next-step button waits for them). */
  campaignsReady: boolean;
  onStatus: (to: BoardColumn) => void;
  onRemove: () => void;
}

/**
 * One recommendation, in plain language for a shop owner: What to do (the title), Why (one
 * sentence from the gap and a real customer question), What it could change, Effort in time,
 * Evidence (n of 10 responses) and one big next step (create / open its campaign). Steps and the
 * full reasoning fold away; IDs, the priority formula and the class sit behind "Show the numbers
 * behind this". Every card links to the responses and gap it traces to (PRD AC-7). A ghost card
 * (no current recommendation) is shown faded as "resolved in latest run" and can be removed.
 */
export function RecCard(props: RecCardProps) {
  const { card, title, brandKey, runId, entities, labelOf, observations, campaignsReady, onStatus, onRemove } = props;
  const t = useT();
  const titleId = useId();

  const s = card.suggestion;
  const rec = s?.lead ?? null;

  return (
    <li className={`card rec-card${s ? "" : " is-resolved"}`} data-status={card.column} aria-labelledby={titleId}>
      <div className="rec-card-top">
        {rec ? (
          <p className="eyebrow rec-what">{t("board.card.what")}</p>
        ) : (
          <span className="badge badge-ok">{t("board.card.resolved")}</span>
        )}
        <span className="rec-status">
          <span className="rec-status-dot" aria-hidden="true" />
          <select
            value={card.column}
            aria-label={t("board.card.status", { title })}
            onChange={(e) => onStatus(e.target.value as BoardColumn)}
          >
            {BOARD_COLUMNS.map((c) => (
              <option key={c} value={c}>
                {t(STATUS_LABEL[c])}
              </option>
            ))}
          </select>
        </span>
      </div>

      <h3 id={titleId} className="rec-card-title">
        {title}
      </h3>

      {s && rec ? (
        <LiveCardBody
          card={card}
          title={title}
          brandKey={brandKey}
          runId={runId}
          entities={entities}
          labelOf={labelOf}
          observations={observations}
          campaignsReady={campaignsReady}
        />
      ) : (
        <>
          <p className="rec-card-note">{t("board.card.resolvedNote")}</p>
          <div className="rec-card-foot">
            <button type="button" className="btn-link rec-remove" aria-label={t("board.card.removeLabel", { title })} onClick={onRemove}>
              {t("board.card.remove")}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

type LiveProps = Omit<RecCardProps, "onStatus" | "onRemove">;

function LiveCardBody({ card, title, brandKey, runId, entities, labelOf, observations, campaignsReady }: LiveProps) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const moreId = useId();

  const s = card.suggestion!;
  const rec = s.lead;
  const copy = actionCopy(card.action);
  const leadGap = s.gaps.find((g) => g.gap_id === rec.gap_id) ?? s.gaps[0] ?? null;
  const otherGaps = s.gaps.filter((g) => g !== leadGap);

  const why = useMemo(
    () =>
      leadGap
        ? (plainWhy(leadGap, observations, entities, labelOf) ?? gapFinding(leadGap, t, fmt, entities, labelOf))
        : { key: "dashboard.why.unknown" as const },
    [leadGap, observations, entities, labelOf, t, fmt],
  );
  const reason = useMemo(
    () => reasoningMessages(rec, (p) => localizeReasoningParams(p, t, fmt, labelOf)),
    [rec, t, fmt, labelOf],
  );
  const impact = impactOf(rec.delta_composite, leadGap?.gap_type, rec.reasoning_params?.assumption_key);
  const evidence = evidenceCount(rec);
  const evidenceHref =
    s.gaps.length > 1 || !leadGap
      ? gapsHref(brandKey, { runId: runId ?? undefined, refs: s.refs })
      : gapsHref(brandKey, { gapId: leadGap.gap_id, runId: runId ?? undefined });
  const classKey = CLASS_LABEL[rec.action_class];

  const campaigns = useCampaignIndex();
  const campaign = campaigns ? campaigns.find(card.key, rec.recommendation_id) : null;
  const creating = campaigns?.creating === card.key;
  const exportOnly = isExportOnly(card.action);

  let impactText: string;
  let impactTip: { text: string; label: string } | null = null;
  if (impact.kind === "points") {
    impactText = t.n("board.card.gain", impact.n, { n: fmt.number(impact.n) });
    impactTip = { text: t("board.card.gainTip"), label: t("board.card.gainTipLabel") };
  } else if (impact.kind === "small") {
    impactText = t("board.card.gainSmall");
    impactTip = { text: t("board.card.gainTip"), label: t("board.card.gainTipLabel") };
  } else if (impact.kind === "flat") {
    impactText = t("board.card.flat");
    impactTip = { text: t("board.card.flatTip"), label: t("board.card.notScoredTipLabel") };
  } else {
    impactText = t("board.card.notScored");
    impactTip = {
      text: t(impact.reason === "source" ? "board.card.notScoredSourceTip" : "board.card.notScoredTip"),
      label: t("board.card.notScoredTipLabel"),
    };
  }

  return (
    <>
      <dl className="rec-facts">
        <div className="rec-fact">
          <dt className="eyebrow">{t("board.card.whyLabel")}</dt>
          <dd className="rec-why-line">
            <T k={why.key} vars={why.vars} />
          </dd>
        </div>
        <div className="rec-fact">
          <dt className="eyebrow">{t("board.card.change")}</dt>
          <dd className={`rec-gain is-${impact.kind}`}>
            {impactText}
            {impactTip && <InfoTip text={impactTip.text} label={impactTip.label} />}
          </dd>
        </div>
      </dl>

      <dl className="rec-facts rec-facts-pair">
        <div className="rec-fact">
          <dt className="eyebrow">{t("board.card.effort")}</dt>
          <dd>
            <span className={`effort-meter effort-${effortLevel(rec.effort)}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {t(effortWordKey(rec.effort))}
          </dd>
        </div>
        <div className="rec-fact">
          <dt className="eyebrow">{t("board.card.evidence")}</dt>
          <dd>
            <span className="evidence-meter" aria-hidden="true">
              {Array.from({ length: FULL_EVIDENCE }, (_, i) => (
                <i key={i} className={i < evidence ? "is-on" : undefined} />
              ))}
            </span>
            <span className="rec-evidence-count">
              {evidence >= FULL_EVIDENCE
                ? t("board.card.evidenceFull", { n: fmt.number(evidence) })
                : t("board.card.evidenceOf", { n: fmt.number(evidence) })}
              <InfoTip text={t("board.card.evidenceTip")} label={t("board.card.evidenceTipLabel")} />
            </span>
            <TransitionLink to={evidenceHref} className="rec-evidence">
              {t("board.card.seeEvidence")}
            </TransitionLink>
          </dd>
        </div>
      </dl>

      {campaign ? (
        <TransitionLink
          to={campaignHref(brandKey, campaign.campaign_id)}
          className={`btn ${card.column === "done" ? "btn-secondary" : "btn-primary"} rec-next`}
          title={t(statusView(campaign.status).key)}
        >
          {t("board.campaign.open")}
        </TransitionLink>
      ) : (
        campaigns &&
        card.column !== "rejected" && (
          <button
            type="button"
            className="btn btn-primary rec-next"
            disabled={!campaignsReady || campaigns.creating !== null}
            aria-busy={creating || undefined}
            aria-label={t(exportOnly ? "board.card.copyTextLabel" : "board.campaign.createLabel", { title })}
            onClick={() => campaigns.create(card.key, rec.recommendation_id)}
          >
            {creating && <span className="cs-spinner" aria-hidden="true" />}
            {creating ? t("board.campaign.creating") : t(exportOnly ? "board.card.copyText" : "board.campaign.create")}
          </button>
        )
      )}

      <div className="rec-more">
        <button
          type="button"
          className="btn-link rec-more-toggle"
          aria-expanded={open}
          aria-controls={moreId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="disclosure-caret" aria-hidden="true" />
          {t("board.card.more")}
        </button>
        <div id={moreId} className="rec-more-body" hidden={!open}>
          {copy && (
            <>
              <p className="eyebrow rec-more-label">{t("board.card.how")}</p>
              <ol className="rec-steps">
                {copy.steps.map((k) => (
                  <li key={k}>{t(k, { competitor: card.competitor ?? "" })}</li>
                ))}
              </ol>
            </>
          )}
          {(reason || rec.reasoning) && (
            <>
              <p className="eyebrow rec-more-label">{t("board.card.reasoning")}</p>
              {reason ? (
                <p className="rec-rationale">
                  {reason.map((m, i) => (
                    <span key={m.key}>
                      {i > 0 && " "}
                      <T k={m.key} vars={m.vars} />
                    </span>
                  ))}
                </p>
              ) : (
                <p className="rec-rationale" lang="en">
                  {rec.reasoning}
                </p>
              )}
            </>
          )}
          {otherGaps.map((g) => {
            const f = gapFinding(g, t, fmt, entities, labelOf);
            return (
              <p key={g.gap_id} className="rec-rationale">
                <T k={f.key} vars={f.vars} />
              </p>
            );
          })}
          <p className="rec-drafted">
            {rec.drafted_by === "template" ? t("board.card.draftedTemplate") : t("board.card.draftedOther", { by: rec.drafted_by })}
          </p>
        </div>
      </div>

      <Details>
        <div className="rec-tech">
          <p className="eyebrow">{t("board.card.tech")}</p>
          <div className="rec-tech-chips">
            <span className="badge badge-accent">{classKey ? t(classKey) : humanizeId(rec.action_class)}</span>
            {(s.gaps.length > 0 ? s.gaps : [null]).map((g) => {
              const id = g?.gap_id ?? rec.gap_id;
              return (
                <TransitionLink
                  key={id}
                  to={gapsHref(brandKey, { gapId: id, runId: runId ?? undefined })}
                  className="rec-trace"
                  title={t("board.card.traceTitle", { id })}
                >
                  <span aria-hidden="true">↳ </span>
                  {t("board.card.trace", { type: g ? gapTypeText(g.gap_type, t) : humanizeId(id) })}
                </TransitionLink>
              );
            })}
          </div>
          <dl className="rec-tech-list">
            <div>
              <dt>{t("board.card.tech.rec")}</dt>
              <dd>
                <code>{rec.recommendation_id}</code>
              </dd>
            </div>
            <div>
              <dt>{t("board.card.tech.gap")}</dt>
              <dd>
                <code>{rec.gap_id}</code>
              </dd>
            </div>
            <div>
              <dt>{t("board.card.tech.priority")}</dt>
              <dd>
                {t("board.card.tech.formula", {
                  p: fmt.number(rec.priority ?? 0, 3),
                  delta: fmt.number(rec.delta_composite ?? 0, 2),
                  conf: fmt.number(rec.confidence ?? 0, 2),
                  effort: fmt.number(rec.effort ?? 0),
                })}
              </dd>
            </div>
            <div>
              <dt>{t("board.card.tech.confidence")}</dt>
              <dd>{fmt.percent(rec.confidence ?? 0)}</dd>
            </div>
          </dl>
        </div>
      </Details>
    </>
  );
}

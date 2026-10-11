import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { Gap } from "../api/types";
import { evidenceHref } from "../format";
import { T, useFormat, useT } from "../i18n";
import { Details } from "../settings/details";
import { gapFinding, gapNumberPairs, gapScopeText, gapTypeText } from "./dashboard/helpers";
import { gapKey } from "./evidence/filter";
import { TopN } from "./ui/TopN";

// The few that matter show first; the rest sit behind "Show more".
const TOP_GAPS = 3;

// Gaps are found by deterministic rules (DESIGN §5.1) — no LLM involved. The plain finding is always
// shown; the gap ID (AC-7 traceability), raw numbers and "inferred" flag only in the Analytical view.
//
// With `onSelect` (the Gaps & evidence module) each card selects itself in place — the whole card is
// a mouse target and the "N responses →" button is the keyboard/AT control (aria-pressed). Without
// it, that button is a plain link to the evidence.
export function GapList({
  gaps,
  brandKey,
  runId,
  entities,
  selectedGapId,
  onSelect,
  controlsId,
  labelOf = (id: string) => id,
}: {
  gaps: Gap[];
  brandKey: string;
  runId: string;
  entities?: Record<string, string>;
  selectedGapId?: string | null;
  onSelect?: (gapId: string) => void;
  /** Id of the element the selection filters (the evidence pane), for aria-controls. */
  controlsId?: string;
  labelOf?: (id: string) => string;
}) {
  const t = useT();
  const fmt = useFormat();
  if (gaps.length === 0) {
    return <p className="empty">{t("dashboard.gaps.empty")}</p>;
  }

  // A selected gap (e.g. from a deep link) is never hidden behind "Show more".
  const selectedAt = gaps.findIndex((g, i) => gapKey(g, i) === selectedGapId);

  const renderGap = (gap: Gap, i: number) => {
    const id = gapKey(gap, i);
    const refs = gap.evidence_refs ?? [];
    const finding = gapFinding(gap, t, fmt, entities, labelOf);
    const selected = selectedGapId === id;
    // Mouse convenience: a click anywhere on the card selects it, except on its own controls or
    // while the user is selecting text (e.g. copying the gap ID).
    const onCardClick = onSelect
      ? (e: MouseEvent<HTMLElement>) => {
          if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
          if (window.getSelection()?.toString()) return;
          onSelect(id);
        }
      : undefined;
    return (
      <article
        key={id}
        id={`gap-${id}`}
        className={`card gap-item${onSelect ? " is-selectable" : ""}${selected ? " is-highlighted is-selected" : ""}`}
        onClick={onCardClick}
      >
        <div className="gap-head">
          <span className={`badge gap-type gap-type-${gap.gap_type}`}>{gapTypeText(gap.gap_type, t)}</span>
          {/* "Across everything we checked" says nothing the badge doesn't, so overall gaps skip it. */}
          {gap.detail?.scope !== "overall" && <span className="gap-scope">{gapScopeText(gap, t, entities, labelOf)}</span>}
          <Details>
            {gap.is_inferred && <span className="badge badge-warn">{t("dashboard.gaps.inferred")}</span>}
            <code className="gap-id">{id}</code>
          </Details>
        </div>
        <p className="gap-explainer">
          <T k={finding.key} vars={finding.vars} />
        </p>
        <div className="gap-foot">
          <Details>
            <div className="gap-numbers">
              {gapNumberPairs(gap, t, fmt).map(([label, value]) => (
                <span key={label} className="kv">
                  <span className="kv-label">{label}</span>
                  <span className="kv-value">{value}</span>
                </span>
              ))}
            </div>
          </Details>
          {onSelect ? (
            <button
              type="button"
              className="link-quiet gap-select"
              aria-pressed={selected}
              aria-controls={controlsId}
              onClick={() => onSelect(id)}
            >
              {refs.length > 0 ? t.n("dashboard.gaps.evidence", refs.length) : t("modules.gaps.select")}
            </button>
          ) : (
            refs.length > 0 && (
              <Link to={evidenceHref(brandKey, runId, refs)} className="link-quiet">
                {t.n("dashboard.gaps.evidence", refs.length)}
              </Link>
            )
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="gap-list">
      <TopN items={gaps} n={Math.max(TOP_GAPS, selectedAt + 1)} render={renderGap} />
    </div>
  );
}

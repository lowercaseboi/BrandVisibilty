import type { AnalysisResult } from "../api/types";
import { COMPOSITE_PARTS, measuredParts } from "../format";
import { useT } from "../i18n";
import { InfoTip } from "./InfoTip";

/**
 * "Measured on N of 3 parts" under a score whose composite was renormalised over fewer than all
 * three components (see `measuredParts`). Renders nothing for a fully measured score.
 * `interactive={false}` inside a link (brand list cards): the "i" is a plain marker, not a button,
 * and the explanation still shows on hover and is read with the link.
 */
export function MeasuredNote({
  analysis,
  className = "",
  interactive = true,
}: {
  analysis: AnalysisResult;
  className?: string;
  interactive?: boolean;
}) {
  const t = useT();
  const n = measuredParts(analysis);
  if (n >= COMPOSITE_PARTS) return null;
  return (
    <span className={`measured-note ${className}`.trim()}>
      {t("hub.measured.note", { n })}
      <InfoTip text={t("hub.measured.explainer")} label={t("hub.measured.label")} interactive={interactive} />
    </span>
  );
}

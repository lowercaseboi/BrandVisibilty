import { Fragment, useMemo } from "react";
import type { Question } from "../../api/types";
import { useIntentLabel } from "../../format";
import { useT } from "../../i18n";
import { GENERAL_COLUMN, buildCoverageMatrix } from "./coverageMatrix";

/**
 * Question intent × city grid (pure buildCoverageMatrix does the counting). Empty cells are
 * highlighted as blind spots: a combination the current question set doesn't cover yet. Built as
 * a CSS-grid table with explicit ARIA roles (`display: contents` rows) so it stays a real table
 * for assistive tech without giving up the grid layout.
 */
export function CoverageMatrix({ questions, cities }: { questions: Question[]; cities: string[] }) {
  const t = useT();
  const intentLabel = useIntentLabel();
  const matrix = useMemo(() => buildCoverageMatrix(questions, cities), [questions, cities]);

  if (matrix.intents.length === 0) {
    return <p className="muted small">{t("brandinfo.coverage.empty")}</p>;
  }

  const cellTitle = (count: number, intent: string, city: string) =>
    city === GENERAL_COLUMN
      ? t.n("brandinfo.coverage.cellTitleGeneral", count, { intent: intentLabel(intent) })
      : t.n("brandinfo.coverage.cellTitle", count, { intent: intentLabel(intent), city });

  return (
    <div className="bi-coverage">
      <div
        className="bi-coverage-grid"
        role="table"
        aria-label={t("brandinfo.coverage.title")}
        style={{ gridTemplateColumns: `minmax(9rem, 1.3fr) repeat(${matrix.cities.length}, minmax(3.6rem, 1fr))` }}
      >
        <div className="bi-coverage-row" role="row">
          <div className="bi-coverage-cell bi-coverage-corner" role="columnheader" />
          {matrix.cities.map((city) => (
            <div key={city} className="bi-coverage-cell bi-coverage-colhead" role="columnheader">
              {city === GENERAL_COLUMN ? t("brandinfo.coverage.general") : city}
            </div>
          ))}
        </div>
        {matrix.intents.map((intent, i) => (
          <Fragment key={intent}>
            <div className="bi-coverage-row" role="row">
              <div className="bi-coverage-cell bi-coverage-rowhead" role="rowheader">
                {intentLabel(intent)}
              </div>
              {matrix.cells[i].map((cell, j) => (
                <div
                  key={matrix.cities[j]}
                  className={`bi-coverage-cell bi-coverage-count${cell.blind ? " is-blind" : ""}`}
                  role="cell"
                  title={cellTitle(cell.count, intent, matrix.cities[j])}
                >
                  {cell.count}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
      <p className="bi-coverage-note small muted">{t("brandinfo.coverage.blindHint")}</p>
    </div>
  );
}

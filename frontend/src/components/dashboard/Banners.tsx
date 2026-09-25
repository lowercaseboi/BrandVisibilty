import { Link } from "react-router-dom";
import type { QuestionSet, Snapshot } from "../../api/types";
import { useT } from "../../i18n";
import { OriginBanner } from "../OriginBanner";
import { useListFormat } from "./helpers";

// Below this many scored questions the score swings a lot from one check to the next.
const THIN_QUESTION_SET = 10;

/** Plain-words warnings about how far to trust this result. */
export function HonestyBanners({
  snapshot,
  questions,
  brandKey,
  labelOf,
}: {
  snapshot: Snapshot | null;
  questions: QuestionSet | null;
  brandKey: string;
  labelOf: (id: string) => string;
}) {
  const t = useT();
  const list = useListFormat();
  const missing = snapshot?.admission?.missing_providers ?? [];
  const partial = !!snapshot && (snapshot.status === "partial" || missing.length > 0);
  const changed =
    !!questions?.content_hash &&
    !!snapshot?.query_set_content_hash &&
    questions.content_hash !== snapshot.query_set_content_hash;
  const scored = questions?.scored_count;
  const thin = typeof scored === "number" && scored < THIN_QUESTION_SET;

  return (
    <div className="dash-banners">
      <OriginBanner origin={snapshot?.data_origin} />
      {partial && (
        <div className="alert alert-warn" role="note">
          {missing.length > 0
            ? t.n("dashboard.banner.partial", missing.length, { ais: list(missing.map(labelOf)) })
            : t("dashboard.banner.partialUnknown")}
        </div>
      )}
      {changed && (
        <div className="alert alert-info" role="note">
          {t("dashboard.banner.questionsChanged")}
        </div>
      )}
      {thin && (
        <div className="alert alert-warn" role="note">
          {t.n("dashboard.banner.thin", scored)}{" "}
          <Link to={`/brands/${encodeURIComponent(brandKey)}/questions`}>{t("dashboard.banner.thinLink")}</Link>
        </div>
      )}
    </div>
  );
}

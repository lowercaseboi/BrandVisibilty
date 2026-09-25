import type { DataOrigin } from "../api/types";
import { useT } from "../i18n";

/** Says loudly when results are not from a real check today (practice or saved answers). */
export function OriginBanner({ origin }: { origin?: DataOrigin }) {
  const t = useT();
  if (origin === "synthetic") {
    return (
      <div className="alert alert-synthetic" role="note">
        <strong>{t("dashboard.banner.synthetic.title")}</strong>
        <span className="alert-body">{t("dashboard.banner.synthetic.body")}</span>
      </div>
    );
  }
  if (origin === "replay") {
    return (
      <div className="alert alert-replay" role="note">
        <strong>{t("dashboard.banner.replay.title")}</strong>
        <span className="alert-body">{t("dashboard.banner.replay.body")}</span>
      </div>
    );
  }
  return null;
}

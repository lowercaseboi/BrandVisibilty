import { Link, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { brandHref, gapsHref } from "../../components/module/modules";
import { useT } from "../../i18n";
import { BrandDataProvider, useBrandData } from "./BrandContext";

/** The hub or a module, unless the brand doesn't exist: then one clear "not found" state. */
function BrandOutlet() {
  const t = useT();
  const { status, brandKey } = useBrandData();
  if (status === "notfound") {
    return (
      <EmptyState
        as="h1"
        icon="compass"
        title={t("hub.notFound.title")}
        body={t("hub.notFound.body", { key: brandKey })}
        primary={
          <Link to="/app" className="btn btn-primary">
            {t("hub.notFound.back")}
          </Link>
        }
      />
    );
  }
  return <Outlet />;
}

/** `/brands/:brandKey/*` — loads the brand once and renders the hub or a module inside it. */
export function BrandLayout() {
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  return (
    <BrandDataProvider key={brandKey} brandKey={brandKey}>
      <BrandOutlet />
    </BrandDataProvider>
  );
}

/** Old `/brands/:key/questions` → the questions section of Brand details. */
export function LegacyQuestionsRedirect() {
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  return <Navigate to={`${brandHref(brandKey, "details")}#questions`} replace />;
}

/** Old `/brands/:key/runs/:runId/evidence?refs=…` → Gaps & evidence with the same run/refs. */
export function LegacyEvidenceRedirect() {
  const { brandKey = "", runId = "" } = useParams<{ brandKey: string; runId: string }>();
  const refs = new URLSearchParams(useLocation().search).get("refs");
  return <Navigate to={gapsHref(brandKey, { runId, refs: refs ? refs.split(",").filter(Boolean) : undefined })} replace />;
}

import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { brandHref, gapsHref } from "../../components/module/modules";
import { BrandDataProvider } from "./BrandContext";

/** `/brands/:brandKey/*` — loads the brand once and renders the hub or a module inside it. */
export function BrandLayout() {
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  return (
    <BrandDataProvider key={brandKey} brandKey={brandKey}>
      <Outlet />
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

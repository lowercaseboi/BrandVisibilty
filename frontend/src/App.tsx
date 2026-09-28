import { lazy, Suspense } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/Toaster";
import { useT } from "./i18n";
import { BrandListPage } from "./pages/BrandListPage";
import { AnalysisModule } from "./pages/brand/AnalysisModule";
import { BoardModule } from "./pages/brand/BoardModule";
import { BrandLayout, LegacyEvidenceRedirect, LegacyQuestionsRedirect } from "./pages/brand/BrandLayout";
import { DetailsModule } from "./pages/brand/DetailsModule";
import { GapsModule } from "./pages/brand/GapsModule";
import { HubPage } from "./pages/brand/HubPage";

// The landing and providers pages load on demand. The brand list, hub and modules are eager on
// purpose: they navigate inside View Transitions (flushSync), and a lazy route would suspend
// mid-morph and snapshot the loading fallback instead of the page.
const LandingPage = lazy(() => import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const ProvidersPage = lazy(() => import("./pages/ProvidersPage").then((m) => ({ default: m.ProvidersPage })));

/** One page-enter key per brand, so moving between a brand's hub and modules keeps its data mounted. */
function sectionKey(pathname: string): string {
  const m = /^\/brands\/([^/]+)/.exec(pathname);
  return m ? `/brands/${m[1]}` : pathname;
}

function NotFound() {
  const t = useT();
  return (
    <div className="card empty-state">
      <h1>{t("common.notFound.title")}</h1>
      <p className="muted">{t("common.notFound.body")}</p>
      <p>
        <Link to="/app">{t("common.notFound.back")}</Link>
      </p>
    </div>
  );
}

export default function App() {
  const t = useT();
  const { pathname } = useLocation();

  // The landing page brings its own nav and footer.
  if (pathname === "/") {
    return (
      <>
        <Suspense fallback={null}>
          <LandingPage />
        </Suspense>
        <Toaster />
      </>
    );
  }

  return (
    <>
      <a href="#main" className="skip-link">
        {t("common.app.skipToContent")}
      </a>
      <AppHeader />
      <main className="app" id="main" tabIndex={-1}>
        {/* Keyed per section so each page plays its entrance once (a brand's hub + modules share one). */}
        <div className="page-enter" key={sectionKey(pathname)}>
          {/* A crash in one page falls back to a friendly message instead of blanking the app;
              resetKey clears it automatically once the user navigates elsewhere. */}
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<p className="status">{t("common.loading")}</p>}>
              <Routes>
                <Route path="/app" element={<BrandListPage />} />
                <Route path="/providers" element={<ProvidersPage />} />
                <Route path="/brands/:brandKey" element={<BrandLayout />}>
                  <Route index element={<HubPage />} />
                  <Route path="details" element={<DetailsModule />} />
                  <Route path="analysis" element={<AnalysisModule />} />
                  <Route path="gaps" element={<GapsModule />} />
                  <Route path="recommendations" element={<BoardModule />} />
                  <Route path="questions" element={<LegacyQuestionsRedirect />} />
                  <Route path="runs/:runId/evidence" element={<LegacyEvidenceRedirect />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <footer className="app-footer">{t("common.footer.text")}</footer>
      <Toaster />
    </>
  );
}

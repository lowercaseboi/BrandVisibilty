import { lazy, Suspense } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { Toaster } from "./components/Toaster";
import { useT } from "./i18n";
import { BrandListPage } from "./pages/BrandListPage";

// Everything past the front page loads on demand, keeping the first download small.
const BrandDashboardPage = lazy(() => import("./pages/BrandDashboardPage").then((m) => ({ default: m.BrandDashboardPage })));
const ProvidersPage = lazy(() => import("./pages/ProvidersPage").then((m) => ({ default: m.ProvidersPage })));
const EvidencePage = lazy(() => import("./pages/EvidencePage").then((m) => ({ default: m.EvidencePage })));
const QuestionsPage = lazy(() => import("./pages/QuestionsPage").then((m) => ({ default: m.QuestionsPage })));

function NotFound() {
  const t = useT();
  return (
    <div className="card empty-state">
      <h1>{t("common.notFound.title")}</h1>
      <p className="muted">{t("common.notFound.body")}</p>
      <p>
        <Link to="/">{t("common.notFound.back")}</Link>
      </p>
    </div>
  );
}

export default function App() {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <>
      <a href="#main" className="skip-link">
        {t("common.app.skipToContent")}
      </a>
      <AppHeader />
      <main className="app" id="main" tabIndex={-1}>
        {/* Keyed on the path so each page plays its entrance once. */}
        <div className="page-enter" key={pathname}>
          <Suspense fallback={<p className="status">{t("common.loading")}</p>}>
            <Routes>
              <Route path="/" element={<BrandListPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/brands/:brandKey" element={<BrandDashboardPage />} />
              <Route path="/brands/:brandKey/questions" element={<QuestionsPage />} />
              <Route path="/brands/:brandKey/runs/:runId/evidence" element={<EvidencePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <footer className="app-footer">{t("common.footer.text")}</footer>
      <Toaster />
    </>
  );
}

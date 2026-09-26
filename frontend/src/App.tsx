import { Link, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { Toaster } from "./components/Toaster";
import { useT } from "./i18n";
import { BrandListPage } from "./pages/BrandListPage";
import { BrandDashboardPage } from "./pages/BrandDashboardPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { EvidencePage } from "./pages/EvidencePage";
import { QuestionsPage } from "./pages/QuestionsPage";

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
          <Routes>
            <Route path="/" element={<BrandListPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/brands/:brandKey" element={<BrandDashboardPage />} />
            <Route path="/brands/:brandKey/questions" element={<QuestionsPage />} />
            <Route path="/brands/:brandKey/runs/:runId/evidence" element={<EvidencePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
      <footer className="app-footer">{t("common.footer.text")}</footer>
      <Toaster />
    </>
  );
}

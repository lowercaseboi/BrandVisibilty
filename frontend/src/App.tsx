import { Link, Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { CommandPalette } from "./components/CommandPalette";
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
  return (
    <>
      <a href="#main" className="skip-link">
        {t("common.app.skipToContent")}
      </a>
      <AppHeader />
      <main className="app" id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<BrandListPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/brands/:brandKey" element={<BrandDashboardPage />} />
          <Route path="/brands/:brandKey/questions" element={<QuestionsPage />} />
          <Route path="/brands/:brandKey/runs/:runId/evidence" element={<EvidencePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <CommandPalette />
      <footer className="app-footer">{t("common.footer.text")}</footer>
    </>
  );
}

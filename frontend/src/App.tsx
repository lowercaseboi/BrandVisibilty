import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { BrandListPage } from "./pages/BrandListPage";
import { BrandDashboardPage } from "./pages/BrandDashboardPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { EvidencePage } from "./pages/EvidencePage";

function NotFound() {
  return (
    <div className="card">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to brands</Link>
      </p>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand-mark">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="var(--accent)" />
              <path d="M8 22 L13 15 L18 18 L24 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="9" r="2.4" fill="#fff" />
            </svg>
            <span>
              <strong>AI Visibility</strong>
              <span className="brand-mark-sub">Brand Intelligence Platform</span>
            </span>
          </Link>
          <nav className="app-nav">
            <NavLink to="/" end>
              Brands
            </NavLink>
            <NavLink to="/providers">Providers</NavLink>
            <button type="button" className="palette-trigger" onClick={() => window.dispatchEvent(new Event("open-palette"))}>
              <span>Search</span>
              <kbd>Ctrl K</kbd>
            </button>
          </nav>
        </div>
      </header>
      <main className="app">
        <div className="route-fade" key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<BrandListPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/brands/:brandKey" element={<BrandDashboardPage />} />
          <Route path="/brands/:brandKey/runs/:runId/evidence" element={<EvidencePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </div>
      </main>
      <CommandPalette />
      <footer className="app-footer">
        Measures how often LLMs mention a brand when asked unprompted category questions.
      </footer>
    </>
  );
}

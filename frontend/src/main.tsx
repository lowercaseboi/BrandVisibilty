import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/dashboard.css";
import "./styles/pages.css";
import App from "./App.tsx";
import { LanguageProvider } from "./i18n";
import { DetailsProvider } from "./settings/details";
import { ThemeProvider } from "./settings/theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <DetailsProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </DetailsProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);

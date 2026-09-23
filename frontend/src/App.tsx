import { Route, Routes } from "react-router-dom";
import { BrandListPage } from "./pages/BrandListPage";
import { BrandDashboardPage } from "./pages/BrandDashboardPage";

export default function App() {
  return (
    <main className="app">
      <Routes>
        <Route path="/" element={<BrandListPage />} />
        <Route path="/brands/:brandKey" element={<BrandDashboardPage />} />
      </Routes>
    </main>
  );
}

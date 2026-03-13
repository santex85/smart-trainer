import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { LandingI18nProvider } from "./i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <LandingI18nProvider>
      <App />
    </LandingI18nProvider>
  </BrowserRouter>
);

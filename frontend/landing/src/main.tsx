import { createRoot } from "react-dom/client";
import App from "./App";
import { LandingI18nProvider } from "./i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <LandingI18nProvider>
    <App />
  </LandingI18nProvider>
);

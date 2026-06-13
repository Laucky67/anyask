import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { SettingsProvider } from "./state/SettingsContext";
import { I18nProvider } from "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </I18nProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./styles/global.css";
import { SettingsProvider } from "./state/SettingsContext";
import { I18nProvider } from "./i18n";
import { QuickAskShell } from "./pages/quick-ask/QuickAskShell";

// 主窗口与快捷提问窗共用 index.html，按窗口标签分流渲染不同的壳
const isQuickAsk = getCurrentWindow().label === "quick-ask";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isQuickAsk ? (
      <QuickAskShell />
    ) : (
      <I18nProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </I18nProvider>
    )}
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./styles/global.css";
import { SettingsProvider } from "./state/SettingsContext";
import { I18nProvider } from "./i18n";
import { QuickAskShell } from "./pages/quick-ask/QuickAskShell";
import { SelectionToolbarShell } from "./pages/selection-toolbar/SelectionToolbarShell";

// 主窗口 / 快捷提问窗 / 划词工具条窗共用 index.html，按窗口标签分流渲染不同的壳
const label = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {label === "quick-ask" ? (
      <QuickAskShell />
    ) : label === "selection-toolbar" ? (
      <SelectionToolbarShell />
    ) : (
      <I18nProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </I18nProvider>
    )}
  </React.StrictMode>
);

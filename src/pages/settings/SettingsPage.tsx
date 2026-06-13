import { useState } from "react";
import { useT } from "../../i18n";
import { BasicSettings } from "./BasicSettings";
import { AiConfigSettings } from "./AiConfigSettings";
import { HotkeySettings } from "./HotkeySettings";

type Tab = "basic" | "ai" | "hotkeys";

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("basic");
  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: t("settings.basic") },
    { key: "ai", label: t("settings.ai") },
    { key: "hotkeys", label: t("settings.hotkeys") },
  ];
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 160, borderRight: "1px solid var(--border)", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 16, margin: "4px 8px 12px" }}>{t("settings.title")}</h2>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            style={{
              textAlign: "left",
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === tb.key ? "var(--bg-elev)" : "transparent",
              color: "var(--fg)",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "basic" && <BasicSettings />}
        {tab === "ai" && <AiConfigSettings />}
        {tab === "hotkeys" && <HotkeySettings />}
      </div>
    </div>
  );
}

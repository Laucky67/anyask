import React, { useState } from "react";
import { Monitor, Bot, Keyboard } from "lucide-react";
import { useT } from "../../i18n";
import { BasicSettings } from "./BasicSettings";
import { AiConfigSettings } from "./AiConfigSettings";
import { HotkeySettings } from "./HotkeySettings";

type Tab = "basic" | "ai" | "hotkeys";

const TAB_ICON: Record<Tab, (size: number) => React.ReactNode> = {
  basic: (s) => <Monitor size={s} />,
  ai: (s) => <Bot size={s} />,
  hotkeys: (s) => <Keyboard size={s} />,
};

// inject fade-in keyframes once globally
let keyframesInjected = false;
function ensureKeyframes() {
  if (keyframesInjected) return;
  keyframesInjected = true;
  const sheet = document.createElement("style");
  sheet.textContent = `
    @keyframes settingsFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(sheet);
}

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("basic");
  const [hoverTab, setHoverTab] = useState<Tab | null>(null);
  ensureKeyframes();

  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: t("settings.basic") },
    { key: "ai", label: t("settings.ai") },
    { key: "hotkeys", label: t("settings.hotkeys") },
  ];

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* ── left tab nav ── */}
      <div
        style={{
          width: 200,
          borderRight: "1px solid var(--border)",
          padding: "20px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          background: "var(--bg)",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: "0 14px 10px",
            color: "var(--fg)",
            letterSpacing: "-0.01em",
          }}
        >
          {t("settings.title")}
        </h2>
        {tabs.map((tb) => {
          const active = tab === tb.key;
          const hovered = hoverTab === tb.key;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              onMouseEnter={() => setHoverTab(tb.key)}
              onMouseLeave={() => setHoverTab(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                padding: "11px 16px",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                background: active || hovered ? "var(--bg-elev)" : "transparent",
                color: active ? "var(--fg)" : "var(--fg-muted)",
                fontWeight: active ? 600 : 400,
                fontSize: 15,
                position: "relative",
                transition: `background 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo)`,
              }}
            >
              {/* active left accent bar */}
              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: "0 3px 3px 0",
                    background: "var(--accent)",
                  }}
                />
              )}
              <span style={{ display: "flex", alignItems: "center", opacity: active ? 1 : 0.55 }}>
                {TAB_ICON[tb.key](20)}
              </span>
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* ── right content ── */}
      <div style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
        <div
          key={tab}
          style={{
            animation: "settingsFadeIn 0.35s var(--ease-out-expo) both",
          }}
        >
          {tab === "basic" && <BasicSettings />}
          {tab === "ai" && <AiConfigSettings />}
          {tab === "hotkeys" && <HotkeySettings />}
        </div>
      </div>
    </div>
  );
}

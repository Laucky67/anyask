import { useEffect, useState } from "react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasAnyConflict } from "../../lib/hotkeys";
import { applyHotkeys, type HotkeyRegistration } from "../../lib/commands";
import type { Hotkeys } from "../../state/types";

type HotkeyName = keyof Hotkeys;

const ROWS: { name: HotkeyName; labelKey: string }[] = [
  { name: "quickAsk", labelKey: "hotkeys.quickAsk" },
  { name: "showMain", labelKey: "hotkeys.showMain" },
  { name: "selectionToolbar", labelKey: "hotkeys.selectionToolbar" },
];

// inject pulse keyframes once
let pulseInjected = false;
function ensurePulseKeyframes() {
  if (pulseInjected) return;
  pulseInjected = true;
  const sheet = document.createElement("style");
  sheet.textContent = `
    @keyframes hotkeyPulse {
      0%, 100% { border-color: var(--accent); box-shadow: 0 0 0 0 rgba(37,99,235,0.3); }
      50%      { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(37,99,235,0); }
    }
  `;
  document.head.appendChild(sheet);
}

/* kbd key cap style */
const kbdBase: React.CSSProperties = {
  fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--fg)",
  boxShadow: "var(--shadow-kbd)",
};

const cardRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 20px",
  background: "var(--bg-elev)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
};

export function HotkeySettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [recording, setRecording] = useState<HotkeyName | null>(null);
  const [registration, setRegistration] = useState<HotkeyRegistration | null>(null);

  ensurePulseKeyframes();

  useEffect(() => {
    void applyHotkeys().then(setRegistration);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") {
        setRecording(null);
        return;
      }
      const acc = eventToAccelerator(e);
      if (acc && isValidAccelerator(acc)) {
        const nextHotkeys: Hotkeys = { ...settings.hotkeys, [recording]: acc };
        setRecording(null);
        void updateSettings({ hotkeys: nextHotkeys })
          .then(() => applyHotkeys())
          .then(setRegistration);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, settings.hotkeys, updateSettings]);

  const conflict = hasAnyConflict([
    settings.hotkeys.quickAsk,
    settings.hotkeys.showMain,
    settings.hotkeys.selectionToolbar,
  ]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 820, margin: "0 auto", width: "100%" }}>
      {ROWS.map((row) => {
        const isRec = recording === row.name;
        return (
          <div key={row.name} style={cardRow}>
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--fg)" }}>
              {t(row.labelKey)}
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <button
                type="button"
                aria-label={t("hotkeys.setLabel").replace("{label}", t(row.labelKey))}
                onClick={() => setRecording(row.name)}
                style={{
                  ...kbdBase,
                  minWidth: 150,
                  textAlign: "center",
                  cursor: "pointer",
                  border: `1.5px solid ${isRec ? "var(--accent)" : "var(--border)"}`,
                  animation: isRec ? "hotkeyPulse 1.5s var(--ease-out-expo) infinite" : "none",
                  transition: `border-color 0.2s var(--ease-out-expo), background 0.2s var(--ease-out-expo)`,
                }}
                onMouseEnter={(e) => {
                  if (!isRec) (e.currentTarget as HTMLElement).style.background = "var(--bg-elev)";
                }}
                onMouseLeave={(e) => {
                  if (!isRec) (e.currentTarget as HTMLElement).style.background = "var(--bg)";
                }}
              >
                {isRec ? t("hotkeys.recording") : formatAccelerator(settings.hotkeys[row.name])}
              </button>
              {registration && registration[row.name] === false && (
                <span style={{ color: "#e0a23a", fontSize: 12 }}>{t("hotkeys.failed")}</span>
              )}
            </div>
          </div>
        );
      })}
      {conflict && (
        <div
          style={{
            fontSize: 13,
            color: "#e05260",
            background: "var(--bg-elev)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 16px",
            border: "1px solid rgba(224,82,96,0.25)",
          }}
        >
          {t("hotkeys.conflict")}
        </div>
      )}
    </div>
  );
}

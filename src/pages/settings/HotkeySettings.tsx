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

export function HotkeySettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [recording, setRecording] = useState<HotkeyName | null>(null);
  const [registration, setRegistration] = useState<HotkeyRegistration | null>(null);

  // 进入页面时获取当前注册状态（Rust 按现有设置重新注册并返回结果）
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
        // 先等设置持久化，再让 Rust 重新注册——否则 Rust 读到旧 store 值，
        // 新快捷键要切出设置页重挂载才生效。
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
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
      {ROWS.map((row) => {
        const isRec = recording === row.name;
        return (
          <div key={row.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
            <span>{t(row.labelKey)}</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <button
                type="button"
                aria-label={`设置 ${t(row.labelKey)} 快捷键`}
                onClick={() => setRecording(row.name)}
                style={{
                  minWidth: 160,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${isRec ? "var(--accent)" : "var(--border)"}`,
                  background: "var(--bg-elev)",
                  color: "var(--fg)",
                  cursor: "pointer",
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
      {conflict && <span style={{ color: "#e05260", fontSize: 13 }}>{t("hotkeys.conflict")}</span>}
    </div>
  );
}

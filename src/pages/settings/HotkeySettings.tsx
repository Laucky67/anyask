import { useEffect, useState } from "react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasAnyConflict } from "../../lib/hotkeys";
import { applyHotkeys, type HotkeyRegistration } from "../../lib/commands";
import { SettingsLayout } from "../../components/SettingsLayout";
import type { Hotkeys } from "../../state/types";
import styles from "./HotkeySettings.module.css";

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
    <SettingsLayout gap={12} padding={24}>
      {ROWS.map((row) => {
        const isRec = recording === row.name;
        return (
          <div key={row.name} className={styles.row}>
            <span className={styles.label}>{t(row.labelKey)}</span>
            <div className={styles.keyCol}>
              <button
                type="button"
                aria-label={t("hotkeys.setLabel").replace("{label}", t(row.labelKey))}
                onClick={() => setRecording(row.name)}
                className={styles.kbd}
                data-recording={isRec || undefined}
              >
                {isRec ? t("hotkeys.recording") : formatAccelerator(settings.hotkeys[row.name])}
              </button>
              {registration && registration[row.name] === false && (
                <span className={styles.failed}>{t("hotkeys.failed")}</span>
              )}
            </div>
          </div>
        );
      })}
      {conflict && <div className={styles.conflict}>{t("hotkeys.conflict")}</div>}
    </SettingsLayout>
  );
}

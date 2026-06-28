import React, { useState } from "react";
import { Monitor, Bot, Keyboard } from "lucide-react";
import { useT } from "../../i18n";
import { BasicSettings } from "./BasicSettings";
import { AiConfigSettings } from "./AiConfigSettings";
import { HotkeySettings } from "./HotkeySettings";
import styles from "./SettingsPage.module.css";

type Tab = "basic" | "ai" | "hotkeys";

const TAB_ICON: Record<Tab, (size: number) => React.ReactNode> = {
  basic: (s) => <Monitor size={s} />,
  ai: (s) => <Bot size={s} />,
  hotkeys: (s) => <Keyboard size={s} />,
};

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("basic");

  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: t("settings.basic") },
    { key: "ai", label: t("settings.ai") },
    { key: "hotkeys", label: t("settings.hotkeys") },
  ];

  return (
    <div className={styles.page}>
      {/* ── left tab nav ── */}
      <div className={styles.nav}>
        <h2 className={styles.title}>{t("settings.title")}</h2>
        {tabs.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={styles.tab}
              data-active={active || undefined}
            >
              {/* active left accent bar */}
              {active && <span className={styles.accent} />}
              <span className={styles.icon}>{TAB_ICON[tb.key](20)}</span>
              {tb.label}
            </button>
          );
        })}
      </div>

      {/* ── right content ── */}
      <div className={styles.content}>
        <div key={tab} className={styles.fade}>
          {tab === "basic" && <BasicSettings />}
          {tab === "ai" && <AiConfigSettings />}
          {tab === "hotkeys" && <HotkeySettings />}
        </div>
      </div>
    </div>
  );
}

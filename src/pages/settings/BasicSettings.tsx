import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { ProviderLogo } from "../../components/ProviderLogo";
import type { ThemeMode } from "../../state/types";

export function BasicSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();

  const setProviderEnabled = (id: string, enabled: boolean) => {
    updateSettings({
      providers: settings.providers.map((p) => (p.id === id ? { ...p, enabled } : p)),
    });
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
      <section>
        <h3>{t("basic.language")}</h3>
        <select value={settings.language} disabled>
          <option value="zh-CN">中文</option>
        </select>
      </section>

      <section>
        <h3>{t("basic.theme")}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateSettings({ theme: mode })}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: settings.theme === mode ? "var(--accent)" : "transparent",
                color: settings.theme === mode ? "#fff" : "var(--fg)",
                cursor: "pointer",
              }}
            >
              {t(`basic.theme.${mode}`)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>{t("basic.enabledAi")}</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {settings.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={`${p.name} 启用状态`}
              onClick={() => setProviderEnabled(p.id, !p.enabled)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                opacity: p.enabled ? 1 : 0.4,
                transition: "opacity 0.15s",
              }}
            >
              <ProviderLogo name={p.name} logo={p.logo} size={44} />
              <span style={{ fontSize: 12 }}>{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>{t("basic.keepState")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle
            checked={settings.keepStateOnSwitch}
            label={t("basic.keepState")}
            onChange={(v) => updateSettings({ keepStateOnSwitch: v })}
          />
          <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>{t("basic.keepState.desc")}</span>
        </div>
      </section>
    </div>
  );
}

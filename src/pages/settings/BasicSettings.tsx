import { useState } from "react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { ProviderLogo } from "../../components/ProviderLogo";
import { setQuickAskProvider, setSelectionAutoPopup } from "../../lib/commands";
import type { QuickAskResetPolicy, Settings, ThemeMode } from "../../state/types";

const quickAskResetPolicyOptions: Array<{ value: QuickAskResetPolicy; labelKey: string }> = [
  { value: "reopen", labelKey: "basic.quickAskResetPolicy.reopen" },
  { value: "after5m", labelKey: "basic.quickAskResetPolicy.after5m" },
  { value: "after10m", labelKey: "basic.quickAskResetPolicy.after10m" },
  { value: "after20m", labelKey: "basic.quickAskResetPolicy.after20m" },
  { value: "after30m", labelKey: "basic.quickAskResetPolicy.after30m" },
  { value: "never", labelKey: "basic.quickAskResetPolicy.never" },
];

export function BasicSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [inUseHint, setInUseHint] = useState(false);

  const setProviderEnabled = (id: string, enabled: boolean) => {
    const enabledCount = settings.providers.filter((p) => p.enabled).length;
    // 至少保留一个启用
    if (!enabled && enabledCount <= 1) {
      setInUseHint(true);
      return;
    }
    setInUseHint(false);
    const nextProviders = settings.providers.map((p) => (p.id === id ? { ...p, enabled } : p));
    const patch: Partial<Settings> = { providers: nextProviders };
    // 若停用的是快捷提问当前使用的 provider，切到第一个启用的
    if (!enabled && id === settings.quickAskProviderId) {
      const firstEnabled = nextProviders.find((p) => p.enabled);
      if (firstEnabled) patch.quickAskProviderId = firstEnabled.id;
    }
    updateSettings(patch);
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
        {inUseHint && (
          <p style={{ color: "#e0a23a", fontSize: 12, marginTop: 8 }}>{t("settings.atLeastOneEnabled")}</p>
        )}
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

      <section>
        <h3>{t("basic.selectionAutoPopup")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle
            checked={settings.selectionAutoPopup}
            label={t("basic.selectionAutoPopup")}
            onChange={(v) => {
              updateSettings({ selectionAutoPopup: v });
              void setSelectionAutoPopup(v);
            }}
          />
          <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>{t("basic.selectionAutoPopup.desc")}</span>
        </div>
      </section>

      <section>
        <h3>快捷提问默认 AI</h3>
        <select
          value={settings.quickAskProviderId}
          onChange={(e) => {
            const id = e.target.value;
            const url = settings.providers.find((p) => p.id === id)?.url ?? "";
            updateSettings({ quickAskProviderId: id });
            void setQuickAskProvider(url);
          }}
        >
          {settings.providers.filter((p) => p.enabled).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </section>

      <section>
        <h3 id="quick-ask-reset-policy-label">{t("basic.quickAskResetPolicy")}</h3>
        <select
          aria-labelledby="quick-ask-reset-policy-label"
          value={settings.quickAskResetPolicy}
          onChange={(e) => {
            updateSettings({ quickAskResetPolicy: e.target.value as QuickAskResetPolicy });
          }}
        >
          {quickAskResetPolicyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}

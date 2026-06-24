import React, { useState } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { ProviderLogo } from "../../components/ProviderLogo";
import { SelectField } from "../../components/SelectField";
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

const THEME_OPTIONS: { mode: ThemeMode; labelKey: string; icon: (s: number) => React.ReactNode }[] = [
  { mode: "light", labelKey: "basic.theme.light", icon: (s) => <Sun size={s} /> },
  { mode: "dark", labelKey: "basic.theme.dark", icon: (s) => <Moon size={s} /> },
  { mode: "system", labelKey: "basic.theme.system", icon: (s) => <Monitor size={s} /> },
];

/* ── shared styles ── */
const cardOuter: React.CSSProperties = {
  background: "var(--bg-elev)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border)",
  padding: "16px 24px",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
};

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: "var(--fg)",
  margin: 0,
  lineHeight: 1.3,
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--fg-muted)",
  margin: "6px 0 0",
  lineHeight: 1.5,
};

export function BasicSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [inUseHint, setInUseHint] = useState(false);

  const setProviderEnabled = (id: string, enabled: boolean) => {
    const enabledCount = settings.providers.filter((p) => p.enabled).length;
    if (!enabled && enabledCount <= 1) {
      setInUseHint(true);
      return;
    }
    setInUseHint(false);
    const nextProviders = settings.providers.map((p) => (p.id === id ? { ...p, enabled } : p));
    const patch: Partial<Settings> = { providers: nextProviders };
    if (!enabled && id === settings.quickAskProviderId) {
      const firstEnabled = nextProviders.find((p) => p.enabled);
      if (firstEnabled) patch.quickAskProviderId = firstEnabled.id;
    }
    updateSettings(patch);
  };

  return (
    <div style={{ padding: "28px 28px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 820, margin: "0 auto", width: "100%" }}>

      {/* ── Language ── */}
      <div style={cardOuter}>
        <div style={row}>
          <div>
            <p style={titleStyle}>{t("basic.language")}</p>
          </div>
          <SelectField
            value={settings.language}
            options={[{ value: "zh-CN", label: "中文" }]}
            onChange={() => {}}
            disabled
          />
        </div>
      </div>

      {/* ── Theme ── */}
      <div style={cardOuter}>
        <div style={row}>
          <div>
            <p style={titleStyle}>{t("basic.theme")}</p>
          </div>
          <div
            style={{
              display: "inline-flex",
              background: "var(--bg)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              padding: 3,
              gap: 2,
            }}
          >
            {THEME_OPTIONS.map((opt) => {
              const active = settings.theme === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => updateSettings({ theme: opt.mode })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 16px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--fg-muted)",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    transition: `background 0.2s var(--ease-out-expo), color 0.2s var(--ease-out-expo)`,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.color = "var(--fg)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.color = "var(--fg-muted)";
                  }}
                >
                  {opt.icon(16)}
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Enabled AI ── */}
      <div style={cardOuter}>
        <p style={{ ...titleStyle, marginBottom: 16 }}>{t("basic.enabledAi")}</p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {settings.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={`${p.name} ${t("basic.providerEnabled")}`}
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
                transition: `opacity 0.2s var(--ease-out-expo), transform 0.2s var(--ease-out-expo)`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}
            >
              <ProviderLogo name={p.name} logo={p.logo} size={36} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
            </button>
          ))}
        </div>
        {inUseHint && (
          <p style={{ color: "#e0a23a", fontSize: 13, marginTop: 10, marginBottom: 0 }}>{t("settings.atLeastOneEnabled")}</p>
        )}
      </div>

      {/* ── Keep state ── */}
      <div style={cardOuter}>
        <div style={row}>
          <div>
            <p style={titleStyle}>{t("basic.keepState")}</p>
            <p style={descStyle}>{t("basic.keepState.desc")}</p>
          </div>
          <Toggle
            checked={settings.keepStateOnSwitch}
            label={t("basic.keepState")}
            onChange={(v) => updateSettings({ keepStateOnSwitch: v })}
          />
        </div>
      </div>

      {/* ── Selection auto popup ── */}
      <div style={cardOuter}>
        <div style={row}>
          <div>
            <p style={titleStyle}>{t("basic.selectionAutoPopup")}</p>
            <p style={descStyle}>{t("basic.selectionAutoPopup.desc")}</p>
          </div>
          <Toggle
            checked={settings.selectionAutoPopup}
            label={t("basic.selectionAutoPopup")}
            onChange={(v) => {
              updateSettings({ selectionAutoPopup: v });
              void setSelectionAutoPopup(v);
            }}
          />
        </div>
      </div>

      {/* ── Quick ask default AI ── */}
      <div style={cardOuter}>
        <div style={row}>
          <div>
            <p style={titleStyle}>{t("basic.quickAskProvider")}</p>
            <p style={descStyle}>{t("basic.quickAskProvider.desc")}</p>
          </div>
          <SelectField
            value={settings.quickAskProviderId}
            options={settings.providers.filter((p) => p.enabled).map((p) => ({ value: p.id, label: p.name }))}
            onChange={(id) => {
              const url = settings.providers.find((p) => p.id === id)?.url ?? "";
              updateSettings({ quickAskProviderId: id });
              void setQuickAskProvider(url);
            }}
          />
        </div>
      </div>

      {/* ── Quick ask reset policy ── */}
      <div style={cardOuter}>
        <div style={row}>
          <div>
            <p style={titleStyle} id="quick-ask-reset-policy-label">{t("basic.quickAskResetPolicy")}</p>
          </div>
          <SelectField
            value={settings.quickAskResetPolicy}
            options={quickAskResetPolicyOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            onChange={(v) => updateSettings({ quickAskResetPolicy: v as QuickAskResetPolicy })}
            labelledby="quick-ask-reset-policy-label"
          />
        </div>
      </div>
    </div>
  );
}

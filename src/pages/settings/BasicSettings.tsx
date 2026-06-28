import { useState, type ReactNode } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { ProviderLogo } from "../../components/ProviderLogo";
import { SelectField } from "../../components/SelectField";
import { SettingsLayout } from "../../components/SettingsLayout";
import { SettingRow } from "../../components/SettingRow";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import { setQuickAskProvider, setSelectionAutoPopup } from "../../lib/commands";
import type { QuickAskResetPolicy, Settings, ThemeMode } from "../../state/types";
import styles from "./BasicSettings.module.css";

const quickAskResetPolicyOptions: Array<{ value: QuickAskResetPolicy; labelKey: string }> = [
  { value: "reopen", labelKey: "basic.quickAskResetPolicy.reopen" },
  { value: "after5m", labelKey: "basic.quickAskResetPolicy.after5m" },
  { value: "after10m", labelKey: "basic.quickAskResetPolicy.after10m" },
  { value: "after20m", labelKey: "basic.quickAskResetPolicy.after20m" },
  { value: "after30m", labelKey: "basic.quickAskResetPolicy.after30m" },
  { value: "never", labelKey: "basic.quickAskResetPolicy.never" },
];

const THEME_OPTIONS: { value: ThemeMode; labelKey: string; icon: ReactNode }[] = [
  { value: "light", labelKey: "basic.theme.light", icon: <Sun size={16} /> },
  { value: "dark", labelKey: "basic.theme.dark", icon: <Moon size={16} /> },
  { value: "system", labelKey: "basic.theme.system", icon: <Monitor size={16} /> },
];

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
    <SettingsLayout gap={20} padding={28}>
      {/* ── Language ── */}
      <SettingRow title={t("basic.language")}>
        <SelectField
          value={settings.language}
          options={[{ value: "zh-CN", label: "中文" }]}
          onChange={() => {}}
          disabled
        />
      </SettingRow>

      {/* ── Theme ── */}
      <SettingRow title={t("basic.theme")}>
        <SegmentedControl
          options={THEME_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey), icon: o.icon }))}
          value={settings.theme}
          onChange={(v) => updateSettings({ theme: v })}
        />
      </SettingRow>

      {/* ── Enabled AI ── */}
      <Card>
        <p className={styles.enabledTitle}>{t("basic.enabledAi")}</p>
        <div className={styles.chips}>
          {settings.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={`${p.name} ${t("basic.providerEnabled")}`}
              onClick={() => setProviderEnabled(p.id, !p.enabled)}
              className={styles.chip}
              data-disabled={!p.enabled || undefined}
            >
              <ProviderLogo name={p.name} logo={p.logo} size={36} />
              <span className={styles.chipName}>{p.name}</span>
            </button>
          ))}
        </div>
        {inUseHint && <p className={styles.hint}>{t("settings.atLeastOneEnabled")}</p>}
      </Card>

      {/* ── Keep state ── */}
      <SettingRow title={t("basic.keepState")} desc={t("basic.keepState.desc")}>
        <Toggle
          checked={settings.keepStateOnSwitch}
          label={t("basic.keepState")}
          onChange={(v) => updateSettings({ keepStateOnSwitch: v })}
        />
      </SettingRow>

      {/* ── Selection auto popup ── */}
      <SettingRow title={t("basic.selectionAutoPopup")} desc={t("basic.selectionAutoPopup.desc")}>
        <Toggle
          checked={settings.selectionAutoPopup}
          label={t("basic.selectionAutoPopup")}
          onChange={(v) => {
            updateSettings({ selectionAutoPopup: v });
            void setSelectionAutoPopup(v);
          }}
        />
      </SettingRow>

      {/* ── Quick ask default AI ── */}
      <SettingRow title={t("basic.quickAskProvider")} desc={t("basic.quickAskProvider.desc")}>
        <SelectField
          value={settings.quickAskProviderId}
          options={settings.providers.filter((p) => p.enabled).map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => {
            const url = settings.providers.find((p) => p.id === id)?.url ?? "";
            updateSettings({ quickAskProviderId: id });
            void setQuickAskProvider(url);
          }}
        />
      </SettingRow>

      {/* ── Quick ask reset policy ── */}
      <SettingRow title={t("basic.quickAskResetPolicy")} titleId="quick-ask-reset-policy-label">
        <SelectField
          value={settings.quickAskResetPolicy}
          options={quickAskResetPolicyOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          onChange={(v) => updateSettings({ quickAskResetPolicy: v as QuickAskResetPolicy })}
          labelledby="quick-ask-reset-policy-label"
        />
      </SettingRow>
    </SettingsLayout>
  );
}

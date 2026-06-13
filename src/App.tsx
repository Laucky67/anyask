import { useEffect, useMemo, useState } from "react";
import { useSettings } from "./state/SettingsContext";
import { Sidebar } from "./components/Sidebar";
import { ContentArea } from "./components/ContentArea";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { useT } from "./i18n";
import { resolveTheme, applyTheme, watchSystemTheme, systemPrefersDark } from "./lib/theme";

export default function App() {
  const { settings, ready } = useSettings();
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const enabledProviders = useMemo(() => settings.providers.filter((p) => p.enabled), [settings.providers]);

  // 默认激活第一个 enabled 的 provider
  useEffect(() => {
    if (!ready) return;
    if (activeId && enabledProviders.some((p) => p.id === activeId)) return;
    setActiveId(enabledProviders[0]?.id ?? null);
  }, [ready, enabledProviders, activeId]);

  // 应用主题（启动 + 主题设置变化 + 跟随系统时监听系统变化）
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme, systemPrefersDark()));
    apply();
    return watchSystemTheme(() => {
      if (settings.theme === "system") apply();
    });
  }, [settings.theme]);

  if (!ready) return null;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sidebar
        providers={enabledProviders}
        activeId={activeId}
        settingsActive={showSettings}
        onSelect={(id) => {
          setActiveId(id);
          setShowSettings(false);
        }}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ContentArea
        showSettings={showSettings}
        settings={<SettingsPage />}
        emptyHint={enabledProviders.length === 0 ? t("common.empty") : ""}
      />
    </div>
  );
}

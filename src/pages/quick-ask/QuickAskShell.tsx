import { useEffect } from "react";
import { I18nProvider } from "../../i18n";
import { SettingsProvider, useSettings } from "../../state/SettingsContext";
import { resolveTheme, applyTheme, watchSystemTheme, systemPrefersDark } from "../../lib/theme";
import { QuickAskBar } from "./QuickAskBar";

/** 应用主题（同 App.tsx：启动 + 主题变化 + 跟随系统时监听系统变化） */
function ThemedBar() {
  const { settings } = useSettings();
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme, systemPrefersDark()));
    apply();
    return watchSystemTheme(() => {
      if (settings.theme === "system") apply();
    });
  }, [settings.theme]);
  return <QuickAskBar />;
}

/** 快捷提问窗的本地壳：仅渲染顶栏，顶栏下方留给原生 AI 子 webview 覆盖 */
export function QuickAskShell() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <ThemedBar />
      </SettingsProvider>
    </I18nProvider>
  );
}

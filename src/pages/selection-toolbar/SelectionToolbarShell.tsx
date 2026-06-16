import { useEffect } from "react";
import { I18nProvider } from "../../i18n";
import { SettingsProvider, useSettings } from "../../state/SettingsContext";
import { resolveTheme, applyTheme, watchSystemTheme, systemPrefersDark } from "../../lib/theme";
import { SelectionToolbar } from "./SelectionToolbar";

/** 应用主题（同 QuickAskShell：启动 + 主题变化 + 跟随系统） */
function ThemedToolbar() {
  const { settings } = useSettings();
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme, systemPrefersDark()));
    apply();
    return watchSystemTheme(() => {
      if (settings.theme === "system") apply();
    });
  }, [settings.theme]);
  return <SelectionToolbar />;
}

/** 划词工具条窗口的本地壳：透明窗口只显示药丸本体 */
export function SelectionToolbarShell() {
  useEffect(() => {
    // 覆盖 global.css 的 body 背景，让透明窗口只露出药丸
    document.body.style.background = "transparent";
  }, []);
  return (
    <I18nProvider>
      <SettingsProvider>
        <ThemedToolbar />
      </SettingsProvider>
    </I18nProvider>
  );
}

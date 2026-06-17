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
    // 透明窗口：html/body/#root 全部置透明并禁滚动条，覆盖 global.css 的
    // `body { background: var(--bg) }` 与 `height: 100%`，使窗口只露出药丸本体。
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    html.style.background = "transparent";
    html.style.overflow = "hidden";
    body.style.background = "transparent";
    body.style.overflow = "hidden";
    if (root) {
      root.style.background = "transparent";
      root.style.height = "auto";
      root.style.overflow = "hidden";
    }
  }, []);
  return (
    <I18nProvider>
      <SettingsProvider>
        <ThemedToolbar />
      </SettingsProvider>
    </I18nProvider>
  );
}

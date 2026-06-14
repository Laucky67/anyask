import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "./state/SettingsContext";
import { Sidebar } from "./components/Sidebar";
import { ContentArea } from "./components/ContentArea";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { useT } from "./i18n";
import { resolveTheme, applyTheme, watchSystemTheme, systemPrefersDark } from "./lib/theme";
import { syncAiWebviews, hideAiWebviews, repositionAiWebviews } from "./lib/commands";

export default function App() {
  const { settings, ready } = useSettings();
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const enabledProviders = useMemo(() => settings.providers.filter((p) => p.enabled), [settings.providers]);

  const reposition = () => {
    const el = contentRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    void repositionAiWebviews({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  };

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

  // 同步 AI webview，并按真实内容区矩形校正位置
  useEffect(() => {
    if (!ready) return;
    if (showSettings) {
      void hideAiWebviews();
      return;
    }
    // 等 activeId 确定后再同步：否则首个 effect 会以 activeId=null 触发，
    // 把激活项也按「保留」分支创建成隐藏，随后仅 show() 导致 WebView2 不绘制（白屏）。
    if (activeId === null && enabledProviders.length > 0) return;
    void syncAiWebviews(enabledProviders, activeId, settings.keepStateOnSwitch).then(reposition);
  }, [ready, showSettings, activeId, enabledProviders, settings.keepStateOnSwitch]);

  // 内容区尺寸变化时重定位（窗口缩放 / 布局变化）
  useEffect(() => {
    if (showSettings) return;
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => reposition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [showSettings]);

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
        ref={contentRef}
        showSettings={showSettings}
        settings={<SettingsPage />}
        emptyHint={enabledProviders.length === 0 ? t("common.empty") : ""}
      />
    </div>
  );
}

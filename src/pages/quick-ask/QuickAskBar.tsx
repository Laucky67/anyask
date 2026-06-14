import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Pin, SquarePen, ChevronDown } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../../i18n";
import { useSettings } from "../../state/SettingsContext";
import { ProviderLogo } from "../../components/ProviderLogo";
import { ProviderCard } from "../../components/ProviderCard";
import {
  hideQuickAsk,
  setQuickAskPinned,
  quickAskNewChat,
  setQuickAskProvider,
  setQuickAskAiVisible,
} from "../../lib/commands";

const ICON = 18;

/** 顶栏按钮：未激活/未悬停为 --fg-muted，激活或悬停为 --fg（浅色=黑、深色=白，随主题反转） */
function BarButton({
  label,
  onClick,
  children,
  pressed,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  active?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const color = active || hover ? "var(--fg)" : "var(--fg-muted)";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        border: "none",
        borderRadius: 6,
        background: hover ? "var(--bg-elev)" : "transparent",
        color,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function QuickAskBar() {
  const t = useT();
  const { settings, updateSettings } = useSettings();
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  // 供失焦监听读取最新 open（避免 effect 闭包过期，又不必每次 open 变化重订阅）
  const openRef = useRef(open);
  openRef.current = open;

  const enabled = settings.providers.filter((p) => p.enabled);
  const current = enabled.find((p) => p.id === settings.quickAskProviderId) ?? enabled[0];

  const togglePin = async () => {
    const next = !pinned;
    try {
      await setQuickAskPinned(next);
      setPinned(next);
    } catch {
      // 命令失败：保持原状态，避免按钮显示已置顶而窗口实际未置顶
    }
  };

  // 任何关闭路径都必经此：复位面板 + 尽力恢复 AI 显示（吞掉失败，避免悬浮窗留白）
  const closePanel = useCallback(async () => {
    setOpen(false);
    try {
      await setQuickAskAiVisible(true);
    } catch {
      /* best-effort */
    }
  }, []);

  const openPanel = () => {
    setOpen(true);
    void setQuickAskAiVisible(false); // 隐藏 AI 子 webview，让出 React 区域给面板
  };

  const select = async (id: string) => {
    const url = settings.providers.find((p) => p.id === id)?.url ?? "";
    try {
      if (id !== settings.quickAskProviderId) {
        void updateSettings({ quickAskProviderId: id }); // 持久为默认
        if (url) await setQuickAskProvider(url); // 导航单个 webview
      }
    } catch {
      // 导航失败：维持原 AI（不切换），由 finally 恢复显示
    } finally {
      void closePanel();
    }
  };

  // 窗口失焦时复位（含被快捷键隐藏的情况）：只 setOpen 会留白，故走 closePanel 恢复 AI
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused && openRef.current) void closePanel();
      })
      .then((un) => {
        unlisten = un;
      });
    return () => unlisten?.();
  }, [closePanel]);

  // 卸载兜底：窗口销毁前尽力恢复 AI 显示
  useEffect(
    () => () => {
      void setQuickAskAiVisible(true).catch(() => {});
    },
    []
  );

  return (
    <>
      {/* 顶栏根作为拖动区；Tauri 2 的 data-tauri-drag-region 不向子元素传播，
          故中间再放一个带该属性的 spacer 覆盖大片空白；按钮不带该属性（保持可点）。*/}
      <div
        data-tauri-drag-region
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          userSelect: "none",
        }}
      >
        <BarButton label={t("quickAsk.hide")} onClick={() => void hideQuickAsk()}>
          <Minus size={ICON} />
        </BarButton>
        <BarButton
          label={t("quickAsk.pin")}
          pressed={pinned}
          active={pinned}
          onClick={() => void togglePin()}
        >
          <Pin size={ICON} fill={pinned ? "currentColor" : "none"} />
        </BarButton>

        <div data-tauri-drag-region style={{ flex: 1, alignSelf: "stretch" }} />

        <BarButton label={t("quickAsk.newChat")} onClick={() => void quickAskNewChat()}>
          <SquarePen size={ICON} />
        </BarButton>

        {/* AI 选择器：显示当前 AI 图标 + 箭头；点击切换面板显隐 */}
        <button
          type="button"
          aria-label={t("quickAsk.selectAi")}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => (open ? void closePanel() : openPanel())}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: 28,
            padding: "0 6px",
            border: "none",
            borderRadius: 6,
            background: open ? "var(--bg-elev)" : "transparent",
            color: "var(--fg)",
            cursor: "pointer",
          }}
        >
          {current && <ProviderLogo name={current.name} logo={current.logo} size={20} />}
          <ChevronDown size={14} color="var(--fg-muted)" />
        </button>
      </div>

      {/* 选择面板：占满顶栏下方区域（AI 已隐藏）。点空白处关闭（防卡片冒泡触发）。*/}
      {open && (
        <div
          data-testid="ai-panel"
          onClick={(e) => {
            if (e.target === e.currentTarget) void closePanel();
          }}
          style={{
            position: "fixed",
            top: 40,
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--bg)",
            padding: 12,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {enabled.map((p) => (
            <ProviderCard
              key={p.id}
              name={p.name}
              logo={p.logo}
              width="100%"
              selected={p.id === current?.id}
              onClick={() => void select(p.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../../i18n";
import {
  BUILTIN_SELECTION_ACTIONS,
  ICON_REGISTRY,
  buildSelectionPrompt,
  enabledActions,
  type SelectionAction,
} from "../../state/selectionActions";
import { useSettings } from "../../state/SettingsContext";
import {
  placeAndShowSelectionToolbar,
  hideSelectionToolbar,
  getPendingSelectionShow,
  copySelection,
  showQuickAskWithPrompt,
} from "../../lib/commands";
import styles from "./SelectionToolbar.module.css";

const SHOW_EVENT = "selection-toolbar:show";

/** 工具条按钮：图标 + 标签；hover 反白（同 QuickAskBar 观感） */
function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={styles.toolBtn}>
      {children}
    </button>
  );
}

export function SelectionToolbar() {
  const t = useT();
  const { settings } = useSettings();
  const outerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<string>("");
  const actions = enabledActions(BUILTIN_SELECTION_ACTIONS);

  // 连同阴影留白一起测量，让透明窗口完整容纳药丸和阴影。
  const requestShow = useCallback(() => {
    const el = outerRef.current;
    const pill = pillRef.current;
    if (!el || !pill) return;
    const r = el.getBoundingClientRect();
    const padding = (r.height - pill.getBoundingClientRect().height) / 2;
    void placeAndShowSelectionToolbar(r.width, r.height, padding);
  }, []);

  // 首帧兜底：窗口首次创建时事件已丢，挂载时主动读 pending
  useEffect(() => {
    void getPendingSelectionShow().then((p) => {
      if (p.show) {
        textRef.current = p.text;
        requestShow();
      }
    });
  }, [requestShow]);

  // 后续触发：事件唤醒 → 读最新 text → 显示
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen(SHOW_EVENT, () => {
      void getPendingSelectionShow().then((p) => {
        textRef.current = p.text;
        requestShow();
      });
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, [requestShow]);

  const runAction = useCallback((action: SelectionAction) => {
    if (action.kind === "copy") {
      void copySelection();
    } else {
      const selectedText = textRef.current;
      const prompt = selectedText.trim()
        ? buildSelectionPrompt(action, selectedText, settings.language)
        : null;
      void showQuickAskWithPrompt(prompt);
    }
    void hideSelectionToolbar();
  }, [settings.language]);

  return (
    <div ref={outerRef} className={styles.surface}>
      <div ref={pillRef} className={styles.pill}>
        {actions.map((a) => {
          const Icon = ICON_REGISTRY[a.icon];
          const label = a.labelKey ? t(a.labelKey) : a.label ?? "";
          return (
            <ToolbarButton key={a.id} label={label} onClick={() => runAction(a)}>
              {Icon ? <Icon size={16} /> : null}
              <span className={styles.label}>{label}</span>
            </ToolbarButton>
          );
        })}
      </div>
    </div>
  );
}

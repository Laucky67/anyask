import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../../i18n";
import {
  BUILTIN_SELECTION_ACTIONS,
  ICON_REGISTRY,
  enabledActions,
  type SelectionAction,
} from "../../state/selectionActions";
import {
  placeAndShowSelectionToolbar,
  hideSelectionToolbar,
  getPendingSelectionShow,
  copySelection,
  showQuickAsk,
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
  const outerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<string>("");
  const actions = enabledActions(BUILTIN_SELECTION_ACTIONS);

  // 测量药丸真实尺寸 → 请求 Rust 定位并显示
  const requestShow = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    void placeAndShowSelectionToolbar(r.width, r.height);
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
      // 三个非复制按钮本期一致：打印捕获文本（备份观察）+ 打开快捷提问
      console.log("[selection]", action.kind, textRef.current);
      void showQuickAsk();
    }
    void hideSelectionToolbar();
  }, []);

  return (
    // 窗口尺寸 = 本药丸尺寸（place_and_show 按实测 rect 设窗），不留任何透明边距，
    // 故不加外层 padding，也不用 boxShadow（会被窗口边界裁掉）。圆角外的四角为透明窗体。
    <div ref={outerRef} className={styles.pill}>
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
  );
}

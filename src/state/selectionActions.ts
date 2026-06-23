import { BookOpen, Languages, AlignLeft, Copy, type LucideIcon } from "lucide-react";

/** 行为派发依据；"prompt" 为未来自建按钮预留 */
export type SelectionActionKind = "explain" | "translate" | "summarize" | "copy" | "prompt";

export interface SelectionAction {
  id: string; // 内置 = kind；自建 = uuid
  source: "builtin" | "custom";
  kind: SelectionActionKind;
  labelKey?: string; // 内置走 i18n
  label?: string; // 自建走原文（未来）
  icon: string; // lucide 图标名（存字符串，未来自建可选图标）
  enabled: boolean;
  order: number;
  // 未来：promptTemplate?: string —— 自建按钮发给 AI 的提示词模板
}

export const BUILTIN_SELECTION_ACTIONS: SelectionAction[] = [
  { id: "explain", source: "builtin", kind: "explain", labelKey: "selection.explain", icon: "BookOpen", enabled: true, order: 1 },
  { id: "translate", source: "builtin", kind: "translate", labelKey: "selection.translate", icon: "Languages", enabled: true, order: 2 },
  { id: "summarize", source: "builtin", kind: "summarize", labelKey: "selection.summarize", icon: "AlignLeft", enabled: true, order: 3 },
  { id: "copy", source: "builtin", kind: "copy", labelKey: "selection.copy", icon: "Copy", enabled: true, order: 4 },
];

/** 按字符串名取 lucide 组件（为未来自建按钮选图标铺路） */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  Languages,
  AlignLeft,
  Copy,
};

/** 取启用的动作，按 order 升序 */
export function enabledActions(actions: SelectionAction[]): SelectionAction[] {
  return actions.filter((a) => a.enabled).sort((a, b) => a.order - b.order);
}

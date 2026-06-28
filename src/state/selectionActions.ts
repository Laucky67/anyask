import { BookOpen, Languages, AlignLeft, Copy, type LucideIcon } from "lucide-react";
import type { Language } from "./types";

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
  promptTemplate?: string; // 内置/自建按钮发给 AI 的提示词模板
}

export const BUILTIN_SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: "explain",
    source: "builtin",
    kind: "explain",
    labelKey: "selection.explain",
    icon: "BookOpen",
    enabled: true,
    order: 1,
    promptTemplate: "{{selection}}\n\n解释上文",
  },
  {
    id: "translate",
    source: "builtin",
    kind: "translate",
    labelKey: "selection.translate",
    icon: "Languages",
    enabled: true,
    order: 2,
    promptTemplate: "{{selection}}\n\n翻译上文至{{targetLanguage}}",
  },
  {
    id: "summarize",
    source: "builtin",
    kind: "summarize",
    labelKey: "selection.summarize",
    icon: "AlignLeft",
    enabled: true,
    order: 3,
    promptTemplate: "{{selection}}\n\n总结上文",
  },
  { id: "copy", source: "builtin", kind: "copy", labelKey: "selection.copy", icon: "Copy", enabled: true, order: 4 },
];

/** 按字符串名取 lucide 组件（为未来自建按钮选图标铺路） */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  Languages,
  AlignLeft,
  Copy,
};

const TARGET_LANGUAGE_NAMES: Record<Language, string> = {
  "zh-CN": "简体中文",
};

export function languageName(language: Language): string {
  return TARGET_LANGUAGE_NAMES[language];
}

export function buildSelectionPrompt(
  action: SelectionAction,
  selection: string,
  language: Language
): string | null {
  if (!action.promptTemplate) return null;
  return action.promptTemplate
    .replace(/\{\{selection\}\}/g, selection)
    .replace(/\{\{targetLanguage\}\}/g, languageName(language));
}

/** 取启用的动作，按 order 升序 */
export function enabledActions(actions: SelectionAction[]): SelectionAction[] {
  return actions.filter((a) => a.enabled).sort((a, b) => a.order - b.order);
}

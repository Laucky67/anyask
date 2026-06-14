import type { ThemeMode } from "../state/types";

export type EffectiveTheme = "light" | "dark";

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): EffectiveTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export function applyTheme(effective: EffectiveTheme): void {
  document.documentElement.setAttribute("data-theme", effective);
}

/** 监听系统主题变化，回调返回是否暗色；返回取消订阅函数 */
export function watchSystemTheme(cb: (prefersDark: boolean) => void): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

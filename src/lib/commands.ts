import { invoke } from "@tauri-apps/api/core";
import type { AiProvider } from "../state/types";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 同步 AI webview：创建/显示/隐藏/销毁 */
export async function syncAiWebviews(
  providers: AiProvider[],
  activeId: string | null,
  keepState: boolean
): Promise<void> {
  await invoke("sync_ai_webviews", {
    providers: providers.map((p) => ({ id: p.id, url: p.url })),
    activeId,
    keepState,
  });
}

/** 隐藏全部 AI webview（打开设置时） */
export async function hideAiWebviews(): Promise<void> {
  await invoke("hide_ai_webviews");
}

/** 按真实内容区矩形重定位 AI webview（校正位置，不依赖硬编码侧栏宽度） */
export async function repositionAiWebviews(bounds: Bounds): Promise<void> {
  await invoke("reposition_ai_webviews", { bounds });
}

/** 各快捷键的注册结果（false = 解析失败或与系统/输入法冲突） */
export interface HotkeyRegistration {
  quickAsk: boolean;
  showMain: boolean;
}

/** 通知 Rust 用最新设置重新注册全局快捷键，返回每个键的注册结果 */
export async function applyHotkeys(): Promise<HotkeyRegistration> {
  return await invoke<HotkeyRegistration>("apply_hotkeys");
}

/** 显示并聚焦主窗口 */
export async function showMainWindow(): Promise<void> {
  await invoke("show_main_window");
}

/** 切换快捷提问窗显隐 */
export async function toggleQuickAsk(): Promise<void> {
  await invoke("toggle_quick_ask");
}

/** 设置快捷提问窗加载的 provider（传 url）；失败会 reject */
export async function setQuickAskProvider(url: string): Promise<void> {
  await invoke("set_quick_ask_provider", { url });
}

/** 显隐快捷提问窗的 AI 子 webview（打开 AI 选择面板时隐藏，关闭后恢复） */
export async function setQuickAskAiVisible(visible: boolean): Promise<void> {
  await invoke("set_quick_ask_ai_visible", { visible });
}

/** 隐藏快捷提问窗（顶栏隐藏按钮） */
export async function hideQuickAsk(): Promise<void> {
  await invoke("hide_quick_ask");
}

/** 设置快捷提问窗置顶（顶栏图钉按钮）；失败会 reject，供 UI 回滚 */
export async function setQuickAskPinned(pinned: boolean): Promise<void> {
  await invoke("set_quick_ask_pinned", { pinned });
}

/** 快捷提问窗新对话：导航回首页（已在首页则不操作） */
export async function quickAskNewChat(): Promise<void> {
  await invoke("quick_ask_new_chat");
}

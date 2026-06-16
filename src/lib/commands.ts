import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { AiProvider, LogoAction, LogoResult, ProviderLogo } from "../state/types";

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
  selectionToolbar: boolean;
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

/** LogoResult → ProviderLogo：image.path 用 convertFileSrc 转成可加载 URL */
function logoResultToProviderLogo(result: LogoResult, bustCache = false): ProviderLogo {
  if (result.type === "letter") return { type: "letter", color: result.color };
  const url = convertFileSrc(result.path);
  // 同名覆盖（替换 Logo）时文件路径不变 → URL 不变 → 浏览器命中旧图缓存、各处不刷新。
  // 上传场景追加版本号，强制 <img> 重新拉取。
  return { type: "image", src: bustCache ? `${url}?v=${Date.now()}` : url };
}

/** 新增 provider：后端生成真实 id 与 logo，前端负责写入 settings */
export async function addProvider(input: {
  name: string;
  url: string;
  enabled: boolean;
  logoAction: LogoAction;
}): Promise<{ id: string; logo: ProviderLogo }> {
  const [id, result] = await invoke<[string, LogoResult]>("add_provider", input);
  return { id, logo: logoResultToProviderLogo(result, input.logoAction.type === "upload") };
}

/** 保存已有 provider：后端校验并处理 logo，返回最终 logo 供前端写入 settings */
export async function saveProvider(input: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  logoAction: LogoAction;
}): Promise<ProviderLogo> {
  const result = await invoke<LogoResult>("validate_and_save_provider", input);
  return logoResultToProviderLogo(result, input.logoAction.type === "upload");
}

/** 删除 provider 的 logo 文件（settings 由前端更新） */
export async function deleteProvider(id: string): Promise<void> {
  await invoke("delete_provider", { id });
}

/** 刷新主窗口当前激活的 AI webview */
export async function refreshActiveAiWebview(providerId: string): Promise<void> {
  await invoke("refresh_active_ai_webview", { providerId });
}

/** 划词捕获的待显示状态（与 Rust PendingSelection 对应） */
export interface PendingSelection {
  text: string;
  x: number;
  y: number;
  show: boolean;
}

/** 定位（防溢出）并显示划词工具条；传前端测得的逻辑尺寸 */
export async function placeAndShowSelectionToolbar(width: number, height: number): Promise<void> {
  await invoke("place_and_show_selection_toolbar", { width, height });
}

/** 隐藏划词工具条 */
export async function hideSelectionToolbar(): Promise<void> {
  await invoke("hide_selection_toolbar");
}

/** 读取划词待显示状态（首帧兜底 / 事件后读 text） */
export async function getPendingSelectionShow(): Promise<PendingSelection> {
  return await invoke<PendingSelection>("get_pending_selection_show");
}

/** 复制：把捕获文本写入剪贴板 */
export async function copySelection(): Promise<void> {
  await invoke("copy_selection");
}

/** 打开快捷提问窗口（划词「解释/翻译/总结」用，无条件显示） */
export async function showQuickAsk(): Promise<void> {
  await invoke("show_quick_ask");
}

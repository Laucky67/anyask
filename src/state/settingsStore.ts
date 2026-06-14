import { load, type Store } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";
import type { Settings } from "./types";
import { mergeSettings } from "./defaults";

const STORE_FILE = "settings.json";
const KEY = "settings";

/** 设置变更的跨窗口广播事件名。
 * plugin-store 自带的 onChange/onKeyChange 按 resourceId 过滤、不跨窗口（各窗口 load 得到不同 rid），
 * 故主窗口与悬浮窗需靠此全局事件同步各自的内存设置。 */
export const SETTINGS_CHANGED_EVENT = "settings:changed";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { defaults: {}, autoSave: true });
  }
  return storePromise;
}

/** 读取设置；缺字段用默认值补全 */
export async function loadSettings(): Promise<Settings> {
  const store = await getStore();
  const stored = await store.get<Partial<Settings>>(KEY);
  return mergeSettings(stored ?? null);
}

/** 全量写回设置，并跨窗口广播（另一个窗口的 SettingsProvider 据此同步内存状态） */
export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set(KEY, settings);
  await store.save();
  // 广播为 best-effort：失败不影响已完成的持久化
  emit(SETTINGS_CHANGED_EVENT, settings).catch(() => {});
}

import { load, type Store } from "@tauri-apps/plugin-store";
import type { Settings } from "./types";
import { mergeSettings } from "./defaults";

const STORE_FILE = "settings.json";
const KEY = "settings";

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

/** 全量写回设置 */
export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set(KEY, settings);
  await store.save();
}

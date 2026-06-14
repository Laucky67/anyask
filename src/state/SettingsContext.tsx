import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Settings } from "./types";
import { DEFAULT_SETTINGS, mergeSettings } from "./defaults";
import { loadSettings, saveSettings, SETTINGS_CHANGED_EVENT } from "./settingsStore";

interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  /** 合并 patch、写回 store；返回的 Promise 在持久化完成后 resolve（调用方可据此排序后续动作） */
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  // 跟踪最新设置，使 updateSettings 能同步算出 next 并返回保存 Promise，避免闭包过期
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (alive) {
        settingsRef.current = s;
        setSettings(s);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // 跨窗口同步：另一个窗口写设置后会广播，此处更新内存状态（不再写回，避免回环）。
  // 修复「悬浮窗换 AI 后主窗口设置不同步 / 主窗口停用的 AI 仍出现在悬浮窗选择器」。
  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    listen<Partial<Settings>>(SETTINGS_CHANGED_EVENT, (e) => {
      const merged = mergeSettings(e.payload ?? null);
      settingsRef.current = merged;
      setSettings(merged);
    })
      .then((un) => {
        if (alive) unlisten = un;
        else un();
      })
      .catch(() => {
        /* 非 Tauri 环境（单元测试）忽略 */
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>): Promise<void> => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    return saveSettings(next);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, ready, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

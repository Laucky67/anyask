import type { AiProvider, Settings } from "./types";

export const DEFAULT_PROVIDERS: AiProvider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true, logo: { type: "letter", color: "#10A37F" } },
  { id: "claude", name: "Claude", url: "https://claude.ai", enabled: true, logo: { type: "letter", color: "#D97757" } },
  { id: "aistudio", name: "Google AI Studio", url: "https://aistudio.google.com", enabled: true, logo: { type: "letter", color: "#4285F4" } },
];

export const DEFAULT_SETTINGS: Settings = {
  language: "zh-CN",
  theme: "system",
  keepStateOnSwitch: true,
  providers: DEFAULT_PROVIDERS,
  hotkeys: { quickAsk: "Shift+Z", showMain: "CommandOrControl+Alt+Space" },
  quickAskProviderId: "chatgpt",
  quickAskResetPolicy: "after5m",
};

/** 深拷贝默认值，避免外部修改污染常量 */
function cloneDefaults(): Settings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
}

/** 把（可能不完整/旧版）已存设置与默认值合并，保证字段齐全且不修改常量 */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const base = cloneDefaults();
  if (!stored) return base;
  return {
    language: stored.language ?? base.language,
    theme: stored.theme ?? base.theme,
    keepStateOnSwitch: stored.keepStateOnSwitch ?? base.keepStateOnSwitch,
    providers: stored.providers && stored.providers.length > 0 ? stored.providers : base.providers,
    hotkeys: {
      quickAsk: stored.hotkeys?.quickAsk ?? base.hotkeys.quickAsk,
      showMain: stored.hotkeys?.showMain ?? base.hotkeys.showMain,
    },
    quickAskProviderId: stored.quickAskProviderId ?? base.quickAskProviderId,
    quickAskResetPolicy: stored.quickAskResetPolicy ?? base.quickAskResetPolicy,
  };
}

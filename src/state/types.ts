export type ThemeMode = "light" | "dark" | "system";
export type Language = "zh-CN";

export type ProviderLogo =
  | { type: "letter"; color: string }
  | { type: "image"; src: string };

export interface AiProvider {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  logo: ProviderLogo;
}

export interface Hotkeys {
  quickAsk: string;
  showMain: string;
  selectionToolbar: string;
}

export type QuickAskResetPolicy = "reopen" | "after5m" | "after10m" | "after20m" | "after30m" | "never";

export interface Settings {
  language: Language;
  theme: ThemeMode;
  keepStateOnSwitch: boolean;
  providers: AiProvider[];
  hotkeys: Hotkeys;
  quickAskProviderId: string;
  quickAskResetPolicy: QuickAskResetPolicy;
}

export type LogoAction =
  | { type: "keep" }
  | { type: "upload"; dataUrl: string }
  | { type: "generate"; name: string };

export type LogoResult =
  | { type: "letter"; color: string }
  | { type: "image"; path: string };

export interface DraftProvider extends AiProvider {
  /** 已选并生成的 128×128 base64；存在则保存时 logoAction = upload */
  pendingLogoDataUrl?: string;
}

export interface ValidationErrors {
  name?: string;
  url?: string;
  logo?: string;
  general?: string;
}

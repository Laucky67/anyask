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
}

export interface Settings {
  language: Language;
  theme: ThemeMode;
  keepStateOnSwitch: boolean;
  providers: AiProvider[];
  hotkeys: Hotkeys;
  quickAskProviderId: string;
}

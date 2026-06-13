import { createContext, useContext, type ReactNode } from "react";
import { zhCN } from "./zh-CN";

const dict = zhCN;

export function translate(key: string): string {
  return dict[key] ?? key;
}

type TFn = (key: string) => string;
const I18nContext = createContext<TFn>(translate);

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

export function useT(): TFn {
  return useContext(I18nContext);
}

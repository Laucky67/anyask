import type { CSSProperties, ReactNode } from "react";
import styles from "./SettingsLayout.module.css";

interface Props {
  children: ReactNode;
  /** 列间距,各设置页不同(基础 20 / AI 10 / 快捷键 12) */
  gap?: number;
  padding?: CSSProperties["padding"];
}

/** 设置页统一容器:居中、最大宽 820、纵向排列。间距/内边距按页面传入。 */
export function SettingsLayout({ children, gap = 16, padding = 24 }: Props) {
  return (
    <div className={styles.layout} style={{ gap, padding }}>
      {children}
    </div>
  );
}

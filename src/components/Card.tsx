import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface Props {
  children: ReactNode;
  className?: string;
}

/** 设置卡片外壳:浅底、大圆角、细边框。供 SettingRow 与自定义卡片复用。 */
export function Card({ children, className }: Props) {
  return <div className={className ? `${styles.card} ${className}` : styles.card}>{children}</div>;
}

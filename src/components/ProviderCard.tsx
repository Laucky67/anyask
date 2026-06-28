import { ChevronDown, ChevronUp } from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";
import type { ProviderLogo as ProviderLogoType } from "../state/types";
import styles from "./ProviderCard.module.css";

interface Props {
  name: string;
  logo: ProviderLogoType;
  selected?: boolean;
  onClick?: () => void;
  /** 宽度，默认 "100%" 随父容器自适应；也可传固定值控制 */
  width?: number | string;
  logoSize?: number;
  /** 右侧箭头：不传 = 不显示；"up" 展开态，"down" 折叠态 */
  arrow?: "up" | "down";
  /** 尺寸：sm(默认)=快捷提问紧凑；lg=设置页更高、字更大更粗 */
  size?: "sm" | "lg";
}

/**
 * 可复用的 provider 卡片：圆角矩形，左 Logo + 右 Name。
 * 等宽卡片下各卡 logo 左对齐、文字右缘对齐。零业务依赖，可在选择器/设置页复用。
 * 选中态(data-selected)= accent 边框 + 浅底；hover(仅可点击态)= 浅底。
 */
export function ProviderCard({ name, logo, selected, onClick, width = "100%", logoSize, arrow, size = "sm" }: Props) {
  const ls = logoSize ?? (size === "lg" ? 24 : 28);
  const className = `${styles.card} ${size === "lg" ? styles.lg : styles.sm}`;

  const content = (
    <>
      <ProviderLogo name={name} logo={logo} size={ls} />
      <span className={styles.name}>{name}</span>
      {arrow === "up" && <ChevronUp size={18} color="var(--fg-muted)" />}
      {arrow === "down" && <ChevronDown size={18} color="var(--fg-muted)" />}
    </>
  );

  if (!onClick) {
    return (
      <div className={className} data-selected={selected || undefined} style={{ width }}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={selected}
      onClick={onClick}
      className={className}
      data-selected={selected || undefined}
      style={{ width }}
    >
      {content}
    </button>
  );
}

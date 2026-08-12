import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
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
  /** 可选的左侧操作区；配置页用它放置独立拖拽把手，避免与卡片点击冲突。 */
  dragHandle?: ReactNode;
}

/**
 * 可复用的 provider 卡片：圆角矩形，左 Logo + 右 Name。
 * 等宽卡片下各卡 logo 左对齐、文字右缘对齐。零业务依赖，可在选择器/设置页复用。
 * 选中态(data-selected)= accent 边框 + 浅底；hover(仅可点击态)= 浅底。
 */
export function ProviderCard({ name, logo, selected, onClick, width = "100%", logoSize, arrow, size = "sm", dragHandle }: Props) {
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

  // 拖拽把手本身是 button，不能嵌套在可点击的卡片 button 内。
  // 有把手时将卡片内容拆为相邻的 button，保持原有卡片点击语义与无障碍名称。
  if (dragHandle) {
    return (
      <div
        className={className}
        data-selected={selected || undefined}
        data-interactive
        style={{ width }}
      >
        {dragHandle}
        <button
          type="button"
          aria-label={name}
          aria-pressed={selected}
          onClick={onClick}
          className={styles.cardMain}
        >
          {content}
        </button>
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

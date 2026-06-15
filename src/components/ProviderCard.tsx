import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";
import type { ProviderLogo as ProviderLogoType } from "../state/types";

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
}

/**
 * 可复用的 provider 卡片：圆角矩形，左 Logo + 右 Name。
 * 等宽卡片下各卡 logo 左对齐、文字右缘对齐。零业务依赖，可在选择器/设置页复用。
 */
export function ProviderCard({ name, logo, selected, onClick, width = "100%", logoSize = 28, arrow }: Props) {
  const [hover, setHover] = useState(false);
  const active = selected || hover;

  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width,
    padding: "8px 12px",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 10,
    background: active ? "var(--bg-elev)" : "transparent",
    color: "var(--fg)",
    cursor: onClick ? "pointer" : "default",
    textAlign: "left",
    boxSizing: "border-box",
  };

  const content = (
    <>
      <ProviderLogo name={name} logo={logo} size={logoSize} />
      <span
        style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {name}
      </span>
      {arrow === "up" && <ChevronUp size={18} color="var(--fg-muted)" />}
      {arrow === "down" && <ChevronDown size={18} color="var(--fg-muted)" />}
    </>
  );

  if (!onClick) {
    return <div style={style}>{content}</div>;
  }
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={selected}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {content}
    </button>
  );
}

import type { ReactNode } from "react";
import styles from "./SegmentedControl.module.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** 分段控件:一排互斥选项,选中项填充 accent。 */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className={styles.group}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={styles.segment}
          data-active={opt.value === value || undefined}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

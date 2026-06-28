import type { ReactNode } from "react";
import { Card } from "./Card";
import styles from "./SettingRow.module.css";

interface Props {
  title: string;
  desc?: string;
  titleId?: string;
  /** 右侧控件(开关/下拉/分段控件等) */
  children?: ReactNode;
}

/** 设置行:卡片内左侧 title(+desc)、右侧控件。 */
export function SettingRow({ title, desc, titleId, children }: Props) {
  return (
    <Card>
      <div className={styles.row}>
        <div>
          <p className={styles.title} id={titleId}>{title}</p>
          {desc && <p className={styles.desc}>{desc}</p>}
        </div>
        {children}
      </div>
    </Card>
  );
}

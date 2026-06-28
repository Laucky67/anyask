import { forwardRef, type ReactNode } from "react";
import styles from "./ContentArea.module.css";

interface Props {
  showSettings: boolean;
  settings: ReactNode;
  emptyHint?: string;
}

export const ContentArea = forwardRef<HTMLDivElement, Props>(function ContentArea(
  { showSettings, settings, emptyHint },
  ref
) {
  return (
    <div className={styles.area}>
      {showSettings ? (
        <div className={styles.settings}>{settings}</div>
      ) : (
        <div ref={ref} data-content-area data-testid="content-area" className={styles.content}>
          {emptyHint ? <div className={styles.empty}>{emptyHint}</div> : null}
        </div>
      )}
    </div>
  );
});

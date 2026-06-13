import type { ReactNode } from "react";

interface Props {
  /** 设置页打开时渲染设置内容；否则渲染 AI 占位（原生 webview 覆盖其上） */
  showSettings: boolean;
  settings: ReactNode;
  emptyHint?: string;
}

export function ContentArea({ showSettings, settings, emptyHint }: Props) {
  return (
    <div style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
      {showSettings ? (
        <div style={{ height: "100%", overflow: "auto" }}>{settings}</div>
      ) : (
        <div
          data-content-area
          data-testid="content-area"
          style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-muted)" }}
        >
          {emptyHint ?? ""}
        </div>
      )}
    </div>
  );
}

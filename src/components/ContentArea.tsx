import { forwardRef, type ReactNode } from "react";

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
    <div style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
      {showSettings ? (
        <div style={{ height: "100%", overflow: "auto" }}>{settings}</div>
      ) : (
        <div
          ref={ref}
          data-content-area
          data-testid="content-area"
          style={{ height: "100%" }}
        >
          {emptyHint ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-muted)" }}>
              {emptyHint}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});

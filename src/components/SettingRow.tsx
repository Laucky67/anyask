import type { CSSProperties, ReactNode } from "react";

interface Props {
  title: string;
  desc?: string;
  titleId?: string;
  children: ReactNode;
}

const S: Record<string, CSSProperties> = {
  card: {
    background: "var(--bg-elev)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border)",
    padding: 24,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--fg)",
    margin: 0,
  },
  desc: {
    fontSize: 13,
    color: "var(--fg-muted)",
    margin: "4px 0 0",
    lineHeight: 1.5,
  },
};

export function SettingRow({ title, desc, titleId, children }: Props) {
  return (
    <div style={S.card}>
      <div style={S.row}>
        <div>
          <p style={S.title} id={titleId}>{title}</p>
          {desc && <p style={S.desc}>{desc}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

import type { AiProvider } from "../state/types";
import { ProviderLogo } from "./ProviderLogo";
import { useT } from "../i18n";

interface Props {
  providers: AiProvider[];
  activeId: string | null;
  settingsActive: boolean;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ providers, activeId, settingsActive, onSelect, onOpenSettings }: Props) {
  const t = useT();
  return (
    <nav
      style={{
        width: "var(--sidebar-w)",
        height: "100%",
        background: "var(--bg-elev)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.name}
            title={p.name}
            onClick={() => onSelect(p.id)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 2,
              borderRadius: 10,
              outline: !settingsActive && activeId === p.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            <ProviderLogo name={p.name} logo={p.logo} size={40} />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={t("sidebar.settings")}
        title={t("sidebar.settings")}
        onClick={onOpenSettings}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 22,
          color: settingsActive ? "var(--accent)" : "var(--fg-muted)",
        }}
      >
        ⚙
      </button>
    </nav>
  );
}

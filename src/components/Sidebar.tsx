import { RotateCw, Settings } from "lucide-react";
import type { AiProvider } from "../state/types";
import { ProviderLogo } from "./ProviderLogo";
import { useT } from "../i18n";

interface Props {
  providers: AiProvider[];
  activeId: string | null;
  settingsActive: boolean;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

export function Sidebar({ providers, activeId, settingsActive, onSelect, onOpenSettings, onRefresh }: Props) {
  const t = useT();
  return (
    <nav
      style={{
        width: "var(--sidebar-w)",
        height: "100%",
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {providers.map((p) => {
          const active = !settingsActive && activeId === p.id;
          return (
          <button
            key={p.id}
            type="button"
            aria-label={p.name}
            title={p.name}
            onClick={() => onSelect(p.id)}
            style={{
              border: "none",
              background: active ? "var(--border)" : "transparent",
              cursor: "pointer",
              padding: 8,
              borderRadius: 12,
              transition: `background 0.2s var(--ease-out-expo)`,
            }}
          >
            <ProviderLogo name={p.name} logo={p.logo} size={24} />
          </button>
        );
        })}
      </div>
      <button
        type="button"
        aria-label={t("sidebar.refresh")}
        title={t("sidebar.refresh")}
        onClick={onRefresh}
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)", display: "flex", padding: 4 }}
      >
        <RotateCw size={22} />
      </button>
      <button
        type="button"
        aria-label={t("sidebar.settings")}
        title={t("sidebar.settings")}
        onClick={onOpenSettings}
        style={{ border: "none", background: "transparent", cursor: "pointer", color: settingsActive ? "var(--accent)" : "var(--fg-muted)", display: "flex", padding: 4 }}
      >
        <Settings size={22} />
      </button>
    </nav>
  );
}

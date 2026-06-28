import { RotateCw, Settings } from "lucide-react";
import type { AiProvider } from "../state/types";
import { ProviderLogo } from "./ProviderLogo";
import { useT } from "../i18n";
import styles from "./Sidebar.module.css";

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
    <nav className={styles.nav}>
      <div className={styles.list}>
        {providers.map((p) => {
          const active = !settingsActive && activeId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-label={p.name}
              title={p.name}
              onClick={() => onSelect(p.id)}
              className={styles.item}
              data-active={active || undefined}
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
        className={styles.iconBtn}
      >
        <RotateCw size={22} />
      </button>
      <button
        type="button"
        aria-label={t("sidebar.settings")}
        title={t("sidebar.settings")}
        onClick={onOpenSettings}
        className={styles.iconBtn}
        data-active={settingsActive || undefined}
      >
        <Settings size={22} />
      </button>
    </nav>
  );
}

import { useState } from "react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { ProviderLogo } from "../../components/ProviderLogo";
import { Toggle } from "../../components/Toggle";
import type { AiProvider } from "../../state/types";

export function AiConfigSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [blockedId, setBlockedId] = useState<string | null>(null);

  const patchProvider = (id: string, patch: Partial<AiProvider>) => {
    updateSettings({
      providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  // 禁止停用快捷提问正在使用的 provider（保证默认 AI 恒为 enabled）
  const setEnabled = (id: string, enabled: boolean) => {
    if (!enabled && id === settings.quickAskProviderId) {
      setBlockedId(id);
      return;
    }
    setBlockedId(null);
    patchProvider(id, { enabled });
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
      {settings.providers.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <button
              type="button"
              aria-label={`展开 ${p.name}`}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : p.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)" }}
            >
              <ProviderLogo name={p.name} logo={p.logo} size={28} />
              <span style={{ flex: 1, textAlign: "left" }}>{p.name}</span>
              <span style={{ color: "var(--fg-muted)" }}>{open ? "▲" : "▼"}</span>
            </button>
            {open && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{t("ai.name")}</span>
                  <input
                    aria-label={`${p.name} 服务商名称`}
                    value={p.name}
                    onChange={(e) => patchProvider(p.id, { name: e.target.value })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{t("ai.url")}</span>
                  <input
                    aria-label={`${p.name} 官网地址`}
                    value={p.url}
                    onChange={(e) => patchProvider(p.id, { url: e.target.value })}
                  />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{t("ai.enabled")}</span>
                  <Toggle checked={p.enabled} label={`${p.name} ${t("ai.enabled")}`} onChange={(v) => setEnabled(p.id, v)} />
                  {blockedId === p.id && (
                    <span style={{ color: "#e0a23a", fontSize: 12 }}>{t("settings.inUseByQuickAsk")}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

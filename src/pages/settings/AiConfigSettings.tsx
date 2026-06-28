import { useState } from "react";
import { Plus } from "lucide-react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { ProviderCard } from "../../components/ProviderCard";
import { SettingsLayout } from "../../components/SettingsLayout";
import { ProviderEditPanel } from "./ProviderEditPanel";
import { validateProvider, canDisableProvider } from "../../lib/providerValidation";
import { logoActionFromDraft } from "../../lib/logo";
import { addProvider, saveProvider, deleteProvider } from "../../lib/commands";
import type { AiProvider, DraftProvider, Settings, ValidationErrors } from "../../state/types";
import styles from "./AiConfigSettings.module.css";

const TEMP_PREFIX = "temp-";

export function AiConfigSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProvider | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [tempProvider, setTempProvider] = useState<DraftProvider | null>(null);
  const [saving, setSaving] = useState(false);

  const isTemp = (id: string) => id.startsWith(TEMP_PREFIX);

  const closeCard = () => {
    setOpenId(null);
    setDraft(null);
    setErrors({});
    setTempProvider(null);
  };

  const openCard = (p: AiProvider) => {
    if (tempProvider) return;
    setOpenId(p.id);
    setDraft({ ...p });
    setErrors({});
  };

  const handleAdd = () => {
    const id = `${TEMP_PREFIX}${Date.now()}`;
    const temp: DraftProvider = {
      id,
      name: t("ai.newProvider"),
      url: "",
      enabled: true,
      logo: { type: "letter", color: "#808080" },
    };
    setTempProvider(temp);
    setOpenId(id);
    setDraft(temp);
    setErrors({});
  };

  const changeDraft = (patch: Partial<DraftProvider>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    const errs = validateProvider(draft);
    setErrors(errs);
    if (errs.name || errs.url) return;
    setSaving(true);
    try {
      const action = logoActionFromDraft(draft);
      const name = draft.name.trim();
      const url = draft.url.trim();
      if (isTemp(draft.id)) {
        const { id, logo } = await addProvider({ name, url, enabled: draft.enabled, logoAction: action });
        const next: AiProvider = { id, name, url, enabled: draft.enabled, logo };
        await updateSettings({ providers: [...settings.providers, next] });
      } else {
        const resultLogo = await saveProvider({ id: draft.id, name, url, enabled: draft.enabled, logoAction: action });
        const logo = action.type === "keep" ? draft.logo : resultLogo;
        const updated: AiProvider = { id: draft.id, name, url, enabled: draft.enabled, logo };
        const nextProviders = settings.providers.map((p) => (p.id === draft.id ? updated : p));
        const patch: Partial<Settings> = { providers: nextProviders };
        if (!draft.enabled && draft.id === settings.quickAskProviderId) {
          const firstEnabled = nextProviders.find((p) => p.enabled);
          if (firstEnabled) patch.quickAskProviderId = firstEnabled.id;
        }
        await updateSettings(patch);
      }
      closeCard();
    } catch {
      setErrors((e) => ({ ...e, general: "errors.saveFailed" }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft || isTemp(draft.id)) return;
    if (draft.enabled && !canDisableProvider(settings.providers)) return;
    if (!window.confirm(t("ai.deleteConfirm").replace("{name}", draft.name))) return;
    try {
      await deleteProvider(draft.id);
      const nextProviders = settings.providers.filter((p) => p.id !== draft.id);
      const patch: Partial<Settings> = { providers: nextProviders };
      if (draft.id === settings.quickAskProviderId) {
        const firstEnabled = nextProviders.find((p) => p.enabled);
        if (firstEnabled) patch.quickAskProviderId = firstEnabled.id;
      }
      await updateSettings(patch);
      closeCard();
    } catch {
      setErrors((e) => ({ ...e, general: "errors.saveFailed" }));
    }
  };

  return (
    <SettingsLayout gap={10} padding={24}>
      {settings.providers.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} className={styles.cardWrap}>
            <ProviderCard
              name={p.name}
              logo={p.logo}
              arrow={open ? "up" : "down"}
              size="lg"
              onClick={() => {
                if (tempProvider) return;
                if (open) closeCard();
                else openCard(p);
              }}
            />
            <div className={styles.panel} data-open={open || undefined}>
              {draft && openId === p.id && (
                <ProviderEditPanel
                  draft={draft}
                  errors={errors}
                  isTemp={false}
                  canDisable={canDisableProvider(settings.providers)}
                  saving={saving}
                  onChange={changeDraft}
                  onSave={() => void save()}
                  onCancel={closeCard}
                  onDelete={() => void remove()}
                />
              )}
            </div>
          </div>
        );
      })}

      {tempProvider && draft && openId === tempProvider.id && (
        <div className={styles.cardWrap}>
          <ProviderCard name={draft.name} logo={draft.logo} arrow="up" size="lg" />
          <div className={styles.panel} data-open>
            <ProviderEditPanel
              draft={draft}
              errors={errors}
              isTemp
              canDisable
              saving={saving}
              onChange={changeDraft}
              onSave={() => void save()}
              onCancel={closeCard}
              onDelete={() => {}}
            />
          </div>
        </div>
      )}

      {!tempProvider && (
        <button type="button" aria-label={t("ai.add")} onClick={handleAdd} className={styles.addBtn}>
          <Plus size={22} />
          {t("ai.add")}
        </button>
      )}
    </SettingsLayout>
  );
}

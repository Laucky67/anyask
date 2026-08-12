import { useEffect, useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
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

interface SortableProviderCardProps {
  provider: AiProvider;
  open: boolean;
  disabled: boolean;
  onClick: () => void;
  dragLabel: string;
  children: ReactNode;
}

function SortableProviderCard({ provider, open, disabled, onClick, dragLabel, children }: SortableProviderCardProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={styles.cardWrap}
      data-provider-id={provider.id}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <ProviderCard
        name={provider.name}
        logo={provider.logo}
        arrow={open ? "up" : "down"}
        size="lg"
        onClick={onClick}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            className={styles.dragHandle}
            aria-label={dragLabel}
            title={dragLabel}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={20} />
          </button>
        }
      />
      {children}
    </div>
  );
}

export function AiConfigSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProvider | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [tempProvider, setTempProvider] = useState<DraftProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderedProviders, setOrderedProviders] = useState<AiProvider[]>(settings.providers);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderSaveFailed, setOrderSaveFailed] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isTemp = (id: string) => id.startsWith(TEMP_PREFIX);

  // 未编辑排序时始终跟随 settings，确保另一个窗口保存的顺序会即时反映。
  // 本地有未保存排序时保持当前预览，直到用户明确保存或取消。
  useEffect(() => {
    if (!orderDirty) setOrderedProviders(settings.providers);
  }, [settings.providers, orderDirty]);

  const closeCard = () => {
    setOpenId(null);
    setDraft(null);
    setErrors({});
    setTempProvider(null);
  };

  const openCard = (p: AiProvider) => {
    if (tempProvider || orderDirty) return;
    setOpenId(p.id);
    setDraft({ ...p });
    setErrors({});
  };

  const handleAdd = () => {
    if (orderDirty) return;
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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrderedProviders((providers) => {
      const oldIndex = providers.findIndex((p) => p.id === active.id);
      const newIndex = providers.findIndex((p) => p.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return providers;
      setOrderDirty(true);
      setOrderSaveFailed(false);
      return arrayMove(providers, oldIndex, newIndex);
    });
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    setOrderSaveFailed(false);
    try {
      await updateSettings({ providers: orderedProviders });
      setOrderDirty(false);
    } catch {
      setOrderSaveFailed(true);
    } finally {
      setSavingOrder(false);
    }
  };

  const cancelOrder = () => {
    setOrderedProviders(settings.providers);
    setOrderDirty(false);
    setOrderSaveFailed(false);
  };

  const sortDisabled = Boolean(openId || tempProvider || saving || savingOrder);

  return (
    <SettingsLayout gap={10} padding={24}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedProviders.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {orderedProviders.map((p) => {
            const open = openId === p.id;
            return (
              <SortableProviderCard
                key={p.id}
                provider={p}
                open={open}
                disabled={sortDisabled}
                dragLabel={t("ai.dragHandle").replace("{name}", p.name)}
                onClick={() => {
                  if (tempProvider || orderDirty) return;
                  if (open) closeCard();
                  else openCard(p);
                }}
              >
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
              </SortableProviderCard>
            );
          })}
        </SortableContext>
      </DndContext>

      {orderDirty && (
        <div className={styles.orderActions}>
          {orderSaveFailed && <p className={styles.orderError}>{t("errors.saveFailed")}</p>}
          <button type="button" onClick={cancelOrder} className={styles.cancelOrderBtn} disabled={savingOrder}>
            {t("ai.cancelOrder")}
          </button>
          <button type="button" onClick={() => void saveOrder()} className={styles.saveOrderBtn} disabled={savingOrder}>
            {t("ai.saveOrder")}
          </button>
        </div>
      )}

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
        <button type="button" aria-label={t("ai.add")} onClick={handleAdd} className={styles.addBtn} disabled={orderDirty}>
          <Plus size={22} />
          {t("ai.add")}
        </button>
      )}
    </SettingsLayout>
  );
}

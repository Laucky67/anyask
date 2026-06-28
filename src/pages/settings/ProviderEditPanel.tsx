import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { validateLogoFile, fileToThumbnailDataUrl } from "../../lib/logo";
import type { DraftProvider, ValidationErrors } from "../../state/types";
import styles from "./ProviderEditPanel.module.css";

interface Props {
  draft: DraftProvider;
  errors: ValidationErrors;
  isTemp: boolean;
  canDisable: boolean;
  saving: boolean;
  onChange: (patch: Partial<DraftProvider>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function ProviderEditPanel({
  draft, errors, isTemp, canDisable, saving, onChange, onSave, onCancel, onDelete,
}: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | undefined>();
  const isOnlyEnabled = draft.enabled && !canDisable;
  const hasImage = draft.logo.type === "image";

  const pickLogo = async (file?: File) => {
    if (!file) return;
    const err = validateLogoFile(file);
    if (err) {
      setLogoError(err);
      return;
    }
    setLogoError(undefined);
    try {
      const dataUrl = await fileToThumbnailDataUrl(file);
      onChange({ logo: { type: "image", src: dataUrl }, pendingLogoDataUrl: dataUrl });
    } catch {
      setLogoError("errors.logoInvalidFormat");
    }
  };

  return (
    <div className={styles.panel}>
      {/* Logo 区：居中。未上传=圆形虚线框 + Plus；已上传=缩略图 + 右下铅笔徽标 */}
      <div className={styles.logoRow}>
        <button type="button" aria-label={t("ai.uploadLogo")} onClick={() => fileRef.current?.click()} className={styles.logoBtn}>
          {hasImage && draft.logo.type === "image" ? (
            <>
              <img src={draft.logo.src} alt="" width={40} height={40} className={styles.logoImg} />
              <span className={styles.badge}>
                <Pencil size={9} color="var(--fg-muted)" />
              </span>
            </>
          ) : (
            <span className={styles.placeholder}>
              <Plus size={18} />
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => void pickLogo(e.target.files?.[0])}
        />
      </div>
      {logoError && <p className={styles.errorCenter}>{t(logoError)}</p>}

      {/* 名称 */}
      <div className={styles.field}>
        <span className={styles.label}>{t("ai.name")}</span>
        <input aria-label={t("ai.name")} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} className={styles.input} />
      </div>
      {errors.name && <p className={styles.errorField}>{t(errors.name)}</p>}

      {/* URL */}
      <div className={styles.field}>
        <span className={styles.label}>{t("ai.url")}</span>
        <input aria-label={t("ai.url")} value={draft.url} onChange={(e) => onChange({ url: e.target.value })} className={styles.input} />
      </div>
      {errors.url && <p className={styles.errorField}>{t(errors.url)}</p>}

      {/* 启用 */}
      <div className={styles.field}>
        <span className={styles.label}>{t("ai.enabled")}</span>
        <Toggle checked={draft.enabled} label={t("ai.enabled")} disabled={isOnlyEnabled} onChange={(v) => onChange({ enabled: v })} />
        {isOnlyEnabled && <span className={styles.warnInline}>{t("settings.atLeastOneEnabled")}</span>}
      </div>

      {errors.general && <p className={styles.errorGeneral}>{t(errors.general)}</p>}

      {/* 底部操作：删除居左（临时项隐藏），保存 + 取消居右 */}
      <div className={styles.footer}>
        {!isTemp && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isOnlyEnabled}
            title={isOnlyEnabled ? t("settings.atLeastOneEnabled") : undefined}
            className={styles.btnDanger}
          >
            <Trash2 size={16} />
            {t("ai.delete")}
          </button>
        )}
        <div className={styles.spacer} />
        <button type="button" onClick={onSave} disabled={saving} className={styles.btnPrimary}>
          {t("ai.save")}
        </button>
        <button type="button" onClick={onCancel} className={styles.btnSecondary}>
          {t("ai.cancel")}
        </button>
      </div>
    </div>
  );
}

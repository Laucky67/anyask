import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { validateLogoFile, fileToThumbnailDataUrl } from "../../lib/logo";
import type { DraftProvider, ValidationErrors } from "../../state/types";

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

const labelCol = { width: 80, fontSize: 14, color: "var(--fg-muted)", flexShrink: 0 } as const;
const inputStyle = {
  flex: 1,
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--fg)",
  fontSize: 15,
} as const;

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
    <div style={{ padding: "16px 16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Logo 区：居中。未上传=圆形虚线框 + Plus；已上传=缩略图 + 右下铅笔徽标 */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 8 }}>
        <button
          type="button"
          aria-label={t("ai.uploadLogo")}
          onClick={() => fileRef.current?.click()}
          style={{ position: "relative", width: 40, height: 40, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
        >
          {hasImage && draft.logo.type === "image" ? (
            <>
              <img src={draft.logo.src} alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: "cover" }} />
              <span style={{ position: "absolute", right: -3, bottom: -3, width: 16, height: 16, borderRadius: "50%", background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={9} color="var(--fg-muted)" />
              </span>
            </>
          ) : (
            <span style={{ width: 40, height: 40, borderRadius: "50%", border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-muted)" }}>
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
      {logoError && <p style={{ color: "#e0533a", fontSize: 13, textAlign: "center", margin: 0 }}>{t(logoError)}</p>}

      {/* 名称 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={labelCol}>{t("ai.name")}</span>
        <input aria-label={t("ai.name")} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} style={inputStyle} />
      </div>
      {errors.name && <p style={{ color: "#e0533a", fontSize: 13, margin: "0 0 0 92px" }}>{t(errors.name)}</p>}

      {/* URL */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={labelCol}>{t("ai.url")}</span>
        <input aria-label={t("ai.url")} value={draft.url} onChange={(e) => onChange({ url: e.target.value })} style={inputStyle} />
      </div>
      {errors.url && <p style={{ color: "#e0533a", fontSize: 13, margin: "0 0 0 92px" }}>{t(errors.url)}</p>}

      {/* 启用 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={labelCol}>{t("ai.enabled")}</span>
        <Toggle checked={draft.enabled} label={t("ai.enabled")} disabled={isOnlyEnabled} onChange={(v) => onChange({ enabled: v })} />
        {isOnlyEnabled && <span style={{ color: "#e0a23a", fontSize: 13 }}>{t("settings.atLeastOneEnabled")}</span>}
      </div>

      {errors.general && <p style={{ color: "#e0533a", fontSize: 13, margin: 0 }}>{t(errors.general)}</p>}

      {/* 底部操作：删除居左（临时项隐藏），保存 + 取消居右 */}
      <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        {!isTemp && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isOnlyEnabled}
            title={isOnlyEnabled ? t("settings.atLeastOneEnabled") : undefined}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px solid #e0533a", background: "transparent", color: "#e0533a", fontSize: 14, cursor: isOnlyEnabled ? "not-allowed" : "pointer", opacity: isOnlyEnabled ? 0.5 : 1 }}
          >
            <Trash2 size={16} />
            {t("ai.delete")}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, cursor: saving ? "default" : "pointer", marginRight: 8, opacity: saving ? 0.6 : 1 }}
        >
          {t("ai.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "8px 22px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: 14, cursor: "pointer" }}
        >
          {t("ai.cancel")}
        </button>
      </div>
    </div>
  );
}

import type { DraftProvider, LogoAction } from "../state/types";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function validateLogoFile(file: File): string | undefined {
  if (!ALLOWED_TYPES.includes(file.type)) return "errors.logoInvalidFormat";
  if (file.size > MAX_LOGO_BYTES) return "errors.logoTooLarge";
  return undefined;
}

/** 用 Canvas 等比缩放居中绘制到 size×size，导出 base64 PNG（jsdom 无 canvas，故仅在真实环境运行） */
export function fileToThumbnailDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no 2d context"));
        return;
      }
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

/** 根据草稿决定保存时发给后端的 Logo 操作 */
export function logoActionFromDraft(draft: DraftProvider): LogoAction {
  if (draft.pendingLogoDataUrl) return { type: "upload", dataUrl: draft.pendingLogoDataUrl };
  if (draft.logo.type === "image") return { type: "keep" };
  return { type: "generate", name: draft.name.trim() };
}

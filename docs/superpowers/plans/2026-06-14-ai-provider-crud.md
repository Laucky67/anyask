# AI Provider 增删改查 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 anyask 实现完整的 AI Provider 增删改查：设置页支持新增/编辑/删除服务商，配置名称、官网、Logo 与启用状态，保存后才持久化，并与快捷提问窗、主窗口 AI webview 同步。

**Architecture:** 沿用现有「前端拥有 settings、后端只读」的架构（ADR-1）。Rust 命令只负责 Provider 的校验、Logo 文件落盘与返回结果，不写 settings.json；前端通过 `updateSettings()` 写入并触发跨窗口同步。Logo 缩略图由前端 Canvas 生成 128×128 base64，后端仅解码校验后落盘到 `app_data_dir/provider-logos/{id}.png`，前端用 `convertFileSrc()` 转成可加载 URL（跨平台正确，含 Windows）。校验与颜色哈希等纯逻辑抽到独立模块做单元测试；Tauri 窗口/文件相关逻辑靠手动验证兜底。

**Tech Stack:** Tauri 2、Rust 2021、React 19、TypeScript、Vite、Vitest、pnpm、cargo test、lucide-react。

---

## 与 spec 的偏差记录（实现前务必知晓）

1. **Logo URL 用 `convertFileSrc()`**（方案 A），而非 spec 里硬编码的 `asset://localhost/...`。后者在 Windows 上实际前缀是 `http://asset.localhost`，会加载失败。后端命令返回**文件绝对路径**（`LogoResult::Image { path }`），前端在 `commands.ts` 里调用 `convertFileSrc(path)` 得到 `src` 后写入 settings 的 `{ type:"image", src }`。
2. **缩略图前端生成**：前端 Canvas 输出 128×128 base64 PNG，后端只 base64 解码 + 校验 PNG 魔数 + 落盘，**不引入 `image` crate**。
3. **「至少保留一个启用」前后端都校验**：前端 UI 强制（禁用最后一个启用项的 Toggle / 删除按钮 + tooltip，`remove()` 再兜底 guard）；后端 `validate_and_save_provider` 与 `delete_provider` 都防御性校验——给 `ProviderLite` 加 `enabled` 字段后，从 settings.json 判断停用/删除后是否仍有其它启用项（`other_enabled_exists`）。settings.json 是本次编辑**前**的状态，但每次只改一个 provider，其它项 enabled 准确，故判断有效。注意：因后端删除校验依赖删除**前**的 settings.json，删除流程必须「先调后端 `delete_provider`（校验 + 删文件）→ 再 `updateSettings`」，不可反序。
4. **折叠态复用 `ProviderCard`**：给 `ProviderCard` 增加可选 `arrow?: "up" | "down"` prop（默认不传 = 无箭头，QuickAskBar 复用不受影响），箭头 UI 收进组件、展开状态的业务判断留在 AiConfigSettings。
5. **UI 布局以设计稿为准**：箭头用 lucide `ChevronUp`/`ChevronDown`（非 `▲/▼` 文本）；表单横排（标签左、输入右）；Logo 区居中，未上传为圆形虚线框 + `+`，已上传为缩略图 + 右下铅笔徽标；底部「删除」红色描边居左，「保存」蓝色实心 + 「取消」描边居右；新增按钮为整宽虚线圆角 + 居中 `+`。
6. **快捷提问覆盖同一 provider 的 URL 变更**（spec 7.2）：`QuickAskBar` 的自动切换 effect 不仅在默认 provider 被停用/删除（id 变化）时切换，也在当前 provider 的 **url** 变化时重新导航；用 ref 跟踪上次 url，跳过首次挂载（初始 url 由 Rust 创建 webview 时设置，避免冗余 reload）。

---

## File Structure

**前端纯逻辑/类型：**
- 修改 `src/state/types.ts`：新增 `LogoAction`、`LogoResult`、`DraftProvider`、`ValidationErrors`。
- 新建 `src/lib/providerValidation.ts` + 测试：`validateName` / `validateUrl` / `validateProvider` / `canDisableProvider`。
- 新建 `src/lib/logo.ts` + 测试：`validateLogoFile` / `fileToThumbnailDataUrl` / `logoActionFromDraft`。
- 修改 `src/i18n/zh-CN.ts`：新增错误文案、`settings.atLeastOneEnabled`、`ai.*`、`sidebar.refresh`。

**前端组件：**
- 修改 `src/components/Toggle.tsx` + 测试：支持 `disabled`。
- 修改 `src/components/ProviderCard.tsx` + 测试：可选 `arrow` prop。
- 新建 `src/pages/settings/ProviderEditPanel.tsx` + 测试。
- 重写 `src/pages/settings/AiConfigSettings.tsx` + 测试。
- 修改 `src/pages/settings/BasicSettings.tsx` + 测试。
- 修改 `src/pages/quick-ask/QuickAskBar.tsx` + 测试。
- 修改 `src/components/Sidebar.tsx` + 测试，`src/App.tsx`、`src/App.test.tsx`。
- 修改 `src/lib/commands.ts`：新增 `addProvider` / `saveProvider` / `deleteProvider` / `refreshActiveAiWebview`。

**后端：**
- 新建 `src-tauri/src/provider_utils.rs` + 测试：纯校验、颜色哈希、PNG 解码、`LogoAction`/`LogoResult`。
- 修改 `src-tauri/src/settings_io.rs` + 测试：`ProviderLite` 增加 `enabled`、`other_enabled_exists` 助手。
- 修改 `src-tauri/src/commands.rs`：`add_provider` / `validate_and_save_provider` / `delete_provider` + Logo 落盘助手。
- 修改 `src-tauri/src/webviews.rs`：`refresh_active_ai_webview` + URL 变更重建。
- 修改 `src-tauri/src/state.rs`：`ai_webview_urls` 映射。
- 修改 `src-tauri/src/lib.rs`：注册命令、声明模块。
- 修改 `src-tauri/Cargo.toml`：新增 `uuid`、`base64`。
- 修改 `src-tauri/tauri.conf.json`：开启 `assetProtocol`。

---

### Task 1: 前端类型与纯校验逻辑

**Files:**
- Modify: `src/state/types.ts`
- Create: `src/lib/providerValidation.ts`
- Create: `src/lib/logo.ts`
- Test: `src/lib/providerValidation.test.ts`
- Test: `src/lib/logo.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `src/lib/providerValidation.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { validateName, validateUrl, validateProvider, canDisableProvider } from "./providerValidation";
import type { AiProvider } from "../state/types";

describe("validateName", () => {
  it("rejects empty / whitespace", () => {
    expect(validateName("")).toBe("errors.nameRequired");
    expect(validateName("   ")).toBe("errors.nameRequired");
  });
  it("rejects > 20 chars counting code points", () => {
    expect(validateName("a".repeat(21))).toBe("errors.nameTooLong");
    expect(validateName("😀".repeat(21))).toBe("errors.nameTooLong");
  });
  it("accepts trimmed valid name", () => {
    expect(validateName("  ChatGPT  ")).toBeUndefined();
    expect(validateName("😀".repeat(20))).toBeUndefined();
  });
});

describe("validateUrl", () => {
  it("rejects empty", () => {
    expect(validateUrl("")).toBe("errors.urlRequired");
  });
  it("rejects malformed or non-http(s)", () => {
    expect(validateUrl("notaurl")).toBe("errors.urlInvalid");
    expect(validateUrl("ftp://x.com")).toBe("errors.urlInvalid");
  });
  it("accepts http/https", () => {
    expect(validateUrl("https://chatgpt.com")).toBeUndefined();
    expect(validateUrl("http://localhost:3000")).toBeUndefined();
  });
});

describe("validateProvider", () => {
  it("collects field errors", () => {
    expect(validateProvider({ name: "", url: "" })).toEqual({
      name: "errors.nameRequired",
      url: "errors.urlRequired",
    });
  });
  it("returns empty object when valid", () => {
    expect(validateProvider({ name: "X", url: "https://x.com" })).toEqual({});
  });
});

describe("canDisableProvider", () => {
  const p = (id: string, enabled: boolean): AiProvider => ({
    id, name: id, url: "https://x.com", enabled, logo: { type: "letter", color: "#000" },
  });
  it("false when only one enabled", () => {
    expect(canDisableProvider([p("a", true), p("b", false)])).toBe(false);
  });
  it("true when two or more enabled", () => {
    expect(canDisableProvider([p("a", true), p("b", true)])).toBe(true);
  });
});
```

新建 `src/lib/logo.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { validateLogoFile, logoActionFromDraft } from "./logo";
import type { DraftProvider } from "../state/types";

function fileOf(type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], "logo", { type });
}

describe("validateLogoFile", () => {
  it("rejects unsupported type", () => {
    expect(validateLogoFile(fileOf("image/svg+xml", 10))).toBe("errors.logoInvalidFormat");
  });
  it("rejects > 5MB", () => {
    expect(validateLogoFile(fileOf("image/png", 5 * 1024 * 1024 + 1))).toBe("errors.logoTooLarge");
  });
  it("accepts a small png", () => {
    expect(validateLogoFile(fileOf("image/png", 10))).toBeUndefined();
  });
});

describe("logoActionFromDraft", () => {
  const base: DraftProvider = {
    id: "x", name: "  X  ", url: "https://x.com", enabled: true,
    logo: { type: "letter", color: "#000" },
  };
  it("upload when a new thumbnail is pending", () => {
    expect(logoActionFromDraft({ ...base, pendingLogoDataUrl: "data:image/png;base64,AA" }))
      .toEqual({ type: "upload", dataUrl: "data:image/png;base64,AA" });
  });
  it("keep when logo is an unchanged image", () => {
    expect(logoActionFromDraft({ ...base, logo: { type: "image", src: "x" } }))
      .toEqual({ type: "keep" });
  });
  it("generate from trimmed name when logo is letter", () => {
    expect(logoActionFromDraft(base)).toEqual({ type: "generate", name: "X" });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- src/lib/providerValidation.test.ts src/lib/logo.test.ts
```

预期：FAIL（模块/导出不存在）。

- [ ] **Step 3: 新增类型**

在 `src/state/types.ts` 末尾追加：

```ts
export type LogoAction =
  | { type: "keep" }
  | { type: "upload"; dataUrl: string }
  | { type: "generate"; name: string };

export type LogoResult =
  | { type: "letter"; color: string }
  | { type: "image"; path: string };

export interface DraftProvider extends AiProvider {
  /** 已选并生成的 128×128 base64；存在则保存时 logoAction = upload */
  pendingLogoDataUrl?: string;
}

export interface ValidationErrors {
  name?: string;
  url?: string;
  logo?: string;
  general?: string;
}
```

- [ ] **Step 4: 实现 providerValidation.ts**

新建 `src/lib/providerValidation.ts`：

```ts
import type { AiProvider, ValidationErrors } from "../state/types";

const MAX_NAME_LEN = 20;

export function validateName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return "errors.nameRequired";
  if (Array.from(trimmed).length > MAX_NAME_LEN) return "errors.nameTooLong";
  return undefined;
}

export function validateUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return "errors.urlRequired";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "errors.urlInvalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "errors.urlInvalid";
  return undefined;
}

export function validateProvider(draft: { name: string; url: string }): ValidationErrors {
  const errors: ValidationErrors = {};
  const name = validateName(draft.name);
  const url = validateUrl(draft.url);
  if (name) errors.name = name;
  if (url) errors.url = url;
  return errors;
}

/** 是否允许停用某个 provider：启用数 > 1 时才可停用（至少保留一个启用） */
export function canDisableProvider(providers: AiProvider[]): boolean {
  return providers.filter((p) => p.enabled).length > 1;
}
```

- [ ] **Step 5: 实现 logo.ts**

新建 `src/lib/logo.ts`：

```ts
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
```

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm test -- src/lib/providerValidation.test.ts src/lib/logo.test.ts
```

预期：PASS。

- [ ] **Step 7: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/state/types.ts src/lib/providerValidation.ts src/lib/providerValidation.test.ts src/lib/logo.ts src/lib/logo.test.ts
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: 新增 provider 校验与 logo 纯逻辑"
```

---

### Task 2: 国际化文案

**Files:**
- Modify: `src/i18n/zh-CN.ts`

- [ ] **Step 1: 新增文案键**

在 `src/i18n/zh-CN.ts` 的对象内追加以下键（放在 `ai.*` 与 `settings.*` 附近）：

```ts
  "sidebar.refresh": "刷新",
  "ai.add": "添加AI服务商",
  "ai.newProvider": "新建服务商",
  "ai.save": "保存",
  "ai.cancel": "取消",
  "ai.delete": "删除",
  "ai.uploadLogo": "上传图标",
  "ai.deleteConfirm": "确定要删除「{name}」吗？此操作不可恢复。",
  "settings.atLeastOneEnabled": "至少需要保留一个启用的AI",
  "errors.nameRequired": "名称不能为空",
  "errors.nameTooLong": "名称不能超过20个字符",
  "errors.urlRequired": "URL不能为空",
  "errors.urlInvalid": "URL格式不正确",
  "errors.logoTooLarge": "文件大小超过5MB",
  "errors.logoInvalidFormat": "不支持的图片格式",
  "errors.saveFailed": "保存失败，请重试",
```

保留现有 `settings.inUseByQuickAsk` 键（不再使用但留着无害）。

- [ ] **Step 2: 验证类型编译**

```bash
pnpm test -- src/i18n/index.test.tsx
```

预期：PASS（i18n 现有测试不受影响）。

- [ ] **Step 3: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/i18n/zh-CN.ts
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: 新增 provider 增删改文案"
```

---

### Task 3: Rust 纯工具函数与 Logo 类型

**Files:**
- Create: `src-tauri/src/provider_utils.rs`
- Modify: `src-tauri/src/lib.rs`（声明模块）

- [ ] **Step 1: 声明模块**

在 `src-tauri/src/lib.rs` 顶部的 `mod` 列表中加入（按字母序放在 `mod commands;` 后）：

```rust
mod commands;
mod provider_utils;
mod quick_ask;
```

- [ ] **Step 2: 写带失败测试的工具模块**

新建 `src-tauri/src/provider_utils.rs`：

```rust
use serde::{Deserialize, Serialize};
use tauri::Url;

/// 前端发来的 Logo 操作意图
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogoAction {
    Keep,
    Upload {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    Generate {
        name: String,
    },
}

/// 命令返回给前端的 Logo 结果（image.path 为文件绝对路径，前端用 convertFileSrc 转 URL）
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogoResult {
    Letter { color: String },
    Image { path: String },
}

const PALETTE: [&str; 8] = [
    "#10A37F", "#D97757", "#4285F4", "#E94235", "#34A853", "#FBBC04", "#9333EA", "#EC4899",
];

/// 由名称稳定哈希出一个固定调色板颜色
pub fn hash_color_from_name(name: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    let index = (hasher.finish() as usize) % PALETTE.len();
    PALETTE[index].to_string()
}

const MAX_NAME_CHARS: usize = 20;

/// 校验名称：非空、去首尾空格、码点数 ≤ 20；成功返回 trim 后的名称
pub fn validate_provider_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("nameRequired".into());
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err("nameTooLong".into());
    }
    Ok(trimmed.to_string())
}

/// 校验 URL：非空、可解析、scheme 为 http/https；成功返回 trim 后的 URL
pub fn validate_provider_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("urlRequired".into());
    }
    let parsed = Url::parse(trimmed).map_err(|_| "urlInvalid".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("urlInvalid".into());
    }
    Ok(trimmed.to_string())
}

const PNG_MAGIC: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/// 从 data URL（data:image/png;base64,XXXX）解码出字节，校验声明类型与 PNG 魔数
pub fn decode_png_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let comma = data_url.find(',').ok_or("logoInvalidFormat")?;
    let (header, rest) = data_url.split_at(comma);
    if !header.contains("image/png") {
        return Err("logoInvalidFormat".into());
    }
    let bytes = STANDARD
        .decode(&rest[1..])
        .map_err(|_| "logoInvalidFormat".to_string())?;
    if bytes.len() < 8 || bytes[..8] != PNG_MAGIC {
        return Err("logoInvalidFormat".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_color_is_stable_and_in_palette() {
        let c = hash_color_from_name("ChatGPT");
        assert_eq!(c, hash_color_from_name("ChatGPT"));
        assert!(PALETTE.contains(&c.as_str()));
    }

    #[test]
    fn name_validation() {
        assert_eq!(validate_provider_name(""), Err("nameRequired".into()));
        assert_eq!(validate_provider_name("   "), Err("nameRequired".into()));
        assert_eq!(validate_provider_name(&"a".repeat(21)), Err("nameTooLong".into()));
        assert_eq!(validate_provider_name("  ChatGPT  "), Ok("ChatGPT".to_string()));
        assert_eq!(validate_provider_name(&"😀".repeat(20)), Ok("😀".repeat(20)));
    }

    #[test]
    fn url_validation() {
        assert_eq!(validate_provider_url(""), Err("urlRequired".into()));
        assert_eq!(validate_provider_url("notaurl"), Err("urlInvalid".into()));
        assert_eq!(validate_provider_url("ftp://x.com"), Err("urlInvalid".into()));
        assert_eq!(
            validate_provider_url("  https://chatgpt.com  "),
            Ok("https://chatgpt.com".to_string())
        );
    }

    #[test]
    fn png_data_url_decode() {
        // "iVBORw0KGgo=" 解码即 PNG 8 字节魔数
        assert!(decode_png_data_url("data:image/png;base64,iVBORw0KGgo=").is_ok());
        // 声明非 png
        assert_eq!(
            decode_png_data_url("data:image/jpeg;base64,iVBORw0KGgo="),
            Err("logoInvalidFormat".into())
        );
        // 魔数不符
        assert_eq!(
            decode_png_data_url("data:image/png;base64,AAAA"),
            Err("logoInvalidFormat".into())
        );
        // 无逗号
        assert_eq!(
            decode_png_data_url("notadataurl"),
            Err("logoInvalidFormat".into())
        );
    }
}
```

- [ ] **Step 3: 加 base64 依赖（测试需要）**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 末尾加入：

```toml
base64 = "0.22"
uuid = { version = "1", features = ["v4"] }
```

（`uuid` 在 Task 4 用，提前加入避免二次改 Cargo.toml。）

- [ ] **Step 4: 运行测试确认通过**

从 `src-tauri` 运行：

```bash
cargo test --lib provider_utils
```

预期：PASS（4 个测试）。首次会编译 base64/uuid，耗时较长属正常。

- [ ] **Step 5: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src-tauri/src/provider_utils.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: provider 校验与 logo 解码工具"
```

---

### Task 4: Rust 增删改命令 + Logo 落盘 + asset 协议

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 开启 asset 协议**

在 `src-tauri/tauri.conf.json` 的 `app.security` 中加入 `assetProtocol`（`csp` 保持 `null`）：

```json
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": ["$APPDATA/provider-logos/*"]
      }
    }
```

- [ ] **Step 2: settings_io 增加 enabled 与校验助手**

在 `src-tauri/src/settings_io.rs` 的 `ProviderLite` 增加 `enabled` 字段（serde 默认 true，兼容旧数据与仅有 id/url 的调用方）：

```rust
fn default_true() -> bool { true }

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderLite {
    pub id: String,
    pub url: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}
```

在文件中（`quick_ask_url` 之后）追加纯助手函数：

```rust
/// 在 providers 中是否存在「除 excluding_id 外仍启用」的项
pub fn other_enabled_exists(providers: &[ProviderLite], excluding_id: &str) -> bool {
    providers.iter().any(|p| p.id != excluding_id && p.enabled)
}
```

在 `settings_io.rs` 底部已有的 `#[cfg(test)] mod tests` 内追加：

```rust
    fn lite(id: &str, enabled: bool) -> ProviderLite {
        ProviderLite { id: id.into(), url: "https://x.com".into(), enabled }
    }

    #[test]
    fn other_enabled_exists_detects_remaining_enabled() {
        let providers = vec![lite("a", true), lite("b", false), lite("c", true)];
        assert!(other_enabled_exists(&providers, "a")); // c 仍启用
        assert!(other_enabled_exists(&providers, "c")); // a 仍启用
        let only_one = vec![lite("a", true), lite("b", false)];
        assert!(!other_enabled_exists(&only_one, "a")); // 停用 a 后无其它启用
    }

    #[test]
    fn provider_lite_enabled_defaults_true() {
        let p = serde_json::from_value::<ProviderLite>(json!({ "id": "x", "url": "https://x.com" })).unwrap();
        assert!(p.enabled);
    }
```

运行 `cargo test --lib settings_io` 应通过（同时验证 `enabled` 默认值与助手逻辑）。

- [ ] **Step 3: 实现命令**

在 `src-tauri/src/commands.rs` 顶部 `use` 区追加：

```rust
use std::path::PathBuf;
use tauri::Manager;

use crate::provider_utils::{
    decode_png_data_url, hash_color_from_name, validate_provider_name, validate_provider_url,
    LogoAction, LogoResult,
};
```

在文件末尾追加助手与命令：

```rust
/// 确保 logo 目录存在并返回它
fn logo_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("provider-logos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn logo_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(logo_dir(app)?.join(format!("{id}.png")))
}

/// 处理 Logo 操作：keep 返回现有文件路径，upload 解码落盘，generate 删旧文件并返回字母色。
/// allow_keep=false 用于新增场景（不应出现 keep）。
fn apply_logo_action(
    app: &AppHandle,
    id: &str,
    action: LogoAction,
    allow_keep: bool,
) -> Result<LogoResult, String> {
    match action {
        LogoAction::Keep => {
            if !allow_keep {
                return Err("logoInvalidFormat".into());
            }
            let path = logo_path(app, id)?;
            Ok(LogoResult::Image {
                path: path.to_string_lossy().into_owned(),
            })
        }
        LogoAction::Upload { data_url } => {
            let bytes = decode_png_data_url(&data_url)?;
            let path = logo_path(app, id)?;
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            Ok(LogoResult::Image {
                path: path.to_string_lossy().into_owned(),
            })
        }
        LogoAction::Generate { name } => {
            // 切回字母 Logo 时清掉可能存在的旧图片文件
            let _ = std::fs::remove_file(logo_path(app, id)?);
            Ok(LogoResult::Letter {
                color: hash_color_from_name(&name),
            })
        }
    }
}

#[tauri::command]
pub fn add_provider(
    app: AppHandle,
    name: String,
    url: String,
    enabled: bool,
    logo_action: LogoAction,
) -> Result<(String, LogoResult), String> {
    validate_provider_name(&name)?;
    validate_provider_url(&url)?;
    let _ = enabled; // 启用状态由前端写入 settings，这里仅作为参数占位
    let id: String = uuid::Uuid::new_v4().simple().to_string().chars().take(8).collect();
    let logo = apply_logo_action(&app, &id, logo_action, false)?;
    Ok((id, logo))
}

#[tauri::command]
pub fn validate_and_save_provider(
    app: AppHandle,
    id: String,
    name: String,
    url: String,
    enabled: bool,
    logo_action: LogoAction,
) -> Result<LogoResult, String> {
    validate_provider_name(&name)?;
    validate_provider_url(&url)?;
    // 防御性：停用时确保仍有其它启用项（前端 UI 已先拦截，此处兜底）
    if !enabled {
        let settings = crate::settings_io::read_settings(&app);
        if !crate::settings_io::other_enabled_exists(&settings.providers, &id) {
            return Err("atLeastOneEnabled".into());
        }
    }
    apply_logo_action(&app, &id, logo_action, true)
}

#[tauri::command]
pub fn delete_provider(app: AppHandle, id: String) -> Result<(), String> {
    // 防御性：删除前从 settings.json 校验删除后仍有其它启用项（前端 UI 已先禁用按钮，此处兜底）。
    // 依赖删除「前」的 settings——前端必须先调本命令、再 updateSettings，不可反序。
    let settings = crate::settings_io::read_settings(&app);
    if !crate::settings_io::other_enabled_exists(&settings.providers, &id) {
        return Err("atLeastOneEnabled".into());
    }
    // 文件可能不存在（字母 Logo），忽略 NotFound
    let _ = std::fs::remove_file(logo_path(&app, &id)?);
    Ok(())
}
```

注意：`src-tauri/src/commands.rs` 顶部已有 `use tauri::AppHandle;`，无需重复。

- [ ] **Step 4: 注册命令**

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 宏里，于 `commands::quick_ask_new_chat,` 之后加入：

```rust
            commands::add_provider,
            commands::validate_and_save_provider,
            commands::delete_provider,
```

- [ ] **Step 5: 类型检查**

从 `src-tauri` 运行：

```bash
cargo check
```

预期：编译通过。

- [ ] **Step 6: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src-tauri/src/commands.rs src-tauri/src/settings_io.rs src-tauri/src/lib.rs src-tauri/tauri.conf.json
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: provider 增删改 tauri 命令与 asset 协议"
```

---

### Task 5: 刷新命令 + AI webview URL 变更重建

**Files:**
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/webviews.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: AppState 增加 url 映射**

在 `src-tauri/src/state.rs` 顶部 `use` 改为：

```rust
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64},
    Mutex,
};
```

在 `AppState` 结构体末尾（`webview_sync` 之后）加入字段：

```rust
    /// 记录每个 AI webview 创建时所用的 url，用于检测 url 变更后重建 webview
    pub ai_webview_urls: Mutex<HashMap<String, String>>,
}
```

`#[derive(Default)]` 对 `HashMap`/`Mutex` 仍成立，无需手写 Default。

- [ ] **Step 2: sync 中处理 url 变更 + 新增刷新命令**

在 `src-tauri/src/webviews.rs` 的 `sync_ai_webviews` 内，紧接 `let _guard = state.webview_sync.lock().await;` 之后、`let enabled_labels` 之前，插入 url 变更检测块：

```rust
    // url 变更：关闭旧 webview，后续 ensure 会按新 url 重建（短临界区，期间不 await）
    {
        let mut urls = state.ai_webview_urls.lock().unwrap();
        for p in &providers {
            if urls.get(&p.id).map(|u| u != &p.url).unwrap_or(false) {
                if let Some(wv) = app.get_webview(&label(&p.id)) {
                    let _ = wv.close();
                }
            }
            urls.insert(p.id.clone(), p.url.clone());
        }
        let ids: std::collections::HashSet<&String> = providers.iter().map(|p| &p.id).collect();
        urls.retain(|id, _| ids.contains(id));
    }

```

在 `src-tauri/src/webviews.rs` 末尾追加刷新命令：

```rust
/// 刷新指定 provider 的主窗口 AI webview：重新导航到 settings 中配置的 url。
/// 供 Sidebar 刷新按钮使用，传入当前激活的 provider id。
#[tauri::command]
pub async fn refresh_active_ai_webview(app: AppHandle, provider_id: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label(&provider_id))
        .ok_or("webview not found")?;
    let settings = crate::settings_io::read_settings(&app);
    let url = settings
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .map(|p| p.url.clone())
        .ok_or("provider not found")?;
    let parsed: tauri::Url = url.parse().map_err(|_| "invalid url".to_string())?;
    wv.navigate(parsed).map_err(|e| e.to_string())
}
```

`webviews.rs` 顶部 `use` 已含 `Manager`（`get_webview` 来自它）；`AppHandle` 也已在 `use tauri::{...}` 中。若 `cargo check` 报缺失再按提示补。

- [ ] **Step 3: 注册刷新命令**

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 宏里，于 `webviews::reposition_ai_webviews` 后加逗号并新增：

```rust
            webviews::reposition_ai_webviews,
            webviews::refresh_active_ai_webview
```

- [ ] **Step 4: 验证**

从 `src-tauri` 运行：

```bash
cargo test --lib
cargo check
```

预期：PASS + 编译通过。

- [ ] **Step 5: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src-tauri/src/state.rs src-tauri/src/webviews.rs src-tauri/src/lib.rs
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: 刷新 AI webview 与 url 变更重建"
```

---

### Task 6: 前端命令绑定

**Files:**
- Modify: `src/lib/commands.ts`

- [ ] **Step 1: 新增绑定**

在 `src/lib/commands.ts` 顶部追加导入：

```ts
import { convertFileSrc } from "@tauri-apps/api/core";
import type { AiProvider, LogoAction, LogoResult, ProviderLogo } from "../state/types";
```

（现有文件已 `import type { AiProvider } from "../state/types";`，将其合并为上面这行，避免重复导入。）

在文件末尾追加：

```ts
/** LogoResult → ProviderLogo：image.path 用 convertFileSrc 转成可加载 URL */
function logoResultToProviderLogo(result: LogoResult): ProviderLogo {
  if (result.type === "letter") return { type: "letter", color: result.color };
  return { type: "image", src: convertFileSrc(result.path) };
}

/** 新增 provider：后端生成真实 id 与 logo，前端负责写入 settings */
export async function addProvider(input: {
  name: string;
  url: string;
  enabled: boolean;
  logoAction: LogoAction;
}): Promise<{ id: string; logo: ProviderLogo }> {
  const [id, result] = await invoke<[string, LogoResult]>("add_provider", input);
  return { id, logo: logoResultToProviderLogo(result) };
}

/** 保存已有 provider：后端校验并处理 logo，返回最终 logo 供前端写入 settings */
export async function saveProvider(input: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  logoAction: LogoAction;
}): Promise<ProviderLogo> {
  const result = await invoke<LogoResult>("validate_and_save_provider", input);
  return logoResultToProviderLogo(result);
}

/** 删除 provider 的 logo 文件（settings 由前端更新） */
export async function deleteProvider(id: string): Promise<void> {
  await invoke("delete_provider", { id });
}

/** 刷新主窗口当前激活的 AI webview */
export async function refreshActiveAiWebview(providerId: string): Promise<void> {
  await invoke("refresh_active_ai_webview", { providerId });
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm build
```

预期：tsc 通过（仅类型检查；后续任务会跑完整测试）。

- [ ] **Step 3: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/lib/commands.ts
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: provider 增删改前端命令绑定"
```

---

### Task 7: Toggle disabled + ProviderCard arrow + ProviderEditPanel 组件

**Files:**
- Modify: `src/components/Toggle.tsx`
- Test: `src/components/Toggle.test.tsx`
- Modify: `src/components/ProviderCard.tsx`
- Test: `src/components/ProviderCard.test.tsx`
- Create: `src/pages/settings/ProviderEditPanel.tsx`
- Test: `src/pages/settings/ProviderEditPanel.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/components/Toggle.test.tsx` 的 describe 内追加：

```ts
  it("does not call onChange when disabled", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={true} label="启用" disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
```

在 `src/components/ProviderCard.test.tsx` 的 describe 内追加（验证箭头 prop；letter logo 不渲染 svg，故用 svg 存在性判断箭头）：

```ts
  it("renders no chevron by default", () => {
    const { container } = render(<ProviderCard name="ChatGPT" logo={letterLogo} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders a chevron when arrow is set", () => {
    const { container } = render(<ProviderCard name="ChatGPT" logo={letterLogo} arrow="down" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
```

新建 `src/pages/settings/ProviderEditPanel.test.tsx`：

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import { ProviderEditPanel } from "./ProviderEditPanel";
import type { DraftProvider } from "../../state/types";

const draft: DraftProvider = {
  id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true,
  logo: { type: "letter", color: "#10A37F" },
};

function setup(overrides: Partial<React.ComponentProps<typeof ProviderEditPanel>> = {}) {
  const props = {
    draft, errors: {}, isTemp: false, canDisable: true, saving: false,
    onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), onDelete: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <ProviderEditPanel {...props} />
    </I18nProvider>
  );
  return props;
}

describe("ProviderEditPanel", () => {
  it("edits name via onChange", async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText("服务商名称"), "!");
    expect(props.onChange).toHaveBeenCalledWith({ name: "ChatGPT!" });
  });

  it("shows field errors", () => {
    setup({ errors: { name: "errors.nameRequired", url: "errors.urlInvalid" } });
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(screen.getByText("URL格式不正确")).toBeInTheDocument();
  });

  it("disables the enable toggle and delete, and shows hint, when it is the only enabled", () => {
    setup({ canDisable: false });
    expect(screen.getByText("至少需要保留一个启用的AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });

  it("hides delete button for a temp provider", () => {
    setup({ isTemp: true });
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("calls save / cancel", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(props.onSave).toHaveBeenCalled();
    expect(props.onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- src/components/Toggle.test.tsx src/components/ProviderCard.test.tsx src/pages/settings/ProviderEditPanel.test.tsx
```

预期：FAIL（`disabled` 未支持、ProviderCard 无 arrow、ProviderEditPanel 不存在）。

- [ ] **Step 3: 让 Toggle 支持 disabled、ProviderCard 支持 arrow**

将 `src/components/Toggle.tsx` 整体替换为：

```tsx
interface ToggleProps {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, label, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        padding: 2,
        background: checked ? "var(--accent)" : "var(--border)",
        transition: "background 0.15s",
        display: "inline-flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        alignItems: "center",
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
    </button>
  );
}
```

- [ ] **Step 4: 修改 ProviderCard 支持 arrow**

修改 `src/components/ProviderCard.tsx`，在顶部导入加 lucide chevron：

```tsx
import { ChevronDown, ChevronUp } from "lucide-react";
```

在 `Props` 接口中增加可选 prop：

```tsx
  logoSize?: number;
  /** 右侧箭头：不传 = 不显示；"up" 展开态，"down" 折叠态 */
  arrow?: "up" | "down";
```

把函数签名的解构加上 `arrow`：

```tsx
export function ProviderCard({ name, logo, selected, onClick, width = "100%", logoSize = 28, arrow }: Props) {
```

把 `content` 改为在名称后渲染箭头：

```tsx
  const content = (
    <>
      <ProviderLogo name={name} logo={logo} size={logoSize} />
      <span
        style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {name}
      </span>
      {arrow === "up" && <ChevronUp size={18} color="var(--fg-muted)" />}
      {arrow === "down" && <ChevronDown size={18} color="var(--fg-muted)" />}
    </>
  );
```

- [ ] **Step 5: 实现 ProviderEditPanel**

新建 `src/pages/settings/ProviderEditPanel.tsx`：

```tsx
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

const labelCol = { width: 80, fontSize: 13, color: "var(--fg-muted)", flexShrink: 0 } as const;
const inputStyle = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--fg)",
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
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--border)" }}>
      {/* Logo 区：居中。未上传=圆形虚线框 + Plus；已上传=缩略图 + 右下铅笔徽标 */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
        <button
          type="button"
          aria-label={t("ai.uploadLogo")}
          onClick={() => fileRef.current?.click()}
          style={{ position: "relative", width: 64, height: 64, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
        >
          {hasImage && draft.logo.type === "image" ? (
            <>
              <img src={draft.logo.src} alt="" width={64} height={64} style={{ borderRadius: 14, objectFit: "cover" }} />
              <span style={{ position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: "50%", background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Pencil size={12} color="var(--fg-muted)" />
              </span>
            </>
          ) : (
            <span style={{ width: 64, height: 64, borderRadius: "50%", border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-muted)" }}>
              <Plus size={24} />
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
      {logoError && <p style={{ color: "#e0533a", fontSize: 12, textAlign: "center", margin: 0 }}>{t(logoError)}</p>}

      {/* 名称 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={labelCol}>{t("ai.name")}</span>
        <input aria-label={t("ai.name")} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} style={inputStyle} />
      </div>
      {errors.name && <p style={{ color: "#e0533a", fontSize: 12, margin: "0 0 0 92px" }}>{t(errors.name)}</p>}

      {/* URL */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={labelCol}>{t("ai.url")}</span>
        <input aria-label={t("ai.url")} value={draft.url} onChange={(e) => onChange({ url: e.target.value })} style={inputStyle} />
      </div>
      {errors.url && <p style={{ color: "#e0533a", fontSize: 12, margin: "0 0 0 92px" }}>{t(errors.url)}</p>}

      {/* 启用 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={labelCol}>{t("ai.enabled")}</span>
        <Toggle checked={draft.enabled} label={t("ai.enabled")} disabled={isOnlyEnabled} onChange={(v) => onChange({ enabled: v })} />
        {isOnlyEnabled && <span style={{ color: "#e0a23a", fontSize: 12 }}>{t("settings.atLeastOneEnabled")}</span>}
      </div>

      {errors.general && <p style={{ color: "#e0533a", fontSize: 12, margin: 0 }}>{t(errors.general)}</p>}

      {/* 底部操作：删除居左（临时项隐藏），保存 + 取消居右 */}
      <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        {!isTemp && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isOnlyEnabled}
            title={isOnlyEnabled ? t("settings.atLeastOneEnabled") : undefined}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #e0533a", background: "transparent", color: "#e0533a", cursor: isOnlyEnabled ? "not-allowed" : "pointer", opacity: isOnlyEnabled ? 0.5 : 1 }}
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
          style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "default" : "pointer", marginRight: 8, opacity: saving ? 0.6 : 1 }}
        >
          {t("ai.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", cursor: "pointer" }}
        >
          {t("ai.cancel")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm test -- src/components/Toggle.test.tsx src/components/ProviderCard.test.tsx src/pages/settings/ProviderEditPanel.test.tsx
```

预期：PASS。

- [ ] **Step 7: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/components/Toggle.tsx src/components/Toggle.test.tsx src/components/ProviderCard.tsx src/components/ProviderCard.test.tsx src/pages/settings/ProviderEditPanel.tsx src/pages/settings/ProviderEditPanel.test.tsx
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: Toggle 禁用态、ProviderCard 箭头与 ProviderEditPanel"
```

---

### Task 8: 重写 AiConfigSettings（草稿模式 + 增删改）

**Files:**
- Modify: `src/pages/settings/AiConfigSettings.tsx`
- Test: `src/pages/settings/AiConfigSettings.test.tsx`

- [ ] **Step 1: 重写测试**

将 `src/pages/settings/AiConfigSettings.test.tsx` 整体替换为：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
  SETTINGS_CHANGED_EVENT: "settings:changed",
}));

const addProvider = vi.fn();
const saveProvider = vi.fn();
const deleteProvider = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  addProvider: (i: unknown) => addProvider(i),
  saveProvider: (i: unknown) => saveProvider(i),
  deleteProvider: (id: string) => deleteProvider(id),
}));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { AiConfigSettings } from "./AiConfigSettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <AiConfigSettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  saveSettings.mockClear();
  addProvider.mockReset();
  saveProvider.mockReset().mockResolvedValue({ type: "letter", color: "#10A37F" });
  deleteProvider.mockReset().mockResolvedValue(undefined);
});

describe("AiConfigSettings", () => {
  it("renders a row per provider", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("does not persist while editing; saves only on save button", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    const urlInput = await screen.findByLabelText("官网地址");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://chat.openai.com");
    expect(saveSettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chatgpt", url: "https://chat.openai.com" })
    );
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.find((p: any) => p.id === "chatgpt").url).toBe("https://chat.openai.com");
    });
  });

  it("shows validation errors and does not call backend on empty name", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    await userEvent.clear(await screen.findByLabelText("服务商名称"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(saveProvider).not.toHaveBeenCalled();
  });

  it("adds a provider via the temp card", async () => {
    addProvider.mockResolvedValue({ id: "newid", logo: { type: "letter", color: "#9333EA" } });
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "添加AI服务商" }));
    await userEvent.type(await screen.findByLabelText("服务商名称"), "X");
    await userEvent.type(screen.getByLabelText("官网地址"), "https://x.com");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(addProvider).toHaveBeenCalled();
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.some((p: any) => p.id === "newid")).toBe(true);
    });
  });

  it("deletes a provider after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup();
    await waitFor(() => screen.getByText("Claude"));
    await userEvent.click(screen.getByRole("button", { name: "Claude" }));
    await userEvent.click(await screen.findByRole("button", { name: "删除" }));
    expect(deleteProvider).toHaveBeenCalledWith("claude");
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.providers.some((p: any) => p.id === "claude")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- src/pages/settings/AiConfigSettings.test.tsx
```

预期：FAIL（旧实现无保存按钮/添加按钮等）。

- [ ] **Step 3: 重写 AiConfigSettings**

将 `src/pages/settings/AiConfigSettings.tsx` 整体替换为：

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { ProviderCard } from "../../components/ProviderCard";
import { ProviderEditPanel } from "./ProviderEditPanel";
import { validateProvider, canDisableProvider } from "../../lib/providerValidation";
import { logoActionFromDraft } from "../../lib/logo";
import { addProvider, saveProvider, deleteProvider } from "../../lib/commands";
import type { AiProvider, DraftProvider, Settings, ValidationErrors } from "../../state/types";

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
    if (tempProvider) return; // 有临时新增时不允许展开其它
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
        const logo = await saveProvider({ id: draft.id, name, url, enabled: draft.enabled, logoAction: action });
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
    // 兜底：唯一启用项不可删（UI 已禁用按钮，此处再防御一层）
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

  const cardWrap = { display: "flex", flexDirection: "column" } as const;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8, maxWidth: 800 }}>
      {settings.providers.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} style={cardWrap}>
            <ProviderCard
              name={p.name}
              logo={p.logo}
              arrow={open ? "up" : "down"}
              onClick={() => {
                if (tempProvider) return;
                if (open) closeCard();
                else openCard(p);
              }}
            />
            {open && draft && (
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
        );
      })}

      {tempProvider && draft && openId === tempProvider.id && (
        <div style={cardWrap}>
          <ProviderCard name={draft.name} logo={draft.logo} arrow="up" />
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
      )}

      {!tempProvider && (
        <button
          type="button"
          aria-label={t("ai.add")}
          onClick={handleAdd}
          style={{ width: "100%", height: 60, display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--border)", borderRadius: 10, background: "transparent", color: "var(--fg-muted)", cursor: "pointer" }}
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test -- src/pages/settings/AiConfigSettings.test.tsx
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/pages/settings/AiConfigSettings.tsx src/pages/settings/AiConfigSettings.test.tsx
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: AiConfigSettings 草稿模式增删改"
```

---

### Task 9: BasicSettings 启用规则改造

**Files:**
- Modify: `src/pages/settings/BasicSettings.tsx`
- Test: `src/pages/settings/BasicSettings.test.tsx`

- [ ] **Step 1: 改写相关测试**

将 `src/pages/settings/BasicSettings.test.tsx` 中名为 `"blocks disabling the provider quick-ask is using, and shows a hint"` 的整个 `it(...)` 块替换为下面两个测试：

```ts
  it("switches quickAskProviderId when disabling the in-use provider (others enabled)", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: /ChatGPT 启用状态/ }));
    await act(async () => {
      // ChatGPT 是默认 quickAskProviderId，但仍有其它启用项，可停用并自动切换默认
      (await screen.findByRole("button", { name: /ChatGPT 启用状态/ })).click();
    });
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.providers.find((p: any) => p.id === "chatgpt").enabled).toBe(false);
    expect(last.quickAskProviderId).toBe("claude");
  });

  it("blocks disabling the last enabled provider", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: /ChatGPT 启用状态/ }));
    await act(async () => {
      (await screen.findByRole("button", { name: /Claude 启用状态/ })).click();
    });
    await act(async () => {
      (await screen.findByRole("button", { name: /Google AI Studio 启用状态/ })).click();
    });
    saveSettings.mockClear();
    await act(async () => {
      // 此时仅剩 ChatGPT 启用，停用应被拦下
      (await screen.findByRole("button", { name: /ChatGPT 启用状态/ })).click();
    });
    expect(screen.getByText("至少需要保留一个启用的AI")).toBeInTheDocument();
    expect(saveSettings).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- src/pages/settings/BasicSettings.test.tsx
```

预期：FAIL（旧逻辑按 quickAsk 占用拦截）。

- [ ] **Step 3: 改造 setProviderEnabled**

在 `src/pages/settings/BasicSettings.tsx` 中，将 `setProviderEnabled` 函数替换为：

```tsx
  const setProviderEnabled = (id: string, enabled: boolean) => {
    const enabledCount = settings.providers.filter((p) => p.enabled).length;
    // 至少保留一个启用
    if (!enabled && enabledCount <= 1) {
      setInUseHint(true);
      return;
    }
    setInUseHint(false);
    const nextProviders = settings.providers.map((p) => (p.id === id ? { ...p, enabled } : p));
    const patch: Partial<Settings> = { providers: nextProviders };
    // 若停用的是快捷提问当前使用的 provider，切到第一个启用的
    if (!enabled && id === settings.quickAskProviderId) {
      const firstEnabled = nextProviders.find((p) => p.enabled);
      if (firstEnabled) patch.quickAskProviderId = firstEnabled.id;
    }
    updateSettings(patch);
  };
```

将文件中提示文案那行：

```tsx
          <p style={{ color: "#e0a23a", fontSize: 12, marginTop: 8 }}>{t("settings.inUseByQuickAsk")}</p>
```

改为：

```tsx
          <p style={{ color: "#e0a23a", fontSize: 12, marginTop: 8 }}>{t("settings.atLeastOneEnabled")}</p>
```

将顶部类型导入：

```tsx
import type { QuickAskResetPolicy, ThemeMode } from "../../state/types";
```

改为：

```tsx
import type { QuickAskResetPolicy, Settings, ThemeMode } from "../../state/types";
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test -- src/pages/settings/BasicSettings.test.tsx
```

预期：PASS（含原有的 keepState、resetPolicy、列表渲染等测试）。

- [ ] **Step 5: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/pages/settings/BasicSettings.tsx src/pages/settings/BasicSettings.test.tsx
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: BasicSettings 至少保留一个启用"
```

---

### Task 10: QuickAskBar 自动切换 Provider

**Files:**
- Modify: `src/pages/quick-ask/QuickAskBar.tsx`
- Test: `src/pages/quick-ask/QuickAskBar.test.tsx`

- [ ] **Step 1: 让测试可注入 settings、可推送跨窗口变更，并写失败测试**

将 `src/pages/quick-ask/QuickAskBar.test.tsx` 顶部原有的 settingsStore mock（`const saveSettings = vi.fn()...vi.mock("../../state/settingsStore", ...)` 整段）替换为可注入版本：

```ts
const settingsState = vi.hoisted(() => ({ value: null as unknown }));
const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(settingsState.value ?? DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
  SETTINGS_CHANGED_EVENT: "settings:changed",
}));
```

在已有的 `@tauri-apps/api/window` mock 之后，追加 `@tauri-apps/api/event` mock，捕获 `SettingsContext` 注册的跨窗口变更回调，供测试模拟「另一个窗口改了设置」的广播：

```ts
// 捕获 SETTINGS_CHANGED_EVENT 监听器；context 在非 Tauri 环境本会吞掉 listen，这里改为可注入
const ev = vi.hoisted(() => ({ cb: null as null | ((e: { payload: unknown }) => void) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (_name: string, cb: (e: { payload: unknown }) => void) => {
    ev.cb = cb;
    return Promise.resolve(() => {});
  },
}));
```

在 `beforeEach` 末尾追加重置：

```ts
  settingsState.value = null;
  ev.cb = null;
```

在 describe 内追加两个测试：

```ts
  it("auto-switches quick-ask provider when the saved one is no longer enabled", async () => {
    settingsState.value = {
      ...DEFAULT_SETTINGS,
      providers: DEFAULT_SETTINGS.providers.map((p) =>
        p.id === "chatgpt" ? { ...p, enabled: false } : p
      ),
      quickAskProviderId: "chatgpt",
    };
    setup();
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)?.[0];
      expect(last?.quickAskProviderId).toBe("claude");
    });
    expect(setQuickAskProvider).toHaveBeenCalledWith("https://claude.ai");
  });

  it("re-navigates when the current provider's url changes (same id)", async () => {
    setup();
    await waitFor(() => screen.getByRole("button", { name: "选择 AI" }));
    setQuickAskProvider.mockClear();
    // 另一个窗口把当前默认 provider（chatgpt）的 url 改了，广播完整 settings
    await act(async () => {
      ev.cb?.({
        payload: {
          ...DEFAULT_SETTINGS,
          providers: DEFAULT_SETTINGS.providers.map((p) =>
            p.id === "chatgpt" ? { ...p, url: "https://chat.openai.com/new" } : p
          ),
        },
      });
    });
    await waitFor(() =>
      expect(setQuickAskProvider).toHaveBeenCalledWith("https://chat.openai.com/new")
    );
  });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- src/pages/quick-ask/QuickAskBar.test.tsx
```

预期：FAIL（无自动切换逻辑）。

- [ ] **Step 3: 添加自动切换 / URL 重导航 effect**

在 `src/pages/quick-ask/QuickAskBar.tsx` 中，`useEffect` 与 `useRef` 导入均已存在（见文件首行）。先在 `current` 计算之后加一个 ref 跟踪上次导航的 url：

```tsx
  // 跟踪上次导航到的 url，用于区分「首次挂载」与「同一 provider 的 url 真正变更」
  const lastUrlRef = useRef<string | undefined>(undefined);
```

紧接其后、`togglePin` 之前插入 effect：

```tsx
  // ① 默认 provider 被停用/删除（id 变化）→ 切到第一个启用的并持久化；
  // ② 同一 provider 的 url 变更 → 重新导航（spec 7.2）。
  // 首次挂载只记录 url、不导航：初始 url 由 Rust 创建 webview 时已设置，避免冗余 reload。
  useEffect(() => {
    const enabledList = settings.providers.filter((p) => p.enabled);
    const next = enabledList.find((p) => p.id === settings.quickAskProviderId) ?? enabledList[0];
    if (!next) return;
    if (next.id !== settings.quickAskProviderId) {
      void updateSettings({ quickAskProviderId: next.id });
      void setQuickAskProvider(next.url);
    } else if (lastUrlRef.current !== undefined && lastUrlRef.current !== next.url) {
      void setQuickAskProvider(next.url);
    }
    lastUrlRef.current = next.url;
  }, [settings.providers, settings.quickAskProviderId, updateSettings]);
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test -- src/pages/quick-ask/QuickAskBar.test.tsx
```

预期：PASS（含原有 QuickAskBar 测试）。

- [ ] **Step 5: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/pages/quick-ask/QuickAskBar.tsx src/pages/quick-ask/QuickAskBar.test.tsx
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: 快捷提问自动切换可用 provider"
```

---

### Task 11: Sidebar 刷新按钮与图标

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Test: `src/components/Sidebar.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 写失败测试**

将 `src/components/Sidebar.test.tsx` 中三处 `render(<Sidebar ... />)` 调用都加上 `onRefresh={() => {}}` 属性，并追加测试：

```ts
  it("calls onRefresh when refresh button clicked", async () => {
    const onRefresh = vi.fn();
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={() => {}} onOpenSettings={() => {}} onRefresh={onRefresh} />);
    await userEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(onRefresh).toHaveBeenCalled();
  });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- src/components/Sidebar.test.tsx
```

预期：FAIL（无刷新按钮 / 缺 onRefresh）。

- [ ] **Step 3: 改 Sidebar**

将 `src/components/Sidebar.tsx` 整体替换为：

```tsx
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
```

- [ ] **Step 4: 接线 App.tsx**

在 `src/App.tsx` 顶部导入加上 `refreshActiveAiWebview`：

```tsx
import { syncAiWebviews, hideAiWebviews, repositionAiWebviews, refreshActiveAiWebview } from "./lib/commands";
```

给 `<Sidebar ... />` 加 `onRefresh`：

```tsx
      <Sidebar
        providers={enabledProviders}
        activeId={activeId}
        settingsActive={showSettings}
        onSelect={(id) => {
          setActiveId(id);
          setShowSettings(false);
        }}
        onOpenSettings={() => setShowSettings(true)}
        onRefresh={() => {
          if (activeId) void refreshActiveAiWebview(activeId);
        }}
      />
```

- [ ] **Step 5: 更新 App.test.tsx 的 commands mock**

`src/App.test.tsx` 中 `vi.mock("./lib/commands", ...)` 的对象补上：

```ts
vi.mock("./lib/commands", () => ({
  syncAiWebviews: vi.fn().mockResolvedValue(undefined),
  hideAiWebviews: vi.fn().mockResolvedValue(undefined),
  repositionAiWebviews: vi.fn().mockResolvedValue(undefined),
  refreshActiveAiWebview: vi.fn().mockResolvedValue(undefined),
}));
```

`App.test.tsx` 中 `"opens settings when gear clicked"` 用例仍按 `name: "设置"` 查询设置按钮（aria-label 不变），无需改动。

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm test -- src/components/Sidebar.test.tsx src/App.test.tsx
```

预期：PASS。

- [ ] **Step 7: 提交**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/components/Sidebar.tsx src/components/Sidebar.test.tsx src/App.tsx src/App.test.tsx
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: Sidebar 刷新按钮与图标更新"
```

---

### Task 12: 全量验证与手动联调

**Files:**
- 无源码改动，除非验证暴露缺陷。

- [ ] **Step 1: 前端全量测试**

```bash
pnpm test
```

预期：全部 Vitest 套件 PASS。

- [ ] **Step 2: Rust 测试与检查**

从 `src-tauri` 运行：

```bash
cargo test --lib
cargo check
```

预期：PASS + 编译通过。

- [ ] **Step 3: 生产构建**

仓库根目录运行：

```bash
pnpm build
```

预期：tsc + vite 构建通过。

- [ ] **Step 4: 启动 Tauri 联调**

后台启动，避免阻塞会话：

```powershell
$log = Join-Path $env:TEMP "anyask-tauri-dev.log"
$proc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "tauri", "dev" -WorkingDirectory "D:\selfStudy\myprojects\anyask" -RedirectStandardOutput $log -RedirectStandardError $log -WindowStyle Hidden -PassThru
```

等待窗口出现或日志显示启动完成，记下 `$proc.Id` 备清理。

- [ ] **Step 5: 手动验证清单**

- 设置 → AI 配置：展开某卡片，改 URL 后**只**点保存才生效（编辑时不持久化）。
- 名称留空 / 填非法 URL：保存被拦，显示对应错误文案。
- 点「+」新增：填名称、URL，**不传 Logo** → 保存后列表出现新项，Logo 为字母+哈希色。
- 新增时**上传一张图**（>128 也可）：编辑面板显示缩略图 + 铅笔徽标；保存后侧栏/卡片/选择器都显示该图（验证 `convertFileSrc` + asset 协议在 Windows 生效，**重点**）。
- 编辑已有项**替换** Logo（再上传一张覆盖）：缩略图与各处显示更新为新图。（注：设计稿 4.3 无「移除 Logo / 恢复字母」入口，故不验证「切回字母」；后端 `generate` 仅用于新增与名称哈希，对已有图片项无 UI 触发路径。）
- 删除：原生确认框 → 确认后从列表消失，Logo 文件被删。
- 删除限制：当某项是唯一启用项时，其编辑面板「删除」按钮禁用并显示 tooltip「至少需要保留一个启用的AI」；即使绕过前端，后端 `delete_provider` 也返回 `atLeastOneEnabled`。
- 启用限制：把只剩一个启用项时，AI 配置面板内该 Toggle 禁用并提示；基本设置页点最后一个启用项被拦并提示。
- 停用快捷提问正在用的 provider（仍有其它启用）：快捷提问默认自动切到第一个启用的。
- 改某 provider 的 URL 后回到主界面：该 AI webview 重新加载到新 URL（验证 url 变更重建）。
- 改快捷提问当前 provider 的 URL：呼出快捷提问窗，其 AI webview 重新导航到新 URL（验证 spec 7.2 同 id url 变更）。
- 侧栏刷新按钮：刷新当前激活 AI 到其配置 URL；设置图标为 `Settings`，刷新图标为 `RotateCw`。
- 跨窗口：主窗口增删改后，呼出快捷提问窗，其 AI 选择列表同步最新。

- [ ] **Step 6: 清理联调进程**

```powershell
Stop-Process -Id $proc.Id
```

- [ ] **Step 7: 检查 git 状态**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask status --short
```

预期：无意外残留文件。

---

## Self-Review Notes

- **Spec 覆盖**：增删改查（Task 4/6/8）、Logo 上传与缩略图（Task 1/7，前端 Canvas + 后端落盘）、字母 Logo 哈希色（Task 3）、前后端校验（Task 1/3）、草稿模式与展开/丢弃（Task 8）、至少保留一个启用——停用与删除两路径（Task 1 `canDisableProvider` + Task 7/8/9 前端 UI 禁用 Toggle/删除按钮 + Task 4 后端 `validate_and_save_provider`/`delete_provider` 兜底）、快捷提问自动切换 + 同 id URL 变更重导航（Task 10，spec 7.2）、跨窗口同步（复用 `SETTINGS_CHANGED_EVENT`，Task 8/9/10 经 `updateSettings`）、主窗口 AI webview URL 变更重建（Task 5）、Sidebar 刷新按钮与图标（Task 11）、文案（Task 2）。
- **类型一致性**：前端 `LogoAction`/`LogoResult`/`DraftProvider`/`ValidationErrors`（types.ts）与后端 `LogoAction`/`LogoResult`（provider_utils.rs）字段对应；`LogoResult::Image` 用 `path`（非 spec 的 `assetUrl`），前端在 commands.ts 经 `convertFileSrc` 转 `src`。命令 JS 参数 camelCase（`logoAction`/`providerId`）经 Tauri 自动转 Rust snake_case（`logo_action`/`provider_id`）。
- **刻意偏离 spec**：见顶部「与 spec 的偏差记录」1–6，均已与用户确认。Logo URL 用 `convertFileSrc`（非硬编码 asset URL）；缩略图前端生成；「至少保留一个启用」停用与删除均前端 UI + 后端双重校验（删除流程必须后端先于 `updateSettings`，因后端校验依赖删除前的 settings.json）；折叠态复用 `ProviderCard`（新增可选 `arrow` prop）；箭头用 lucide chevron；快捷提问覆盖同 id URL 变更。spec 4.3 无「移除 Logo / 恢复字母」入口，故未实现该 UI（Task 12 验收据此调整）；reviewer 建议的 Logo 临时/版本化路径未采纳——spec 6.1 即覆盖写 `{id}.png` 的简单流程，本地写几乎不失败，引入随机后缀+清理为过度设计。
- **测试边界**：jsdom 无 canvas，`fileToThumbnailDataUrl` 与 asset 协议加载靠 Task 12 手动验证；纯逻辑（校验、颜色哈希、PNG 解码、`logoActionFromDraft`、`canDisableProvider`、`other_enabled_exists`）均有单元测试；删除/停用唯一启用项的拦截由 ProviderEditPanel 单测（按钮禁用）+ `other_enabled_exists` Rust 单测覆盖，命令级整合靠 Task 12 手动验证。

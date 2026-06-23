# 内置 Provider 图片 Logo 设计

## 1. 概述

把三个默认 AI Provider 的 Logo 从「字母色块」换成用户提供的官方品牌图片:

| Provider | id | 源文件 | 落地文件 |
|---|---|---|---|
| ChatGPT | `chatgpt` | `openai.png` | `public/providers/chatgpt.png` |
| Claude | `claude` | `claude-color.png` | `public/providers/claude.png` |
| Google AI Studio | `aistudio` | `aistudio.png` | `public/providers/aistudio.png` |

三张图均为 640×640、透明背景的 PNG。

### 核心决策

- **渲染方式**:仅换图,不加任何底板/深色适配。已知取舍:OpenAI、AI Studio 为纯黑图形,在深色主题(`--bg-elev: #2a2a2a`)下几乎不可见 —— 用户已确认接受。
- **存放位置**:用 `public/` 而非 `src/assets/`。public 路径稳定(`/providers/chatgpt.png`,无内容 hash),写进 `settings.json` 持久化后,跨重新构建仍有效;`src/assets/` 导入会带 hash,持久化后跨构建会裂图。
- **不做老用户迁移**:`mergeSettings` 保留已存的 `providers`,已经存过设置的用户仍是字母 Logo,只有全新安装/未存过设置的用户拿到图片。用户已确认接受。
- **连带修一个回归**:见 §3。

## 2. 改动点

### 2.1 资源落地

把三张源文件复制到 `public/providers/`,命名对齐 provider id:`chatgpt.png` / `claude.png` / `aistudio.png`。

### 2.2 默认值(`src/state/defaults.ts`)

三个 provider 的 `logo` 字段:

```ts
// 之前
{ id: "chatgpt",  ..., logo: { type: "letter", color: "#10A37F" } }
{ id: "claude",   ..., logo: { type: "letter", color: "#D97757" } }
{ id: "aistudio", ..., logo: { type: "letter", color: "#4285F4" } }

// 之后
{ id: "chatgpt",  ..., logo: { type: "image", src: "/providers/chatgpt.png" } }
{ id: "claude",   ..., logo: { type: "image", src: "/providers/claude.png" } }
{ id: "aistudio", ..., logo: { type: "image", src: "/providers/aistudio.png" } }
```

### 2.3 渲染(`ProviderLogo.tsx`)—— 不改

图片为 640×640 正方形,渲染到正方形 `size×size` 时 `objectFit: "cover"` 与 `contain` 等效,无裁剪;`borderRadius` 作用于透明图无可见影响。组件无需改动。

## 3. 连带回归修复(`AiConfigSettings.save()`)

### 3.1 问题

默认 provider 变为 `image` 类型后会引入一个回归:在设置页编辑某个默认 provider(改名称/URL/启用态)并保存时,`logoActionFromDraft` 返回 `{ type: "keep" }` → 后端 `apply_logo_action(Keep)` 机械地按 id 拼出磁盘路径 `{app_data}/provider-logos/{id}.png` 并原样返回,**但内置图标从未写入该目录** → 前端 `convertFileSrc` 得到一个指向不存在文件的 URL → 保存后该 Logo 变成裂图。

(对用户上传的图无此问题:上传时确实把文件写进了 `provider-logos/{id}.png`,拼出的路径指向真实文件。)

### 3.2 修法

`AiConfigSettings.save()` 的「编辑已有 provider」分支中,当 `action.type === "keep"` 时**沿用前端当前的 `draft.logo`**,不再用后端返回的 `LogoResult` 覆盖。前端已持有正确的 src(内置图为 `/providers/xxx.png`,上传图为已可用的 `convertFileSrc` URL),对两种来源都正确。

```ts
// 伪代码:save() 的 else 分支
const action = logoActionFromDraft(draft);
const resultLogo = await saveProvider({ id, name, url, enabled, logoAction: action });
const logo = action.type === "keep" ? draft.logo : resultLogo;
const updated: AiProvider = { id: draft.id, name, url, enabled: draft.enabled, logo };
```

后端 `saveProvider` 仍照常调用,继续承担名称/URL 校验与「至少保留一个启用」的兜底检查;只是 `keep` 场景下忽略其返回的 logo。`upload` / `generate` 场景行为不变(仍用后端返回值,保留上传的缓存击穿 `?v=` 逻辑)。

不改 Rust 侧、不改 `logo.ts`、不改 `ProviderLogo.tsx`、不改上传/编辑面板 UI。

## 4. 测试

- `src/state/defaults.test.ts`:新增断言 —— 三个默认 provider 的 `logo.type === "image"`,且 src 分别为 `/providers/chatgpt.png`、`/providers/claude.png`、`/providers/aistudio.png`。(现有「3 个内置、全部启用」的断言不受影响。)
- `src/pages/settings/AiConfigSettings.test.tsx`:新增一条 —— 编辑一个 image 类型的默认 provider(如改 URL)并保存后,该 provider 的 `logo.src` 保持不变(不被后端返回的磁盘路径覆盖)。

## 5. 不做(YAGNI)

- 不做老用户数据迁移。
- 不加底板、不做深色主题适配、不改图片 `objectFit`。
- 不动 Rust 后端、上传逻辑、编辑面板其它字段。

## 6. 验收

- 全新状态(未存过 settings)下启动,侧栏与设置页三个默认 provider 显示为对应官方图片。
- 在设置页编辑任一默认 provider 改 URL 并保存,其图片 Logo 不裂、保持显示。
- `pnpm test` 全绿。
- 已知现象(非缺陷):深色主题下 OpenAI、AI Studio 黑色图形不可见。

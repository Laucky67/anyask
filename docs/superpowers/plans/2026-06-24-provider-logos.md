# 内置 Provider 图片 Logo 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ChatGPT / Claude / Google AI Studio 三个默认 provider 的 Logo 从字母色块换成官方品牌图片,并修复由此引入的「编辑默认 provider 保存后图标裂图」回归。

**Architecture:** 三张透明 PNG 放进 `public/providers/`(路径稳定、可安全持久化),`defaults.ts` 把三者 logo 改为 `{ type:"image", src:"/providers/xxx.png" }`;`ProviderLogo.tsx` 不改(正方形图 cover≡contain)。回归修复:`AiConfigSettings.save()` 在 `keep` 场景沿用前端已有 `draft.logo`,不被后端按 id 拼出的磁盘路径覆盖。

**Tech Stack:** React 19 + TypeScript + Vite(`public/` 静态资源)、Vitest + Testing Library、pnpm。

**对应 spec:** `docs/superpowers/specs/2026-06-24-provider-logos-design.md`

**分支:** `feat/provider-logos`(已创建并切换)

---

### Task 1: 落地三张图片资源到 public/providers/

**Files:**
- Create: `public/providers/chatgpt.png`(源 `C:\Users\Laucky\Downloads\openai.png`)
- Create: `public/providers/claude.png`(源 `C:\Users\Laucky\Downloads\claude-color.png`)
- Create: `public/providers/aistudio.png`(源 `C:\Users\Laucky\Downloads\aistudio.png`)

> 资源复制,非 TDD。

- [ ] **Step 1: 创建目录并复制三张图(对齐 provider id 命名)**

Run:
```bash
mkdir -p public/providers
cp /c/Users/Laucky/Downloads/openai.png       public/providers/chatgpt.png
cp /c/Users/Laucky/Downloads/claude-color.png public/providers/claude.png
cp /c/Users/Laucky/Downloads/aistudio.png     public/providers/aistudio.png
```

- [ ] **Step 2: 校验三张图已就位且非空**

Run:
```bash
ls -l public/providers/
```
Expected: 列出 `chatgpt.png`、`claude.png`、`aistudio.png`,字节数分别约 11297 / 9337 / 4491,均 > 0。

- [ ] **Step 3: 提交**

```bash
git add public/providers/chatgpt.png public/providers/claude.png public/providers/aistudio.png
git commit -m "assets: 内置 provider 官方 Logo 图片"
```

---

### Task 2: 默认 provider 改用 image logo

**Files:**
- Modify: `src/state/defaults.ts:3-7`(`DEFAULT_PROVIDERS` 三个 logo 字段)
- Test: `src/state/defaults.test.ts`(新增一条断言)

- [ ] **Step 1: 写失败测试**

在 `src/state/defaults.test.ts` 的 `describe("DEFAULT_SETTINGS", ...)` 块内(例如紧跟第一条 `it` 之后)新增:

```ts
  it("uses image logos for the 3 built-in providers", () => {
    const byId = Object.fromEntries(DEFAULT_PROVIDERS.map((p) => [p.id, p.logo]));
    expect(byId.chatgpt).toEqual({ type: "image", src: "/providers/chatgpt.png" });
    expect(byId.claude).toEqual({ type: "image", src: "/providers/claude.png" });
    expect(byId.aistudio).toEqual({ type: "image", src: "/providers/aistudio.png" });
  });
```

- [ ] **Step 2: 运行测试,确认失败**

Run:
```bash
pnpm exec vitest run src/state/defaults.test.ts -t "uses image logos"
```
Expected: FAIL —— 实际是 `{ type: "letter", color: ... }`,与期望的 image 不等。

- [ ] **Step 3: 改默认值**

把 `src/state/defaults.ts` 第 3-7 行的 `DEFAULT_PROVIDERS` 改为:

```ts
export const DEFAULT_PROVIDERS: AiProvider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true, logo: { type: "image", src: "/providers/chatgpt.png" } },
  { id: "claude", name: "Claude", url: "https://claude.ai", enabled: true, logo: { type: "image", src: "/providers/claude.png" } },
  { id: "aistudio", name: "Google AI Studio", url: "https://aistudio.google.com", enabled: true, logo: { type: "image", src: "/providers/aistudio.png" } },
];
```

- [ ] **Step 4: 运行测试,确认通过**

Run:
```bash
pnpm exec vitest run src/state/defaults.test.ts
```
Expected: PASS(含原有「3 个内置、全部启用」等断言与新增的 image 断言)。

- [ ] **Step 5: 跑全量测试,确认没打挂其它用例**

Run:
```bash
pnpm test
```
Expected: 全绿。重点确认 `App.test.tsx`、`AiConfigSettings.test.tsx` 仍通过(它们经 mock 用到 `DEFAULT_SETTINGS`,但都按 provider 名/aria-label 定位,与 logo 类型无关)。

- [ ] **Step 6: 提交**

```bash
git add src/state/defaults.ts src/state/defaults.test.ts
git commit -m "feat: 内置 provider 默认使用图片 Logo"
```

---

### Task 3: 修复编辑默认 provider 保存后图标裂图的回归

**背景:** 默认 provider 变为 image 后,在设置页编辑它并保存 → `logoActionFromDraft` 返回 `{type:"keep"}` → 后端 `apply_logo_action(Keep)` 机械地按 id 拼出磁盘路径 `provider-logos/{id}.png` 原样返回,但内置图标从未写入该目录 → 前端用该不存在路径覆盖 logo → 裂图。修法:`keep` 场景沿用前端当前的 `draft.logo`。

**Files:**
- Modify: `src/pages/settings/AiConfigSettings.tsx:71-72`(`save()` 的「编辑已有」分支)
- Test: `src/pages/settings/AiConfigSettings.test.tsx`(新增一条断言)

- [ ] **Step 1: 写失败测试**

在 `src/pages/settings/AiConfigSettings.test.tsx` 的 `describe("AiConfigSettings", ...)` 块内新增(放在最后一条 `it` 之后):

```ts
  it("keeps the built-in image logo when editing & saving a default provider", async () => {
    // 模拟后端 keep 返回一个指向不存在文件的路径(真实回归场景)
    saveProvider.mockResolvedValue({ type: "image", src: "asset://localhost/provider-logos/chatgpt.png?bad" });
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    const urlInput = await screen.findByLabelText("官网地址");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://chat.openai.com");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    // 应以 keep 操作保存
    expect(saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chatgpt", logoAction: { type: "keep" } })
    );
    // 持久化后的 logo 应沿用内置图,而非后端返回的坏路径
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      const chatgpt = last.providers.find((p: any) => p.id === "chatgpt");
      expect(chatgpt.logo).toEqual({ type: "image", src: "/providers/chatgpt.png" });
    });
  });
```

- [ ] **Step 2: 运行测试,确认失败**

Run:
```bash
pnpm exec vitest run src/pages/settings/AiConfigSettings.test.tsx -t "keeps the built-in image logo"
```
Expected: FAIL —— 持久化的 `chatgpt.logo` 为 `{ type:"image", src:"asset://localhost/provider-logos/chatgpt.png?bad" }`(被后端返回值覆盖),不等于内置图。

- [ ] **Step 3: 实现修复**

在 `src/pages/settings/AiConfigSettings.tsx` 的 `save()` 中,把(第 71-72 行附近):

```ts
        const logo = await saveProvider({ id: draft.id, name, url, enabled: draft.enabled, logoAction: action });
        const updated: AiProvider = { id: draft.id, name, url, enabled: draft.enabled, logo };
```

改为:

```ts
        const resultLogo = await saveProvider({ id: draft.id, name, url, enabled: draft.enabled, logoAction: action });
        // keep:内置图标与未改动的上传图都不在后端按 id 拼出的磁盘路径上,沿用前端已有 logo 防止裂图
        const logo = action.type === "keep" ? draft.logo : resultLogo;
        const updated: AiProvider = { id: draft.id, name, url, enabled: draft.enabled, logo };
```

(`action` 已在上方 `const action = logoActionFromDraft(draft);` 定义;`upload`/`generate` 仍用后端返回值,保留上传缓存击穿 `?v=` 逻辑。)

- [ ] **Step 4: 运行测试,确认通过**

Run:
```bash
pnpm exec vitest run src/pages/settings/AiConfigSettings.test.tsx
```
Expected: PASS(新增用例 + 原有 5 条用例全过)。

- [ ] **Step 5: 跑全量测试 + 类型检查**

Run:
```bash
pnpm test && pnpm exec tsc --noEmit
```
Expected: 测试全绿;tsc 无类型错误。

- [ ] **Step 6: 提交**

```bash
git add src/pages/settings/AiConfigSettings.tsx src/pages/settings/AiConfigSettings.test.tsx
git commit -m "fix: 编辑内置 provider 保存时沿用前端 logo,避免裂图"
```

---

### Task 4: 人工验收(可选,需 Tauri 运行时)

> 自动化门槛是 `pnpm test` 全绿;以下为真实 app 的目视确认,需要时执行。

- [ ] **Step 1: 清掉本地旧 settings(否则 mergeSettings 会保留旧的字母 logo)**

旧设置存于 Tauri app data 目录的 `settings.json`。Windows 下通常在:
`%APPDATA%\<bundle-identifier>\settings.json`(bundle id 见 `src-tauri/tauri.conf.json` 的 `identifier`)。
删除该文件或其中 `settings` 键后重启,即可走到默认值。

- [ ] **Step 2: 启动并目视确认**

Run:
```bash
pnpm tauri dev
```
Expected:
- 浅色主题下,侧栏与设置页三个默认 provider 显示对应官方图片;
- 在设置页编辑任一默认 provider 改 URL 并保存,其图片不裂、保持显示;
- 已知现象(非缺陷):深色主题下 OpenAI、AI Studio 黑色图形几乎不可见。

---

## 自查(Self-Review)

**Spec 覆盖:**
- §2.1 资源落地 → Task 1 ✓
- §2.2 默认值改 image → Task 2 ✓
- §2.3 ProviderLogo 不改 → 计划无相关改动 ✓
- §3 keep 回归修复 → Task 3 ✓
- §4 测试(defaults 断言 + 编辑保存 src 不变)→ Task 2 Step1 / Task 3 Step1 ✓
- §5 不做迁移/不加底板 → 计划未触及 ✓
- §6 验收 → Task 4 ✓

**占位符扫描:** 无 TBD/TODO;每个改码步骤均含完整代码与确切命令。

**类型一致性:** `logo`/`resultLogo`/`action`/`draft.logo` 命名与 `AiConfigSettings.tsx`、`types.ts`(`ProviderLogo` 联合类型)一致;测试中 `saveProvider` mock 返回 `ProviderLogo` 与真实签名 `Promise<ProviderLogo>` 一致;断言的 src 路径三处统一为 `/providers/{id}.png`。

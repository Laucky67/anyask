# 快捷提问悬浮窗：自定义顶栏 + 可移动 + 置顶切换

## Context

当前快捷提问窗（`src-tauri/src/quick_ask.rs`）是**无边框窗口，直接把外部 AI 网址作为根 webview**，且 `always_on_top(true)` 长期置顶、不可移动、无工具栏。

用户要求加一条顶栏（见截图）：
1. 左 1：**隐藏**按钮
2. 左 2：**置顶**切换 —— 默认不置顶；呼出时显示在最上层；置顶手动开；置顶后图标由「灰」转「实（--fg）」
3. 右 1：**新对话** —— AI webview 导航回首页（已在首页则不触发）
4. 窗口**可拖动**
> 截图右侧多余的电话/归档图标不要，右侧只留「新对话」。

**关键架构改动**：外部网址无法叠加原生顶栏。需把窗口根 webview 换成**本地 React 壳**（渲染顶栏），AI 站点改为壳下方的**子 webview**——复用主窗口 `webviews.rs` 的 `window.add_child(...)` 模式。根 webview 变本地页后，`quick-ask` 窗口须纳入一个 Tauri capability。

图标用 **lucide-react**（`Minus`/`Pin`/`SquarePen`）。

**尺寸**：窗口 400×600，顶栏高 **40**，AI 子 webview = **400×560**，位于 `(0,40)`。

## 步骤 0：新建分支
在当前 `feat/phase1` 基础上新建并切到 `feat/quick-ask-toolbar`（执行阶段第一步）。

## 步骤 1：依赖
`pnpm add lucide-react`

## 步骤 2：Rust `src-tauri/src/state.rs`
`AppState` 增加 `quick_ask_pinned: std::sync::Mutex<bool>`（默认 false），作为置顶状态单一来源（供呼出时的临时 raise 判断是否要恢复非置顶）。

## 步骤 3：Rust `src-tauri/src/quick_ask.rs`（重写）
常量：`WIDTH=400.0`、`HEIGHT=600.0`、`TOPBAR_HEIGHT=40.0`、`AI_LABEL="quick-ask-ai"`。

- `toggle(app)`：
  - 窗口已存在：可见→`hide()`；否则 **raise 序列**（解决第 1 点：默认不置顶时 `set_focus()` 在 Windows 不一定压到最前）：
    `set_always_on_top(true)` → `show()` → `set_focus()` → 读 `AppState.quick_ask_pinned`，若为 false 再 `set_always_on_top(false)`。**不再重新居中**，保留拖动后的位置。
  - 窗口不存在：`WebviewUrl::App("index.html".into())` 建窗（`decorations(false)`、`skip_taskbar(true)`、`resizable(false)`、`always_on_top(false)`、`inner_size(400,600)`）；`app.get_window(LABEL)` 取 `Window` 后 `add_child` AI 子 webview：位置 `(0,40)`、尺寸 `(400,560)`、`WebviewUrl::External(target_url)`，**不用 auto_resize**（固定尺寸、避免覆盖顶栏）。仅首建调用 `center_bottom` + raise 序列。
- `set_url(app,url)`：保存 `quick_ask_url`；AI 子 webview 存在则 `navigate` 它（原为导航整窗）。
- `hide(app) -> Result<(),String>`：`win.hide()`。
- `set_pinned(app, pinned) -> Result<(),String>`：`win.set_always_on_top(pinned)?`；成功后写 `AppState.quick_ask_pinned = pinned`（先改窗口、成功再改状态，第 4 点）。
- `new_chat(app) -> Result<(),String>`：取 AI 子 webview；`home = target_url(app).parse::<tauri::Url>()`；`cur = wv.url()?`；**规范化比较 scheme/host/path/query**（去掉 fragment、path 末尾 `/` 归一），相同→不操作，不同→`wv.navigate(home)`（第 3 点，避免 `chatgpt.com` vs `chatgpt.com/` vs 带 query 误判）。

> ⚠️ 实现期发现：窗口含两个 webview（壳 + AI 子）后，**必须用 `app.get_window(LABEL)`（返回 `tauri::Window`）而非 `get_webview_window`** ——后者仅对单 webview 窗口返回 `Some`。详见 `docs/claude/fix/2026-06-13-fix-quick-ask-toolbar.md`。

## 步骤 4：Rust `commands.rs` + `lib.rs`
三个命令均返回 `Result<(),String>`（第 4 点）并在 `invoke_handler!` 注册：
`hide_quick_ask`、`set_quick_ask_pinned(pinned: bool)`、`quick_ask_new_chat`。

## 步骤 5：Rust 新建 capability `src-tauri/capabilities/quick-ask.json`
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "quick-ask",
  "description": "Capability for the quick-ask floating window",
  "windows": ["quick-ask"],
  "permissions": ["core:default", "store:default", "core:window:allow-start-dragging"]
}
```
> 自定义命令无需单独权限；`allow-start-dragging` 供 `data-tauri-drag-region`；`store:default` 供壳读设置应用主题。远程 AI 子 webview 默认拿不到 IPC，与主窗口现状一致。

## 步骤 6：前端 `src/main.tsx`（按窗口标签分流）
`getCurrentWindow().label === "quick-ask"` → 渲染 `<QuickAskShell/>`；否则现有主壳。两窗共用 `index.html`。

## 步骤 7：前端 `src/pages/quick-ask/QuickAskBar.tsx`（新建）
- 顶栏高 40，色用既有 CSS 变量（`--bg`/`--fg`/`--border`），随主题变化。
- **拖动（第 2 点，无 "deep")**：顶栏根 `<div data-tauri-drag-region>` + 左右按钮组之间放一个 `flex:1` 的 `<div data-tauri-drag-region>` spacer；按钮**不加**该属性（按钮保持可点且阻断拖动）。
- 左：`Minus`（隐藏→`await hideQuickAsk()`）、`Pin`（置顶，本地 `useState(pinned)`：点击算出 `next`，`await setQuickAskPinned(next)` 成功后 `setPinned(next)`，失败保持原状/不切换（第 4 点）；`aria-pressed={pinned}`）。
- 右：`SquarePen`（新对话→`await quickAskNewChat()`）。
- **图标配色（第 5 点）**：隐藏/新对话 = `var(--fg-muted)`，hover→`var(--fg)`；置顶按钮未置顶 = `var(--fg-muted)`，置顶 = `var(--fg)`（浅色=黑、深色=白，自动反转）。hover 背景 `var(--bg-elev)`。
- `QuickAskShell` 包 `I18nProvider`+`SettingsProvider`，用 `lib/theme.ts` 的 `resolveTheme/applyTheme`（同 `App.tsx`）应用主题。顶栏下方留空（由原生 AI 子 webview 覆盖）。

## 步骤 8：前端 `src/lib/commands.ts`
新增 `hideQuickAsk()`、`setQuickAskPinned(pinned:boolean)`、`quickAskNewChat()`（均 `await invoke`，错误向上抛供 UI 回滚）。

## 步骤 9：前端 `src/i18n/zh-CN.ts`
新增 `quickAsk.hide`/`quickAsk.pin`/`quickAsk.newChat`（aria-label）。

## 步骤 10：测试 `src/pages/quick-ask/QuickAskBar.test.tsx`（TDD）
mock `../../lib/commands`：
- 点隐藏 → `hideQuickAsk` 调用。
- 点置顶 → `setQuickAskPinned(true)`，resolve 后 `aria-pressed=true`；再点 → `setQuickAskPinned(false)`。
- **失败回滚**：`setQuickAskPinned` reject 时 `aria-pressed` 不变。
- 点新对话 → `quickAskNewChat` 调用。
用 aria-label 定位；lucide 渲染为 svg，jsdom 无碍。

## 验证
- `pnpm test`：新增 QuickAskBar 测试全过，现有 43 个不回归。
- `pnpm tsc --noEmit`：类型通过。
- `cd src-tauri && cargo check`：通过。
- `pnpm tauri dev` 手测（原生行为）：
  1. 呼出→顶栏 40px、AI 在下方、默认不置顶且呼出时**在最上层**（验证 raise 序列在全局快捷键场景可靠）。
  2. 拖顶栏空白/中间 spacer→窗口可移；再呼出位置保留。
  3. 图钉→置顶生效、图标转实色；再点取消；切别的主流窗口验证置顶确实在最前。
  4. 新对话→回首页；已在首页无动作；跳转后（带 query/hash）能正确回首页。
  5. 隐藏→窗口隐藏；再呼出恢复（对话状态保留）。
  6. 浅色/深色主题下图标颜色均清晰（反转）。

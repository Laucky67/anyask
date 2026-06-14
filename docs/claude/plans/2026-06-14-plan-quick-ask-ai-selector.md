# 快捷提问悬浮窗：顶栏 AI 选择器

- **日期**：2026-06-14ㅤ**分支**：`feat/quick-ask-toolbar`

## 目标
在悬浮窗顶栏「新对话」右侧加 AI 选择器：点开后在顶栏下方**扁平列出已启用 AI**（圆角卡片：左 Logo + 右 Name），点选即切换并记为默认。

## 关键设计
- **架构**：React 壳常驻底层，AI 原生子 webview 平时盖住下方区域。选 AI 时只做两步：① `hide` `quick-ask-ai` ② 露出 React 面板；选完/关闭：① 必要时 `navigate` ② `show`。免去 z-index/锚定/下拉遮挡问题。
- 选中**持久为默认**（写 `quickAskProviderId`）；**导航单个 webview**（不为每个 AI 建独立 webview）。
- **从源头禁止坏状态**：被快捷提问选用的 provider 不允许在设置页停用（`BasicSettings` 与 `AiConfigSettings` 两个入口都拦截并提示），因此无需 enabled 回退兜底。

## 改动
**Rust**
- `quick_ask.rs`：`set_url` 改 `Result`（**先导航成功再写 override**）；新增 `set_ai_visible(visible)`；`toggle` 呼出时强制 `show` AI（兜底）。
- `commands.rs`/`lib.rs`：`set_quick_ask_provider→Result`，新增并注册 `set_quick_ask_ai_visible`。

**前端**
- `components/ProviderCard.tsx`（新，可复用）：圆角矩形、左 logo 右 name、`width` 可传（默认 100% 自适应）、`selected`/`onClick`；类型用 `ProviderLogoType` 别名避免与组件同名。
- `QuickAskBar.tsx`：选择器按钮（当前 AI 图标+`ChevronDown`，点击 `open ? closePanel() : openPanel()`）；占满下方区域的卡片面板。统一 `closePanel`＝复位 + 尽力 `show` AI 且吞错（任何关闭路径都恢复 AI，避免留白）；选择走 `try/catch/finally`；空白处 `e.target===e.currentTarget` 关闭（防卡片冒泡）；失焦 `onFocusChanged` 复位；卸载兜底。
- `BasicSettings.tsx`/`AiConfigSettings.tsx`：禁止停用在用 provider 并提示；默认 AI 下拉仅列 enabled。
- `lib/commands.ts` 加 `setQuickAskAiVisible`；i18n 加 `quickAsk.selectAi`、`settings.inUseByQuickAsk`。

## 测试
新增 `ProviderCard.test`；`QuickAskBar.test` 扩到 9 例（开/选/失败恢复/点空白/失焦恢复）；两设置页加「停用在用 AI 被拦」用例。

## 验证
`pnpm test`（59 passed）、`pnpm tsc --noEmit`、`cargo check` 全过。

## 已知限制 → 已在后续修复
跨窗口设置不同步（详见 `docs/claude/fix/2026-06-14-fix-cross-window-settings-sync.md`）。

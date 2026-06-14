# Bug 修复报告：主窗口与悬浮窗设置不同步

- **日期**：2026-06-14ㅤ**分支**：`feat/quick-ask-toolbar`
- **改动**：`src/state/settingsStore.ts`、`src/state/SettingsContext.tsx`（+ 6 个测试文件的 mock 补导出）

## 现象
1. 悬浮窗换 AI 后，设置页「快捷提问默认 AI」不更新 → 悬浮窗正在用的 AI 仍可被停用。
2. 在设置页停用的 AI，仍出现在悬浮窗选择器里、可被选用。

## 根因（单一）
主窗口与悬浮窗是两个独立的 `SettingsProvider`，各自只在挂载时 `load` 一次设置并缓存。`@tauri-apps/plugin-store` 自带的 `onChange`/`onKeyChange` 按 `resourceId === this.rid` 过滤（`plugin-store/dist-js/index.js:214`），而**每个窗口 `load()` 得到不同 rid**，所以 store 变更事件**不跨窗口**——一个窗口写设置，另一个窗口的内存状态收不到通知。两个现象同此根因。

## 修复（一处同步）
- `saveSettings`（唯一写入口）持久化后用全局 `emit("settings:changed", settings)` 广播（best-effort，失败不影响保存）。
- `SettingsProvider` 用 `listen("settings:changed")` 接收，更新 `settingsRef` 与 `setSettings`——**只同步、不再写回**，故无回环。非 Tauri 环境（测试）下 `listen` 异常被吞掉。

修复后两窗即时同步：悬浮窗换 AI → 设置页默认 AI 跟随、守卫保护正确对象；设置页停用某 AI → 悬浮窗选择器即时移除（面板开着也实时更新）。

## 验证
- `SettingsContext.test` 新增「收到广播 → 内存同步且不再保存」用例。
- Vitest 严格 mock：给 6 个测试文件的 `settingsStore` mock 补 `SETTINGS_CHANGED_EVENT` 导出。
- `pnpm test`（59 passed）、`pnpm tsc`、`cargo check` 全过。

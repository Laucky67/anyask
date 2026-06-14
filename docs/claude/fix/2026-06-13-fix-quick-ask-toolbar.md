# Bug 修复报告：快捷提问悬浮窗按钮无效 & 快捷键无法隐藏

- **日期**：2026-06-13
- **分支**：`feat/quick-ask-toolbar`
- **关联计划**：`2026-06-13-plan-quick-ask-toolbar.md`
- **改动文件**：`src-tauri/src/quick_ask.rs`（仅此一个）

## 现象
1. 顶栏「隐藏」「置顶」按钮点击均无反应。
2. 全局快捷键能**呼出**悬浮窗，但再次按下**无法隐藏**。

## 根因（单一）
本次为顶栏功能给悬浮窗 `window.add_child(...)` 挂了 AI 子 webview，于是 `quick-ask` 窗口拥有了**两个 webview**（本地壳 `quick-ask` + AI 子 `quick-ask-ai`）。

Tauri 2 中 `app.get_webview_window(label)` 只对**单 webview** 窗口返回 `Some`，**多 webview 窗口返回 `None`**。
（佐证：`src-tauri/src/webviews.rs:27` 对多 webview 的主窗口一直用 `app.get_window("main")`，而非 `get_webview_window`。）

我在 `toggle` / `hide` / `set_pinned` 里都用了 `get_webview_window("quick-ask")`，改动后它们全部拿到 `None`：

| 路径 | 拿到 None 后的行为 | 表现 |
|---|---|---|
| `toggle`（快捷键） | 落入「创建」分支 → 窗口已存在、静默失败 → 从不 `hide()` | 再按快捷键不隐藏 |
| `hide` 命令（隐藏按钮） | `if let Some(..)` 不成立 → 空操作返回 Ok | 按钮无反应 |
| `set_pinned` 命令（置顶按钮） | `ok_or(..)?` → 返回 `Err` → 前端 catch 回滚 | 按钮无反应 |

**为何「改前能用、改后坏」**：旧悬浮窗直接把外部网址作为唯一根 webview（单 webview），`get_webview_window` 正常返回；加了子 webview 后才触发该限制。

> `new_chat` / `set_url` 用的是 `app.get_webview(AI_LABEL)`（直接按 webview 标签取子 webview），不受影响。

## 修复
`quick_ask.rs` 中所有**窗口级**操作统一改用 `app.get_window(LABEL)`（返回 `tauri::Window`，自带 `is_visible`/`hide`/`show`/`set_focus`/`set_always_on_top`/`set_position`/`current_monitor` 等）：

- `toggle`：存在判定改 `get_window`；创建后也用 `get_window` 取 `Window` 去 `add_child`、`center_bottom`、`raise`。
- `hide` / `set_pinned`：改 `get_window`。
- 辅助函数 `raise(&Window, ..)`、`center_bottom(&Window)` 形参由 `&WebviewWindow` 改为 `&tauri::Window`。

## 排查方法
按 systematic-debugging：先定位 bug 2（纯 Rust，无前端干扰）——发现 `toggle` 在「窗口已存在」时本应 `hide`，却因 `get_webview_window` 返回 `None` 落入创建分支。顺此线索发现两个命令用了同一 API，归结为**单一根因**，一处修复同时解决两个现象。未盲改前端拖动属性（`data-tauri-drag-region` 在 Tauri 2 只作用于精确命中元素，不拦截子按钮点击，非本次根因）。

## 验证
- `cargo check`：通过。
- 前端未改动，`pnpm test`（47 passed）不受影响。
- 待手测（`pnpm tauri dev`）：呼出↔再按隐藏可来回切换；隐藏/置顶/新对话按钮均生效。

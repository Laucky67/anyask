# 划词工具条 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在任意外部 App 中用全局快捷键（默认 `Alt+Q`）捕获选中文本，在鼠标处弹出可拓展的划词工具条（解释/翻译/总结/复制）。

**Architecture:** 新增一个复用型透明悬浮窗口 `selection-toolbar`（与 `quick-ask` 同模子），Rust 在快捷键 Released 时捕获文本+鼠标坐标、存入 `AppState`、emit 唤醒前端；React 渲染药丸、测量尺寸回传，Rust 按显示器边界防溢出钳制后显示。按钮以数据驱动（`BUILTIN_SELECTION_ACTIONS` 常量 + `kind→handler` 派发）渲染，为未来启用/停用与自建按钮留空间。

**Tech Stack:** Tauri 2（多 webview / global-shortcut / clipboard-manager / store 插件）、Rust（`get-selected-text` 0.1.6、`mouse_position` 0.1.4）、React 19 + TypeScript + Vite、lucide-react、Vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-06-16-selection-toolbar-design.md`

**前置：** 已在 `feature/selection-toolbar` 分支（基于 `dev`）。所有命令在项目根 `D:\selfStudy\myprojects\anyask` 下执行。`src-tauri/Cargo.toml` 工作区有 LF/CRLF 行尾噪声（空 diff），忽略即可。

---

## Phase A — 前端纯逻辑（Vitest 可测）

### Task 1: 划词动作数据模型 + 内置常量 + 图标注册表

**Files:**
- Create: `src/state/selectionActions.ts`
- Test: `src/state/selectionActions.test.ts`

- [ ] **Step 1: 写失败测试**

`src/state/selectionActions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BUILTIN_SELECTION_ACTIONS, ICON_REGISTRY, enabledActions } from "./selectionActions";

describe("BUILTIN_SELECTION_ACTIONS", () => {
  it("has the four builtins in order with correct kinds", () => {
    expect(BUILTIN_SELECTION_ACTIONS.map((a) => a.kind)).toEqual([
      "explain",
      "translate",
      "summarize",
      "copy",
    ]);
    expect(BUILTIN_SELECTION_ACTIONS.every((a) => a.source === "builtin")).toBe(true);
    expect(BUILTIN_SELECTION_ACTIONS.every((a) => a.enabled)).toBe(true);
  });

  it("every builtin has a labelKey and a registered icon", () => {
    for (const a of BUILTIN_SELECTION_ACTIONS) {
      expect(a.labelKey).toBeTruthy();
      expect(ICON_REGISTRY[a.icon]).toBeDefined();
    }
  });
});

describe("enabledActions", () => {
  it("filters disabled and sorts by order ascending", () => {
    const acts = [
      { id: "b", source: "builtin", kind: "copy", icon: "Copy", enabled: true, order: 2 },
      { id: "a", source: "builtin", kind: "explain", icon: "BookOpen", enabled: true, order: 1 },
      { id: "c", source: "builtin", kind: "translate", icon: "Languages", enabled: false, order: 3 },
    ];
    expect(enabledActions(acts as never).map((a) => a.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/state/selectionActions.test.ts`
Expected: FAIL — 无法解析 `./selectionActions`（模块不存在）。

- [ ] **Step 3: 写实现**

`src/state/selectionActions.ts`:

```ts
import { BookOpen, Languages, AlignLeft, Copy, type LucideIcon } from "lucide-react";

/** 行为派发依据；"prompt" 为未来自建按钮预留 */
export type SelectionActionKind = "explain" | "translate" | "summarize" | "copy" | "prompt";

export interface SelectionAction {
  id: string; // 内置 = kind；自建 = uuid
  source: "builtin" | "custom";
  kind: SelectionActionKind;
  labelKey?: string; // 内置走 i18n
  label?: string; // 自建走原文（未来）
  icon: string; // lucide 图标名（存字符串，未来自建可选图标）
  enabled: boolean;
  order: number;
  // 未来：promptTemplate?: string —— 自建按钮发给 AI 的提示词模板
}

export const BUILTIN_SELECTION_ACTIONS: SelectionAction[] = [
  { id: "explain", source: "builtin", kind: "explain", labelKey: "selection.explain", icon: "BookOpen", enabled: true, order: 1 },
  { id: "translate", source: "builtin", kind: "translate", labelKey: "selection.translate", icon: "Languages", enabled: true, order: 2 },
  { id: "summarize", source: "builtin", kind: "summarize", labelKey: "selection.summarize", icon: "AlignLeft", enabled: true, order: 3 },
  { id: "copy", source: "builtin", kind: "copy", labelKey: "selection.copy", icon: "Copy", enabled: true, order: 4 },
];

/** 按字符串名取 lucide 组件（为未来自建按钮选图标铺路） */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  Languages,
  AlignLeft,
  Copy,
};

/** 取启用的动作，按 order 升序 */
export function enabledActions(actions: SelectionAction[]): SelectionAction[] {
  return actions.filter((a) => a.enabled).sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/state/selectionActions.test.ts`
Expected: PASS（3 个 it 全过）。

- [ ] **Step 5: 提交**

```bash
git add src/state/selectionActions.ts src/state/selectionActions.test.ts
git commit -m "feat: 划词动作数据模型与内置按钮常量"
```

---

### Task 2: `Hotkeys` 增 `selectionToolbar`（默认 Alt+Q）

**Files:**
- Modify: `src/state/types.ts:16-19`
- Modify: `src/state/defaults.ts:14`（`DEFAULT_SETTINGS.hotkeys`）、`src/state/defaults.ts:33-36`（`mergeSettings` 的 hotkeys）
- Test: `src/state/defaults.test.ts`（已存在，追加用例）

- [ ] **Step 1: 写失败测试（追加到 `src/state/defaults.test.ts`）**

在 `describe("DEFAULT_SETTINGS", ...)` 内、`it("default hotkeys", ...)` 之后追加断言（把该 it 替换为下方版本）：

```ts
  it("default hotkeys", () => {
    expect(DEFAULT_SETTINGS.hotkeys.quickAsk).toBe("Shift+Z");
    expect(DEFAULT_SETTINGS.hotkeys.showMain).toBe("CommandOrControl+Alt+Space");
    expect(DEFAULT_SETTINGS.hotkeys.selectionToolbar).toBe("Alt+Q");
  });
```

在 `describe("mergeSettings", ...)` 内追加：

```ts
  it("fills missing selectionToolbar hotkey from defaults", () => {
    expect(mergeSettings({}).hotkeys.selectionToolbar).toBe("Alt+Q");
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/state/defaults.test.ts`
Expected: FAIL — `DEFAULT_SETTINGS.hotkeys.selectionToolbar` 为 `undefined`，且类型错误（`Hotkeys` 无该字段）。

- [ ] **Step 3: 写实现**

`src/state/types.ts` 把 `Hotkeys` 改为：

```ts
export interface Hotkeys {
  quickAsk: string;
  showMain: string;
  selectionToolbar: string;
}
```

`src/state/defaults.ts` 把 `DEFAULT_SETTINGS.hotkeys`（第 14 行）改为：

```ts
  hotkeys: { quickAsk: "Shift+Z", showMain: "CommandOrControl+Alt+Space", selectionToolbar: "Alt+Q" },
```

`src/state/defaults.ts` 把 `mergeSettings` 里的 hotkeys 块改为：

```ts
    hotkeys: {
      quickAsk: stored.hotkeys?.quickAsk ?? base.hotkeys.quickAsk,
      showMain: stored.hotkeys?.showMain ?? base.hotkeys.showMain,
      selectionToolbar: stored.hotkeys?.selectionToolbar ?? base.hotkeys.selectionToolbar,
    },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/state/defaults.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/types.ts src/state/defaults.ts src/state/defaults.test.ts
git commit -m "feat: 设置增划词工具条快捷键，默认 Alt+Q"
```

---

### Task 3: 三键冲突检测 `hasAnyConflict`

**Files:**
- Modify: `src/lib/hotkeys.ts`（在末尾追加，保留现有 `hasConflict`）
- Test: `src/lib/hotkeys.test.ts`（已存在，追加用例）

- [ ] **Step 1: 写失败测试（追加到 `src/lib/hotkeys.test.ts`）**

把 import 行改为同时引入 `hasAnyConflict`：

```ts
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasConflict, hasAnyConflict } from "./hotkeys";
```

文件末尾追加：

```ts
describe("hasAnyConflict", () => {
  it("detects a duplicate among three accelerators", () => {
    expect(hasAnyConflict(["Alt+Q", "Shift+Z", "Alt+Q"])).toBe(true);
    expect(hasAnyConflict(["Alt+Q", "Shift+Z", "CommandOrControl+Space"])).toBe(false);
  });
  it("ignores empty strings", () => {
    expect(hasAnyConflict(["", "", "Alt+Q"])).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/lib/hotkeys.test.ts`
Expected: FAIL — `hasAnyConflict` 未导出。

- [ ] **Step 3: 写实现（在 `src/lib/hotkeys.ts` 末尾追加）**

```ts
/** 列表中是否存在重复的有效加速器（任意两个相同即冲突）。空串忽略。 */
export function hasAnyConflict(accelerators: string[]): boolean {
  const seen = new Set<string>();
  for (const acc of accelerators) {
    if (!acc) continue;
    if (seen.has(acc)) return true;
    seen.add(acc);
  }
  return false;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/lib/hotkeys.test.ts`
Expected: PASS（含原有 `hasConflict` 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/hotkeys.ts src/lib/hotkeys.test.ts
git commit -m "feat: 新增多键冲突检测 hasAnyConflict"
```

---

### Task 4: i18n 文案

**Files:**
- Modify: `src/i18n/zh-CN.ts`（在末尾 `}` 前追加键）

- [ ] **Step 1: 写实现**

在 `src/i18n/zh-CN.ts` 的 `"quickAsk.selectAi": "选择 AI",` 行之后、结尾 `};` 之前追加：

```ts
  "hotkeys.selectionToolbar": "划词工具条",
  "selection.explain": "解释",
  "selection.translate": "翻译",
  "selection.summarize": "总结",
  "selection.copy": "复制",
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 通过（无新增类型错误）。

- [ ] **Step 3: 提交**

```bash
git add src/i18n/zh-CN.ts
git commit -m "feat: 划词工具条 i18n 文案"
```

---

## Phase B — Rust 后端

### Task 5: 新增依赖与剪贴板插件

**Files:**
- Modify: `src-tauri/Cargo.toml`（`[dependencies]` 末尾追加）
- Modify: `src-tauri/src/lib.rs:17-19`（插件注册）

- [ ] **Step 1: 加依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 段末尾（`uuid` 行之后）追加：

```toml
get-selected-text = "0.1.6"
mouse_position = "0.1.4"
tauri-plugin-clipboard-manager = "2"
```

- [ ] **Step 2: 注册剪贴板插件**

在 `src-tauri/src/lib.rs` 的插件链里，`.plugin(tauri_plugin_global_shortcut::Builder::new().build())` 之后追加一行：

```rust
        .plugin(tauri_plugin_clipboard_manager::init())
```

- [ ] **Step 3: 构建验证（会下载并编译新 crate，耗时较长）**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功（`get-selected-text`/`mouse_position` 暂未使用，不报错）。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "build: 加入 get-selected-text/mouse_position/clipboard-manager 依赖"
```

---

### Task 6: `AppState` 增 `pending_selection`

**Files:**
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: 写实现**

在 `src-tauri/src/state.rs` 文件末尾追加结构体：

```rust
/// 划词捕获的待显示状态（运行时，不持久化）。
/// `x`/`y` 为鼠标物理像素锚点；`show` 由 trigger 置真、由 place_and_show 消费。
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct PendingSelection {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub show: bool,
}
```

在 `AppState` 结构体内（`ai_webview_urls` 字段之后）追加字段：

```rust
    /// 划词工具条待显示状态：trigger 写入，前端 get_pending / place_and_show 读消费。
    pub pending_selection: Mutex<PendingSelection>,
```

（`AppState` 仍用 `#[derive(Default)]`：`Mutex<PendingSelection>` 默认即 `Mutex::new(PendingSelection::default())`，无需手写。）

- [ ] **Step 2: 构建验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/state.rs
git commit -m "feat: AppState 增 pending_selection 状态"
```

---

### Task 7: 防溢出钳制纯函数 + 模块骨架

**Files:**
- Create: `src-tauri/src/selection_toolbar.rs`
- Modify: `src-tauri/src/lib.rs`（模块声明）

- [ ] **Step 1: 写失败测试 + 纯函数（建文件）**

`src-tauri/src/selection_toolbar.rs`（本步只放钳制纯函数与测试，其余在 Task 8 补全）：

```rust
/// 显示器矩形（物理像素），用于纯函数钳制。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MonitorRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

/// 把锚点 + 尺寸钳制进显示器边界，返回工具条左上角坐标（物理像素）。
/// 防溢出：右/下越界则贴边，且不小于显示器左/上边界。
fn clamp_to_monitor(anchor_x: i32, anchor_y: i32, w: i32, h: i32, mon: MonitorRect) -> (i32, i32) {
    let max_x = (mon.x + mon.w - w).max(mon.x);
    let max_y = (mon.y + mon.h - h).max(mon.y);
    let x = anchor_x.clamp(mon.x, max_x);
    let y = anchor_y.clamp(mon.y, max_y);
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: MonitorRect = MonitorRect { x: 0, y: 0, w: 1920, h: 1080 };

    #[test]
    fn no_overflow_returns_anchor() {
        assert_eq!(clamp_to_monitor(100, 200, 300, 44, MON), (100, 200));
    }

    #[test]
    fn right_overflow_sticks_to_right() {
        assert_eq!(clamp_to_monitor(1900, 200, 300, 44, MON), (1620, 200));
    }

    #[test]
    fn bottom_overflow_sticks_to_bottom() {
        assert_eq!(clamp_to_monitor(100, 1070, 300, 44, MON), (100, 1036));
    }

    #[test]
    fn both_overflow_sticks_to_corner() {
        assert_eq!(clamp_to_monitor(1900, 1070, 300, 44, MON), (1620, 1036));
    }

    #[test]
    fn second_monitor_offset_is_respected() {
        let m = MonitorRect { x: 1920, y: 0, w: 1920, h: 1080 };
        assert_eq!(clamp_to_monitor(3800, 100, 300, 44, m), (3540, 100));
        assert_eq!(clamp_to_monitor(1950, 100, 300, 44, m), (1950, 100));
    }
}
```

在 `src-tauri/src/lib.rs` 模块声明区，`mod quick_ask;` 之后追加：

```rust
mod selection_toolbar;
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml clamp_to_monitor`
（`cargo test` 编译 test cfg，`clamp_to_monitor` 被测试引用，不报未使用。）
Expected: 5 个测试 PASS。

> 注：此时 `cargo build`（非 test）会对 `clamp_to_monitor`/`MonitorRect` 报 `dead_code` 警告，Task 8 引用后消除——预期内。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/selection_toolbar.rs src-tauri/src/lib.rs
git commit -m "feat: 划词工具条防溢出钳制纯函数 + 单测"
```

---

### Task 8: `selection_toolbar` 模块主体（捕获/窗口/定位/隐藏/复制/读状态）

**Files:**
- Modify: `src-tauri/src/selection_toolbar.rs`（在钳制函数之上补全）

- [ ] **Step 1: 写实现**

在 `src-tauri/src/selection_toolbar.rs` **文件顶部**（`MonitorRect` 之前）插入 import 与常量：

```rust
use std::time::Duration;

use mouse_position::mouse_position::Mouse;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::state::AppState;

const LABEL: &str = "selection-toolbar";
const SHOW_EVENT: &str = "selection-toolbar:show";
const INIT_W: f64 = 320.0;
const INIT_H: f64 = 44.0;
```

在 `MonitorRect` 定义与 `clamp_to_monitor` 之间（或紧随 `clamp_to_monitor` 之后、`#[cfg(test)]` 之前）追加以下函数：

```rust
/// 全局快捷键入口（在按键 Released 时调用）：捕获选中文本与鼠标坐标，弹出工具条。
pub fn trigger(app: &AppHandle) {
    // 让按键状态沉降：划词热键含修饰键，get-selected-text 在 Windows 合成 Ctrl+C 取值，
    // 修饰键仍按住时取值会冲突。Released + settle 是 spike 验证过的可靠时机。
    std::thread::sleep(Duration::from_millis(20));

    let text = capture_selected_text();

    let (x, y) = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x, y),
        Mouse::Error => {
            println!("[selection] mouse position unavailable, abort");
            return;
        }
    };
    println!("[selection] captured: {text:?} @ ({x},{y})");

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_selection.lock().unwrap();
        pending.text = text;
        pending.x = x;
        pending.y = y;
        pending.show = true;
    }

    if let Err(e) = ensure_window(app) {
        eprintln!("[selection] ensure_window failed: {e}");
        return;
    }
    // 窗口已存在：事件唤醒前端读 pending；首次创建：前端挂载走 get_pending 兜底
    let _ = app.emit_to(LABEL, SHOW_EVENT, ());
}

/// 取选中文本，最多 3 次重试（镜像 spike）。全部失败返回空串。
fn capture_selected_text() -> String {
    for attempt in 1..=3 {
        match get_selected_text::get_selected_text() {
            Ok(text) => return text,
            Err(error) => {
                println!("[selection] get-selected-text error attempt {attempt}: {error:?}");
                std::thread::sleep(Duration::from_millis(120 * attempt));
            }
        }
    }
    String::new()
}

/// 确保工具条窗口存在；缺则隐身创建（透明无边框、置顶、跳过任务栏）。
fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_window(LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("划词工具条")
        .inner_size(INIT_W, INIT_H)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(false)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 定位（防溢出）并显示。仅接收前端测得的逻辑尺寸；锚点从 pending 读。
pub fn place_and_show(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let win = app.get_window(LABEL).ok_or("toolbar window not found")?;
    let (anchor_x, anchor_y) = {
        let state = app.state::<AppState>();
        let pending = state.pending_selection.lock().unwrap();
        (pending.x, pending.y)
    };

    let monitor = monitor_for_point(&win, anchor_x, anchor_y)
        .or_else(|| win.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    let mon = MonitorRect {
        x: pos.x,
        y: pos.y,
        w: size.width as i32,
        h: size.height as i32,
    };
    let phys_w = ((width * scale).round() as i32).max(1);
    let phys_h = ((height * scale).round() as i32).max(1);
    let (x, y) = clamp_to_monitor(anchor_x, anchor_y, phys_w, phys_h, mon);

    win.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    let _ = win.set_focus();

    // 唯一汇聚点：消费 show（保留 text/x/y 供按钮动作与下次定位）
    app.state::<AppState>().pending_selection.lock().unwrap().show = false;
    Ok(())
}

/// 找到包含指定物理坐标点的显示器。
fn monitor_for_point(win: &tauri::Window, x: i32, y: i32) -> Option<tauri::Monitor> {
    let monitors = win.available_monitors().ok()?;
    monitors.into_iter().find(|m| {
        let p = m.position();
        let s = m.size();
        x >= p.x && x < p.x + s.width as i32 && y >= p.y && y < p.y + s.height as i32
    })
}

/// 隐藏工具条（失焦 / 点按钮后调用，不销毁，供复用）。
pub fn hide(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_window(LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 把捕获到的文本写入剪贴板（复制按钮）。
pub fn copy_selection(app: &AppHandle) -> Result<(), String> {
    let text = app
        .state::<AppState>()
        .pending_selection
        .lock()
        .unwrap()
        .text
        .clone();
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// 读取待显示状态（首帧兜底 / 事件后读 text）。只读不清。
pub fn get_pending(app: &AppHandle) -> crate::state::PendingSelection {
    app.state::<AppState>().pending_selection.lock().unwrap().clone()
}
```

- [ ] **Step 2: 构建验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功。可能仍有 `trigger`/`place_and_show` 等 `dead_code` 警告（Task 9–11 接线后消除），无错误即可。

- [ ] **Step 3: 钳制测试仍通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml clamp_to_monitor`
Expected: 5 个测试 PASS。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/selection_toolbar.rs
git commit -m "feat: 划词工具条捕获/窗口/定位/复制 模块主体"
```

---

### Task 9: 抽出 `quick_ask::show`（供「打开 quick-ask」复用）

**Files:**
- Modify: `src-tauri/src/quick_ask.rs`（`toggle` 末尾的创建块抽成 `create`，新增 `show`）

- [ ] **Step 1: 写实现**

在 `src-tauri/src/quick_ask.rs` 中，把 `toggle()` 函数**末尾的创建块**（从注释 `// 首次创建：根 webview = 本地壳…` 起，到该函数结束的 `set_focused(app, true);` 与右花括号）替换为对 `create` 的调用：

把这段：

```rust
    // 首次创建：根 webview = 本地壳（渲染顶栏），AI 站点作为子 webview 叠在顶栏下方
    let url = target_url(app);
    let Ok(parsed) = url.parse::<Url>() else {
        return;
    };
    // visible(false)：先隐身创建，待 center_bottom 定位后再由 raise() 首次 show()，
    // 否则窗口会先以默认位置（屏幕左上）露一帧再跳到中下部，形成虚影。
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("快捷提问")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .always_on_top(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build();
    if built.is_err() {
        return;
    }

    // 取底层 Window 以挂子 webview（固定尺寸窗口，不用 auto_resize，避免覆盖顶栏）
    let Some(window) = app.get_window(LABEL) else {
        return;
    };
    let child = WebviewBuilder::new(AI_LABEL, WebviewUrl::External(parsed)).focused(true);
    let _ = window.add_child(
        child,
        LogicalPosition::new(0.0, TOPBAR_HEIGHT),
        LogicalSize::new(WIDTH, HEIGHT - TOPBAR_HEIGHT),
    );

    cancel_pending_reset(app);
    center_bottom(&window);
    raise(&window, pinned);
    set_focused(app, true);
}
```

替换为：

```rust
    // 首次创建
    create(app);
}

/// 首次创建快捷提问窗（本地壳 + 顶栏下方 AI 子 webview），定位后抬到最前。
fn create(app: &AppHandle) {
    let pinned = *app.state::<AppState>().quick_ask_pinned.lock().unwrap();
    let url = target_url(app);
    let Ok(parsed) = url.parse::<Url>() else {
        return;
    };
    // visible(false)：先隐身创建，待 center_bottom 定位后再由 raise() 首次 show()，
    // 否则窗口会先以默认位置（屏幕左上）露一帧再跳到中下部，形成虚影。
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("快捷提问")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .always_on_top(false)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build();
    if built.is_err() {
        return;
    }

    let Some(window) = app.get_window(LABEL) else {
        return;
    };
    let child = WebviewBuilder::new(AI_LABEL, WebviewUrl::External(parsed)).focused(true);
    let _ = window.add_child(
        child,
        LogicalPosition::new(0.0, TOPBAR_HEIGHT),
        LogicalSize::new(WIDTH, HEIGHT - TOPBAR_HEIGHT),
    );

    cancel_pending_reset(app);
    center_bottom(&window);
    raise(&window, pinned);
    set_focused(app, true);
}

/// 显示快捷提问窗（划词「打开 quick-ask」用）：缺则创建，存在则抬前并显示 AI 子 webview。
/// 区别于 toggle：无条件显示，不会在可见时隐藏。
pub fn show(app: &AppHandle) {
    let pinned = *app.state::<AppState>().quick_ask_pinned.lock().unwrap();
    match app.get_window(LABEL) {
        Some(win) => {
            cancel_pending_reset(app);
            raise(&win, pinned);
            set_focused(app, true);
            if let Some(wv) = app.get_webview(AI_LABEL) {
                let _ = wv.show();
            }
        }
        None => create(app),
    }
}
```

（`toggle` 顶部原有的 `let pinned = …` 仍被其可见分支使用，保持不变。）

- [ ] **Step 2: 构建验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功。

- [ ] **Step 3: 现有 quick_ask 测试仍通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml quick_ask`
Expected: 原有 `reset_delay` / `visible_toggle_action` 等测试全 PASS。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/quick_ask.rs
git commit -m "refactor: 抽出 quick_ask::create 并新增无条件 show 入口"
```

---

### Task 10: 快捷键注册（划词键走 Released）

**Files:**
- Modify: `src-tauri/src/shortcuts.rs`
- Modify: `src-tauri/src/settings_io.rs`（`Hotkeys` 增字段 + 默认）

- [ ] **Step 1: settings_io 增字段**

在 `src-tauri/src/settings_io.rs` 顶部常量区追加：

```rust
const DEFAULT_SELECTION_TOOLBAR: &str = "Alt+Q";
```

在该文件 `fn default_show_main() ...` 附近追加：

```rust
fn default_selection_toolbar() -> String { DEFAULT_SELECTION_TOOLBAR.into() }
```

把 `Hotkeys` 结构体与其 `Default` 改为：

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct Hotkeys {
    #[serde(rename = "quickAsk", default = "default_quick_ask")]
    pub quick_ask: String,
    #[serde(rename = "showMain", default = "default_show_main")]
    pub show_main: String,
    #[serde(rename = "selectionToolbar", default = "default_selection_toolbar")]
    pub selection_toolbar: String,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            quick_ask: default_quick_ask(),
            show_main: default_show_main(),
            selection_toolbar: default_selection_toolbar(),
        }
    }
}
```

- [ ] **Step 2: shortcuts 增 Released 注册 + 汇报字段**

把 `src-tauri/src/shortcuts.rs` 整体改为：

```rust
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::quick_ask;
use crate::settings_io::read_settings;

/// 每个快捷键的注册结果，回传前端用于显示冲突/失败
#[derive(Debug, Clone, Serialize)]
pub struct HotkeyRegistration {
    #[serde(rename = "quickAsk")]
    pub quick_ask: bool,
    #[serde(rename = "showMain")]
    pub show_main: bool,
    #[serde(rename = "selectionToolbar")]
    pub selection_toolbar: bool,
}

/// 注销全部并按当前设置重新注册；返回每个键是否注册成功
pub fn register_from_settings(app: &AppHandle) -> HotkeyRegistration {
    let _ = app.global_shortcut().unregister_all();
    let s = read_settings(app);
    HotkeyRegistration {
        quick_ask: register_one(app, &s.hotkeys.quick_ask, quick_ask::toggle),
        show_main: register_one(app, &s.hotkeys.show_main, crate::tray::show_main),
        // 划词键走 Released：含修饰键时 Released + settle 取选区才可靠（见模块注释）
        selection_toolbar: register_state(
            app,
            &s.hotkeys.selection_toolbar,
            ShortcutState::Released,
            crate::selection_toolbar::trigger,
        ),
    }
}

/// 注册单个快捷键（Pressed 触发）；解析失败或注册失败返回 false
fn register_one(app: &AppHandle, accelerator: &str, action: fn(&AppHandle)) -> bool {
    register_state(app, accelerator, ShortcutState::Pressed, action)
}

/// 注册单个快捷键，可指定在 Pressed 还是 Released 时触发动作。
fn register_state(
    app: &AppHandle,
    accelerator: &str,
    state: ShortcutState,
    action: fn(&AppHandle),
) -> bool {
    let Ok(shortcut) = accelerator.parse::<Shortcut>() else { return false };
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _sc, event| {
            if event.state == state {
                action(app);
            }
        })
        .is_ok()
}
```

- [ ] **Step 3: 构建验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功（`selection_toolbar::trigger` 现已被引用，相关 `dead_code` 警告减少）。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/shortcuts.rs src-tauri/src/settings_io.rs
git commit -m "feat: 注册划词快捷键(Released)并汇报注册结果"
```

---

### Task 11: 命令封装 + invoke_handler + capability

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`（invoke_handler）
- Create: `src-tauri/capabilities/selection-toolbar.json`

- [ ] **Step 1: 命令封装**

在 `src-tauri/src/commands.rs` 顶部的 `use crate::quick_ask;` 之后追加：

```rust
use crate::selection_toolbar;
```

在该文件 `quick_ask_new_chat` 命令之后追加：

```rust
#[tauri::command]
pub fn place_and_show_selection_toolbar(
    app: AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    selection_toolbar::place_and_show(&app, width, height)
}

#[tauri::command]
pub fn hide_selection_toolbar(app: AppHandle) -> Result<(), String> {
    selection_toolbar::hide(&app)
}

#[tauri::command]
pub fn get_pending_selection_show(app: AppHandle) -> crate::state::PendingSelection {
    selection_toolbar::get_pending(&app)
}

#[tauri::command]
pub fn copy_selection(app: AppHandle) -> Result<(), String> {
    selection_toolbar::copy_selection(&app)
}

#[tauri::command]
pub fn show_quick_ask(app: AppHandle) {
    quick_ask::show(&app);
}
```

- [ ] **Step 2: 注册到 invoke_handler**

在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![…]` 列表里，`commands::quick_ask_new_chat,` 之后追加：

```rust
            commands::place_and_show_selection_toolbar,
            commands::hide_selection_toolbar,
            commands::get_pending_selection_show,
            commands::copy_selection,
            commands::show_quick_ask,
```

- [ ] **Step 3: 建 capability 文件**

`src-tauri/capabilities/selection-toolbar.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "selection-toolbar",
  "description": "Capability for the selection toolbar window",
  "windows": ["selection-toolbar"],
  "permissions": ["core:default", "store:default"]
}
```

- [ ] **Step 4: 构建验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功，无 `dead_code` 警告（所有模块函数已接线）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/capabilities/selection-toolbar.json
git commit -m "feat: 划词工具条命令封装、注册与窗口 capability"
```

---

## Phase C — 前端接线与界面

### Task 12: 前端命令封装 + `HotkeyRegistration` 增字段

**Files:**
- Modify: `src/lib/commands.ts`

- [ ] **Step 1: 写实现**

在 `src/lib/commands.ts` 的 `HotkeyRegistration` 接口里增字段：

```ts
export interface HotkeyRegistration {
  quickAsk: boolean;
  showMain: boolean;
  selectionToolbar: boolean;
}
```

在该文件末尾追加：

```ts
/** 划词捕获的待显示状态（与 Rust PendingSelection 对应） */
export interface PendingSelection {
  text: string;
  x: number;
  y: number;
  show: boolean;
}

/** 定位（防溢出）并显示划词工具条；传前端测得的逻辑尺寸 */
export async function placeAndShowSelectionToolbar(width: number, height: number): Promise<void> {
  await invoke("place_and_show_selection_toolbar", { width, height });
}

/** 隐藏划词工具条 */
export async function hideSelectionToolbar(): Promise<void> {
  await invoke("hide_selection_toolbar");
}

/** 读取划词待显示状态（首帧兜底 / 事件后读 text） */
export async function getPendingSelectionShow(): Promise<PendingSelection> {
  return await invoke<PendingSelection>("get_pending_selection_show");
}

/** 复制：把捕获文本写入剪贴板 */
export async function copySelection(): Promise<void> {
  await invoke("copy_selection");
}

/** 打开快捷提问窗口（划词「解释/翻译/总结」用，无条件显示） */
export async function showQuickAsk(): Promise<void> {
  await invoke("show_quick_ask");
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 通过。

- [ ] **Step 3: 提交**

```bash
git add src/lib/commands.ts
git commit -m "feat: 前端划词命令封装与 HotkeyRegistration 字段"
```

---

### Task 13: `SelectionToolbar` 组件

**Files:**
- Create: `src/pages/selection-toolbar/SelectionToolbar.tsx`
- Test: `src/pages/selection-toolbar/SelectionToolbar.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/pages/selection-toolbar/SelectionToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const placeAndShowSelectionToolbar = vi.fn().mockResolvedValue(undefined);
const hideSelectionToolbar = vi.fn().mockResolvedValue(undefined);
const getPendingSelectionShow = vi.fn().mockResolvedValue({ text: "", x: 0, y: 0, show: false });
const copySelection = vi.fn().mockResolvedValue(undefined);
const showQuickAsk = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  placeAndShowSelectionToolbar: (w: number, h: number) => placeAndShowSelectionToolbar(w, h),
  hideSelectionToolbar: () => hideSelectionToolbar(),
  getPendingSelectionShow: () => getPendingSelectionShow(),
  copySelection: () => copySelection(),
  showQuickAsk: () => showQuickAsk(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: () => Promise.resolve(() => {}) }),
}));

import { I18nProvider } from "../../i18n";
import { SelectionToolbar } from "./SelectionToolbar";

function setup() {
  return render(
    <I18nProvider>
      <SelectionToolbar />
    </I18nProvider>
  );
}

beforeEach(() => {
  for (const m of [placeAndShowSelectionToolbar, hideSelectionToolbar, copySelection, showQuickAsk]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
  getPendingSelectionShow.mockReset().mockResolvedValue({ text: "", x: 0, y: 0, show: false });
});

describe("SelectionToolbar", () => {
  it("renders the four builtin buttons", () => {
    setup();
    for (const name of ["解释", "翻译", "总结", "复制"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("copy button copies then hides", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "复制" }));
    expect(copySelection).toHaveBeenCalled();
    expect(hideSelectionToolbar).toHaveBeenCalled();
    expect(showQuickAsk).not.toHaveBeenCalled();
  });

  it("explain button opens quick-ask then hides", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "解释" }));
    expect(showQuickAsk).toHaveBeenCalled();
    expect(hideSelectionToolbar).toHaveBeenCalled();
    expect(copySelection).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/pages/selection-toolbar/SelectionToolbar.test.tsx`
Expected: FAIL — 无法解析 `./SelectionToolbar`。

- [ ] **Step 3: 写实现**

`src/pages/selection-toolbar/SelectionToolbar.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../../i18n";
import {
  BUILTIN_SELECTION_ACTIONS,
  ICON_REGISTRY,
  enabledActions,
  type SelectionAction,
} from "../../state/selectionActions";
import {
  placeAndShowSelectionToolbar,
  hideSelectionToolbar,
  getPendingSelectionShow,
  copySelection,
  showQuickAsk,
} from "../../lib/commands";

const SHOW_EVENT = "selection-toolbar:show";

/** 工具条按钮：图标 + 标签；hover 反白（同 QuickAskBar 观感） */
function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 28,
        padding: "0 8px",
        border: "none",
        borderRadius: 6,
        background: hover ? "var(--bg-elev)" : "transparent",
        color: hover ? "var(--fg)" : "var(--fg-muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function SelectionToolbar() {
  const t = useT();
  const outerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<string>("");
  const actions = enabledActions(BUILTIN_SELECTION_ACTIONS);

  // 测量药丸真实尺寸 → 请求 Rust 定位并显示
  const requestShow = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    void placeAndShowSelectionToolbar(r.width, r.height);
  }, []);

  // 首帧兜底：窗口首次创建时事件已丢，挂载时主动读 pending
  useEffect(() => {
    void getPendingSelectionShow().then((p) => {
      if (p.show) {
        textRef.current = p.text;
        requestShow();
      }
    });
  }, [requestShow]);

  // 后续触发：事件唤醒 → 读最新 text → 显示
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen(SHOW_EVENT, () => {
      void getPendingSelectionShow().then((p) => {
        textRef.current = p.text;
        requestShow();
      });
    }).then((un) => {
      unlisten = un;
    });
    return () => unlisten?.();
  }, [requestShow]);

  // 失焦注销：点击工具条以外区域 → 窗口失焦 → 隐藏
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) void hideSelectionToolbar();
      })
      .then((un) => {
        unlisten = un;
      });
    return () => unlisten?.();
  }, []);

  const runAction = useCallback((action: SelectionAction) => {
    if (action.kind === "copy") {
      void copySelection();
    } else {
      // 三个非复制按钮本期一致：打印捕获文本（备份观察）+ 打开快捷提问
      console.log("[selection]", action.kind, textRef.current);
      void showQuickAsk();
    }
    void hideSelectionToolbar();
  }, []);

  return (
    <div style={{ display: "inline-flex", padding: 4 /* 阴影留白 */ }}>
      <div
        ref={outerRef}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          height: 36,
          padding: "0 4px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          whiteSpace: "nowrap",
        }}
      >
        {actions.map((a) => {
          const Icon = ICON_REGISTRY[a.icon];
          const label = a.labelKey ? t(a.labelKey) : a.label ?? "";
          return (
            <ToolbarButton key={a.id} label={label} onClick={() => runAction(a)}>
              {Icon ? <Icon size={16} /> : null}
              <span style={{ fontSize: 13 }}>{label}</span>
            </ToolbarButton>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/pages/selection-toolbar/SelectionToolbar.test.tsx`
Expected: PASS（3 个 it）。

- [ ] **Step 5: 提交**

```bash
git add src/pages/selection-toolbar/SelectionToolbar.tsx src/pages/selection-toolbar/SelectionToolbar.test.tsx
git commit -m "feat: SelectionToolbar 组件（数据驱动渲染 + 动作派发）"
```

---

### Task 14: `SelectionToolbarShell` + `main.tsx` 分流

**Files:**
- Create: `src/pages/selection-toolbar/SelectionToolbarShell.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: 写 Shell**

`src/pages/selection-toolbar/SelectionToolbarShell.tsx`:

```tsx
import { useEffect } from "react";
import { I18nProvider } from "../../i18n";
import { SettingsProvider, useSettings } from "../../state/SettingsContext";
import { resolveTheme, applyTheme, watchSystemTheme, systemPrefersDark } from "../../lib/theme";
import { SelectionToolbar } from "./SelectionToolbar";

/** 应用主题（同 QuickAskShell：启动 + 主题变化 + 跟随系统） */
function ThemedToolbar() {
  const { settings } = useSettings();
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme, systemPrefersDark()));
    apply();
    return watchSystemTheme(() => {
      if (settings.theme === "system") apply();
    });
  }, [settings.theme]);
  return <SelectionToolbar />;
}

/** 划词工具条窗口的本地壳：透明窗口只显示药丸本体 */
export function SelectionToolbarShell() {
  useEffect(() => {
    // 覆盖 global.css 的 body 背景，让透明窗口只露出药丸
    document.body.style.background = "transparent";
  }, []);
  return (
    <I18nProvider>
      <SettingsProvider>
        <ThemedToolbar />
      </SettingsProvider>
    </I18nProvider>
  );
}
```

- [ ] **Step 2: main.tsx 三路分流**

把 `src/main.tsx` 改为：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./styles/global.css";
import { SettingsProvider } from "./state/SettingsContext";
import { I18nProvider } from "./i18n";
import { QuickAskShell } from "./pages/quick-ask/QuickAskShell";
import { SelectionToolbarShell } from "./pages/selection-toolbar/SelectionToolbarShell";

// 主窗口 / 快捷提问窗 / 划词工具条窗共用 index.html，按窗口标签分流渲染不同的壳
const label = getCurrentWindow().label;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {label === "quick-ask" ? (
      <QuickAskShell />
    ) : label === "selection-toolbar" ? (
      <SelectionToolbarShell />
    ) : (
      <I18nProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </I18nProvider>
    )}
  </React.StrictMode>
);
```

- [ ] **Step 3: 类型检查 + 全部前端测试**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 类型通过；所有测试 PASS（含既有 QuickAskBar/HotkeySettings 等）。

- [ ] **Step 4: 提交**

```bash
git add src/pages/selection-toolbar/SelectionToolbarShell.tsx src/main.tsx
git commit -m "feat: 划词工具条壳与 main.tsx 三路窗口分流"
```

---

### Task 15: 快捷键设置页增「划词工具条」行

**Files:**
- Modify: `src/pages/settings/HotkeySettings.tsx`
- Modify: `src/pages/settings/HotkeySettings.test.tsx`（已存在，更新 mock + 追加用例）

- [ ] **Step 1: 写失败测试**

把 `src/pages/settings/HotkeySettings.test.tsx` 的 applyHotkeys mock 改为含新字段：

```ts
const applyHotkeys = vi.fn().mockResolvedValue({ quickAsk: true, showMain: true, selectionToolbar: true });
```

在 `describe("HotkeySettings", ...)` 内追加用例：

```ts
  it("shows the selection-toolbar row with its default hotkey", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("划词工具条")).toBeInTheDocument());
    expect(screen.getByText("Alt + Q")).toBeInTheDocument();
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/pages/settings/HotkeySettings.test.tsx`
Expected: FAIL — 找不到「划词工具条」行。

- [ ] **Step 3: 写实现**

在 `src/pages/settings/HotkeySettings.tsx`：

把 import 行改为同时引入 `hasAnyConflict`：

```ts
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasAnyConflict } from "../../lib/hotkeys";
```

把 `ROWS` 改为：

```ts
const ROWS: { name: HotkeyName; labelKey: string }[] = [
  { name: "quickAsk", labelKey: "hotkeys.quickAsk" },
  { name: "showMain", labelKey: "hotkeys.showMain" },
  { name: "selectionToolbar", labelKey: "hotkeys.selectionToolbar" },
];
```

把 conflict 计算行改为：

```ts
  const conflict = hasAnyConflict([
    settings.hotkeys.quickAsk,
    settings.hotkeys.showMain,
    settings.hotkeys.selectionToolbar,
  ]);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/pages/settings/HotkeySettings.test.tsx`
Expected: PASS（含新行用例与既有用例）。

- [ ] **Step 5: 提交**

```bash
git add src/pages/settings/HotkeySettings.tsx src/pages/settings/HotkeySettings.test.tsx
git commit -m "feat: 快捷键设置页增划词工具条行与三键冲突检测"
```

---

## Phase D — 集成与手动验收

### Task 16: 全量构建 + 手动验收

**Files:** 无（验证与文档）

- [ ] **Step 1: 全部前端测试 + 类型检查**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 全 PASS。

- [ ] **Step 2: Rust 全部测试 + 构建**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全 PASS（含 `clamp_to_monitor` 5 项与既有测试）。

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功、无 `dead_code` 警告。

- [ ] **Step 3: 启动应用做手动验收**

Run: `pnpm tauri dev`

逐项核对（dev 终端观察 Rust `println!`）：

1. 在外部 App（如记事本/浏览器）选中一段文本 → 按 `Alt+Q` 松开 → 终端打印 `[selection] captured: "…" @ (x,y)`，工具条在鼠标处弹出。
2. 在屏幕**右边缘**、**下边缘**选词触发 → 工具条不超出屏幕（贴边）。
3. 点击工具条**以外**区域 → 工具条消失；再次 `Alt+Q` → 能再次弹出（复用，无明显延迟）。
4. 点「复制」→ 工具条消失；到任意输入框 `Ctrl+V` → 粘出刚选中的文本。
5. 点「解释」/「翻译」/「总结」→ 终端打印 `[selection] explain|translate|summarize "…"`，快捷提问窗口被打开，工具条消失。
6. 设置 → 快捷键 → 出现「划词工具条」行，显示 `Alt + Q`；录制为其它键（如 `Alt+W`）→ 新键生效、`Alt+Q` 失效；与其它键设为相同 → 出现冲突提示。
7. 切换浅色/深色主题 → 工具条配色随主题变化（透明圆角药丸，无方形窗口边）。
8. 快捷提问、显示主界面等原有快捷键与行为不受影响。

- [ ] **Step 4: 收尾提交（如手动验收中有微调）**

```bash
git add -A
git commit -m "chore: 划词工具条集成验收微调"
```

> 若步骤 7 发现透明窗口在 Windows 上仍有不透明底（WebView2 透明限制），排查项：确认 `SelectionToolbarShell` 的 `document.body.style.background = "transparent"` 生效、窗口 `transparent(true)` 已设、`index.html`/`#root` 无强制背景。此为已知透明窗口注意点，非架构问题。

---

## 完成标准

- `pnpm test`、`pnpm exec tsc --noEmit`、`cargo test`、`cargo build` 全绿。
- 手动验收 1–8 项全部通过。
- 分支 `feature/selection-toolbar` 上每个 Task 一或多个原子提交。

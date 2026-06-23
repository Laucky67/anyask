# 划词工具条 rdev 落地 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 rdev 全局鼠标事件流,在 Rust 层实现"点工具条外部隐藏"与"拖选抬起自动弹出",并删除 `mouse_position` 依赖。

**Architecture:** rdev 钩子线程只缓存坐标 / 发 channel;独立处理线程跑严格门控(命中检测 + 拖选阈值 + generation 失效),通过纯函数判定。工具条不再抢焦点,隐藏由全局点击检测驱动。划词自动弹出受设置开关控制。

**Tech Stack:** Rust / Tauri v2 / rdev 0.5 / get-selected-text(保留)/ React + TypeScript / vitest。

**Spec:** `docs/superpowers/specs/2026-06-22-rdev-selection-toolbar-design.md`

---

## 实现须知(先读)

- **构建命令**:Rust 用 `cargo check --manifest-path src-tauri/Cargo.toml`;测试用 `cargo test --manifest-path src-tauri/Cargo.toml`。前端 `npm test`(= `vitest run`),单文件 `npx vitest run <path>`。
- **中间态警告**:Task 3 加入的纯函数在 Task 8 接线前,非测试构建会有 `dead_code` 警告;Task 8 后清零。警告不阻断构建。
- **后台线程建窗**:`trigger_at → ensure_window` 会从后台线程建窗。现有快捷键路径(`shortcuts.rs` 回调,非主线程)已这样做且可用,故沿用。若手验发现建窗失败,改用 `app.run_on_main_thread`。
- **注释/命名**:沿用仓库中文注释与既有风格(参考 `clamp_to_monitor` / `visible_toggle_action` 的纯函数单测写法)。

---

## Task 1: 加 rdev 依赖,验证与 time=0.3.47 共存

**Files:**
- Modify: `src-tauri/Cargo.toml:33-35`

- [ ] **Step 1: 加依赖(暂留 mouse_position)**

把依赖区改为(在 `mouse_position` 下加一行 `rdev`):

```toml
get-selected-text = "0.1.6"
mouse_position = "0.1.4"
rdev = "0.5"
tauri-plugin-clipboard-manager = "2"
```

- [ ] **Step 2: 验证编译(关键:确认不破坏 time=0.3.47 锁定树)**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 下载 rdev 并编译通过,无 trait coherence / 版本冲突错误。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: 引入 rdev 0.5 全局鼠标事件依赖"
```

---

## Task 2: mouse_hook 模块 — 坐标缓存(纯函数 + 单测)

**Files:**
- Create: `src-tauri/src/mouse_hook.rs`
- Modify: `src-tauri/src/lib.rs:2`(加 `mod mouse_hook;`)

- [ ] **Step 1: 写失败测试 + 模块骨架**

新建 `src-tauri/src/mouse_hook.rs`:

```rust
//! 全局鼠标钩子(rdev):缓存光标坐标、把左键按下/抬起送入处理线程做划词门控。
//! 钩子回调必须极轻——只写原子 / 发 channel,绝不在回调里碰窗口或 get-selected-text。

use std::sync::atomic::{AtomicI32, Ordering};

/// 坐标缓存哨兵:`last_position` 在首个 MouseMove 之前返回 None。
const UNSET: i32 = i32::MIN;

static LAST_X: AtomicI32 = AtomicI32::new(UNSET);
static LAST_Y: AtomicI32 = AtomicI32::new(UNSET);

/// 由缓存的 (x,y) 还原光标位置;任一轴为哨兵视作未知。纯函数,便于单测。
fn decode_position(x: i32, y: i32) -> Option<(i32, i32)> {
    if x == UNSET || y == UNSET {
        None
    } else {
        Some((x, y))
    }
}

/// 最近一次缓存的光标物理坐标;首个 MouseMove 之前为 None。
pub fn last_position() -> Option<(i32, i32)> {
    decode_position(LAST_X.load(Ordering::Relaxed), LAST_Y.load(Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_unset_axis_is_none() {
        assert_eq!(decode_position(UNSET, 10), None);
        assert_eq!(decode_position(10, UNSET), None);
        assert_eq!(decode_position(UNSET, UNSET), None);
    }

    #[test]
    fn decode_real_coords_is_some() {
        assert_eq!(decode_position(0, 0), Some((0, 0)));
        assert_eq!(decode_position(-5, 1280), Some((-5, 1280)));
    }
}
```

在 `src-tauri/src/lib.rs` 的 `mod commands;`(line 2)下加一行:

```rust
mod commands;
mod mouse_hook;
mod provider_utils;
```

- [ ] **Step 2: 运行测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml mouse_hook`
Expected: 2 个测试 PASS(`decode_unset_axis_is_none`、`decode_real_coords_is_some`)。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mouse_hook.rs src-tauri/src/lib.rs
git commit -m "feat: mouse_hook 坐标缓存与 last_position(纯函数 + 单测)"
```

---

## Task 3: mouse_hook — 门控纯函数(point_in_rect / classify_release + 单测)

**Files:**
- Modify: `src-tauri/src/mouse_hook.rs`

- [ ] **Step 1: 加纯函数 + 阈值 + 单测**

在 `mouse_hook.rs` 的 `last_position` 之后、`#[cfg(test)]` 之前插入:

```rust
/// 划词触发阈值(物理像素 / 毫秒)。手动验证时可微调。
const DRAG_DIST_PX: i32 = 6;
const DRAG_MIN_MS: u64 = 80;

/// 工具条物理矩形:(x, y, w, h),左上角 + 宽高。
type Rect = (i32, i32, i32, i32);

/// 点是否落在矩形内(含左/上边,不含右/下边,与显示器命中逻辑一致)。纯函数。
fn point_in_rect(x: i32, y: i32, rect: Rect) -> bool {
    let (rx, ry, rw, rh) = rect;
    x >= rx && x < rx + rw && y >= ry && y < ry + rh
}

/// 左键抬起后的判定结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReleaseAction {
    /// 有效拖选 → 延迟后取词弹窗。
    Trigger,
    /// 普通点击 / 被压制 / 工具条可见 / 开关关闭等 → 不动作。
    Ignore,
}

/// 纯判定:左键抬起是否应触发划词。副作用(消费 suppress、清 press)由调用方处理。
/// - `suppress`:本次抬起被外部点击隐藏压制
/// - `had_press`:存在配对的、在工具条隐藏态记录的按下
/// - `enabled`:划词自动弹出开关
/// - `visible`:工具条当前是否可见
/// - `dist`:按下到抬起的最大轴位移(物理像素)
/// - `dur_ms`:按下到抬起时长(毫秒)
fn classify_release(
    suppress: bool,
    had_press: bool,
    enabled: bool,
    visible: bool,
    dist: i32,
    dur_ms: u64,
) -> ReleaseAction {
    if suppress || !had_press || !enabled || visible {
        return ReleaseAction::Ignore;
    }
    if dist >= DRAG_DIST_PX && dur_ms >= DRAG_MIN_MS {
        ReleaseAction::Trigger
    } else {
        ReleaseAction::Ignore
    }
}
```

在 `mod tests` 内追加:

```rust
    #[test]
    fn point_in_rect_edges() {
        let r = (100, 200, 300, 44); // x:100..400, y:200..244
        assert!(point_in_rect(100, 200, r)); // 左上角(含)
        assert!(point_in_rect(399, 243, r)); // 右下内侧
        assert!(!point_in_rect(400, 220, r)); // 右边界(不含)
        assert!(!point_in_rect(220, 244, r)); // 下边界(不含)
        assert!(!point_in_rect(99, 220, r)); // 左外
        assert!(!point_in_rect(220, 199, r)); // 上外
    }

    #[test]
    fn release_ignored_branches() {
        // suppress / 无 press / 关开关 / 工具条可见,任一成立即 Ignore
        assert_eq!(classify_release(true, true, true, false, 100, 500), ReleaseAction::Ignore);
        assert_eq!(classify_release(false, false, true, false, 100, 500), ReleaseAction::Ignore);
        assert_eq!(classify_release(false, true, false, false, 100, 500), ReleaseAction::Ignore);
        assert_eq!(classify_release(false, true, true, true, 100, 500), ReleaseAction::Ignore);
    }

    #[test]
    fn plain_click_below_thresholds_is_ignored() {
        assert_eq!(classify_release(false, true, true, false, 5, 500), ReleaseAction::Ignore); // 距离不足
        assert_eq!(classify_release(false, true, true, false, 100, 79), ReleaseAction::Ignore); // 时长不足
    }

    #[test]
    fn valid_drag_triggers() {
        assert_eq!(classify_release(false, true, true, false, 6, 80), ReleaseAction::Trigger); // 边界值
        assert_eq!(classify_release(false, true, true, false, 300, 1200), ReleaseAction::Trigger);
    }
```

- [ ] **Step 2: 运行测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml mouse_hook`
Expected: 6 个测试全 PASS(含前两个)。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/mouse_hook.rs
git commit -m "feat: mouse_hook 门控纯函数 point_in_rect/classify_release + 单测"
```

---

## Task 4: AppState 新增 3 字段

**Files:**
- Modify: `src-tauri/src/state.rs:25`(`pending_selection` 之后)

- [ ] **Step 1: 加字段**

在 `pub pending_selection: Mutex<PendingSelection>,` 之后(struct 闭合 `}` 之前)插入:

```rust
    /// 划词工具条当前物理矩形:可见时 Some(x,y,w,h),隐藏时 None。
    /// place_and_show 写入,hide 清空;mouse_hook 处理线程据此做"点外部隐藏"命中检测。
    pub toolbar_rect: Mutex<Option<(i32, i32, i32, i32)>>,
    /// 外部点击隐藏工具条后,压掉配对的那次左键抬起,避免隐藏后立刻又划词弹出。
    pub suppress_next_left_release: AtomicBool,
    /// 划词自动弹出开关(运行态镜像 StoredSettings.selection_auto_popup)。
    /// 注意:AtomicBool::default() 为 false;真值由 setup 读设置后写入(见 lib.rs)。
    pub selection_autopopup_enabled: AtomicBool,
```

> `AtomicBool`、`Mutex` 已在 `state.rs:2-5` 导入,无需新增 use。

- [ ] **Step 2: 验证编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 编译通过(可能有未使用字段相关提示,Task 7/8 接线后消失)。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/state.rs
git commit -m "feat: AppState 增 toolbar_rect / suppress / autopopup 字段"
```

---

## Task 5: settings_io 增 selection_auto_popup(TDD)

**Files:**
- Modify: `src-tauri/src/settings_io.rs`(`StoredSettings` 结构体、`impl Default`、`tests`)

- [ ] **Step 1: 写失败测试**

在 `settings_io.rs` 的 `mod tests` 内追加:

```rust
    #[test]
    fn missing_selection_auto_popup_defaults_to_true() {
        let settings = serde_json::from_value::<StoredSettings>(json!({})).unwrap();
        assert!(settings.selection_auto_popup);
    }
```

- [ ] **Step 2: 运行,确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml missing_selection_auto_popup`
Expected: 编译失败 —— `no field selection_auto_popup on type StoredSettings`。

- [ ] **Step 3: 加字段 + 默认值**

在 `StoredSettings` 的 `pub providers: Vec<ProviderLite>,`(line 91)之后加:

```rust
    #[serde(rename = "selectionAutoPopup", default = "default_true")]
    pub selection_auto_popup: bool,
```

在 `impl Default for StoredSettings` 的 `providers: Vec::new(),`(line 100)之后加:

```rust
            selection_auto_popup: true,
```

> `default_true()` 助手已存在(`settings_io.rs:25`)。

- [ ] **Step 4: 运行,确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings_io`
Expected: 含 `missing_selection_auto_popup_defaults_to_true` 在内全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/settings_io.rs
git commit -m "feat: StoredSettings 增 selectionAutoPopup(默认 true)+ 单测"
```

---

## Task 6: 拆分 trigger,用缓存坐标,删除 mouse_position

**Files:**
- Modify: `src-tauri/src/selection_toolbar.rs:1-67`
- Modify: `src-tauri/Cargo.toml`(删 `mouse_position`)

- [ ] **Step 1: 删 mouse_position 导入,重写 trigger 为 trigger/trigger_at/fallback_anchor**

删除 `selection_toolbar.rs:3` 的 `use mouse_position::mouse_position::Mouse;`。

把 `trigger`(原 line 35-67)整段替换为:

```rust
/// 全局快捷键入口(按键 Released 时调用):用缓存光标坐标作锚点,捕获选区并弹工具条。
pub fn trigger(app: &AppHandle) {
    let (x, y) = crate::mouse_hook::last_position().unwrap_or_else(|| fallback_anchor(app));
    trigger_at(app, x, y);
}

/// 在指定物理锚点弹工具条:捕获选中文本 + 写 pending + 确保窗口 + 通知前端。
/// 快捷键路径用缓存坐标;划词路径用左键抬起坐标(锚点精确,不受延迟期间移动影响)。
pub fn trigger_at(app: &AppHandle, anchor_x: i32, anchor_y: i32) {
    // 让按键状态沉降:划词热键含修饰键,get-selected-text 在 Windows 合成 Ctrl+C 取值,
    // 修饰键仍按住时取值会冲突。Released + settle 是 spike 验证过的可靠时机。
    std::thread::sleep(Duration::from_millis(20));

    let text = capture_selected_text();
    println!("[selection] captured: {text:?} @ ({anchor_x},{anchor_y})");

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_selection.lock().unwrap();
        pending.text = text;
        pending.x = anchor_x;
        pending.y = anchor_y;
        pending.show = true;
    }

    if let Err(e) = ensure_window(app) {
        eprintln!("[selection] ensure_window failed: {e}");
        return;
    }
    // 窗口已存在:事件唤醒前端读 pending;首次创建:前端挂载走 get_pending 兜底
    let _ = app.emit_to(LABEL, SHOW_EVENT, ());
}

/// 缓存坐标不可用(冷启动,首个 MouseMove 之前)时的兜底锚点:主屏左上。
fn fallback_anchor(app: &AppHandle) -> (i32, i32) {
    if let Some(win) = app.get_window("main") {
        if let Ok(Some(m)) = win.primary_monitor() {
            let p = m.position();
            return (p.x, p.y);
        }
    }
    (0, 0)
}
```

在 `Cargo.toml` 删除 `mouse_position = "0.1.4"` 这一行(`mouse_position` 全仓仅此处使用)。

- [ ] **Step 2: 验证编译 + 既有单测**

Run: `cargo test --manifest-path src-tauri/Cargo.toml selection_toolbar`
Expected: 编译通过(无 mouse_position 残留引用),`clamp_to_monitor` 等既有 5 个测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/selection_toolbar.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "refactor: trigger 拆 trigger_at,锚点改用缓存坐标,删除 mouse_position"
```

---

## Task 7: place_and_show 记录矩形 + hide 清矩形 + 去掉 set_focus

**Files:**
- Modify: `src-tauri/src/selection_toolbar.rs`(`place_and_show`、`hide`)

- [ ] **Step 1: 改 place_and_show(记录矩形,删 set_focus),改 hide(清矩形)**

把 `place_and_show`(原 line 138-152)替换为:

```rust
/// 定位(防溢出)并显示。仅接收前端测得的逻辑尺寸;锚点从 pending 读。
pub fn place_and_show(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let win = app.get_window(LABEL).ok_or("toolbar window not found")?;
    let (anchor_x, anchor_y) = {
        let state = app.state::<AppState>();
        let pending = state.pending_selection.lock().unwrap();
        (pending.x, pending.y)
    };
    position_window(&win, anchor_x, anchor_y, width, height)?;
    win.show().map_err(|e| e.to_string())?;

    // 记录实际物理矩形,供 mouse_hook 做"点外部隐藏"命中检测。不抢焦点:划词工具条
    // 抢焦点会让源应用失活、清掉选区;隐藏改由全局点击检测驱动(去掉了 set_focus)。
    record_toolbar_rect(app, &win);

    // 唯一汇聚点:消费 show(保留 text/x/y 供按钮动作与下次定位)
    app.state::<AppState>().pending_selection.lock().unwrap().show = false;
    Ok(())
}

/// 读窗口实际物理位置 + 尺寸,写入 AppState.toolbar_rect(Some = 可见)。
fn record_toolbar_rect(app: &AppHandle, win: &tauri::Window) {
    let rect = match (win.outer_position(), win.outer_size()) {
        (Ok(p), Ok(s)) => Some((p.x, p.y, s.width as i32, s.height as i32)),
        _ => None,
    };
    *app.state::<AppState>().toolbar_rect.lock().unwrap() = rect;
}
```

把 `hide`(原 line 165-170)替换为:

```rust
/// 隐藏工具条(点外部 / 点按钮后调用,不销毁,供复用)。
pub fn hide(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_window(LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    // 清矩形:隐藏后 mouse_hook 不再把它当命中目标。
    *app.state::<AppState>().toolbar_rect.lock().unwrap() = None;
    Ok(())
}
```

- [ ] **Step 2: 验证编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 编译通过。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/selection_toolbar.rs
git commit -m "feat: 工具条显示记录物理矩形、隐藏清空,并去掉 set_focus"
```

---

## Task 8: mouse_hook — rdev 监听 + 处理线程 + start()(集成核心)

**Files:**
- Modify: `src-tauri/src/mouse_hook.rs`

- [ ] **Step 1: 扩展导入 + 加 INPUT_GEN + 监听/处理/调度**

把 `mouse_hook.rs` 顶部的 use 改为:

```rust
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::state::AppState;
```

在 `static LAST_Y` 之后加输入代号:

```rust
/// 输入代号:每次左键按下自增,用于作废延迟取词任务(见 schedule_capture)。
static INPUT_GEN: AtomicU64 = AtomicU64::new(0);
```

在文件末尾(`#[cfg(test)]` 之前)追加取词延迟常量与运行时:

```rust
/// 取词延迟:抬起后等选区/剪贴板沉降,再调 get-selected-text。
const DELAY_MS: u64 = 80;

/// 送往处理线程的左键事件(已带缓存坐标)。
enum MouseMsg {
    Press { x: i32, y: i32 },
    Release { x: i32, y: i32 },
}

/// 在 setup 中调用一次:起 rdev 钩子线程 + 处理线程。
pub fn start(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<MouseMsg>();

    // 钩子线程:rdev::listen 阻塞,独占一条线程;回调极轻(只写原子 / 发 channel)。
    std::thread::spawn(move || {
        let handler = move |event: rdev::Event| match event.event_type {
            rdev::EventType::MouseMove { x, y } => {
                LAST_X.store(x as i32, Ordering::Relaxed);
                LAST_Y.store(y as i32, Ordering::Relaxed);
            }
            rdev::EventType::ButtonPress(rdev::Button::Left) => {
                let x = LAST_X.load(Ordering::Relaxed);
                let y = LAST_Y.load(Ordering::Relaxed);
                INPUT_GEN.fetch_add(1, Ordering::SeqCst); // 作废延迟任务
                let _ = tx.send(MouseMsg::Press { x, y });
            }
            rdev::EventType::ButtonRelease(rdev::Button::Left) => {
                let x = LAST_X.load(Ordering::Relaxed);
                let y = LAST_Y.load(Ordering::Relaxed);
                let _ = tx.send(MouseMsg::Release { x, y });
            }
            _ => {}
        };
        if let Err(e) = rdev::listen(handler) {
            eprintln!("[mouse_hook] rdev::listen failed: {e:?}");
        }
    });

    // 处理线程:门控 + 命中检测;可放心阻塞(取词放更下游的短命线程)。
    std::thread::spawn(move || process_loop(app, rx));
}

/// 处理线程主循环:维护配对的按下状态,按门控判定动作。
fn process_loop(app: AppHandle, rx: mpsc::Receiver<MouseMsg>) {
    let mut press: Option<(i32, i32, Instant)> = None;
    for msg in rx {
        let state = app.state::<AppState>();
        match msg {
            MouseMsg::Press { x, y } => {
                let rect = *state.toolbar_rect.lock().unwrap();
                match rect {
                    Some(r) if point_in_rect(x, y, r) => {
                        press = None; // 点工具条内部 → 交给按钮,不算拖选起点
                    }
                    Some(_) => {
                        // 工具条可见且点在外 → 隐藏 + 压掉本次抬起
                        state.suppress_next_left_release.store(true, Ordering::SeqCst);
                        let _ = crate::selection_toolbar::hide(&app);
                        press = None;
                    }
                    None => {
                        press = Some((x, y, Instant::now())); // 开始候选拖选
                    }
                }
            }
            MouseMsg::Release { x, y } => {
                let suppress = state.suppress_next_left_release.swap(false, Ordering::SeqCst);
                let taken = press.take();
                let had_press = taken.is_some();
                let enabled = state.selection_autopopup_enabled.load(Ordering::SeqCst);
                let visible = state.toolbar_rect.lock().unwrap().is_some();
                let (dist, dur_ms) = match taken {
                    Some((px, py, t0)) => (
                        (x - px).abs().max((y - py).abs()),
                        t0.elapsed().as_millis() as u64,
                    ),
                    None => (0, 0),
                };
                if classify_release(suppress, had_press, enabled, visible, dist, dur_ms)
                    == ReleaseAction::Trigger
                {
                    schedule_capture(app.clone(), x, y);
                }
            }
        }
    }
}

/// 有效拖选 → 延迟 DELAY_MS,睡醒后二次校验(代号未变 / 仍开启 / 仍不可见)才取词弹窗。
fn schedule_capture(app: AppHandle, x: i32, y: i32) {
    let gen_at_schedule = INPUT_GEN.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(DELAY_MS));
        let state = app.state::<AppState>();
        let gen_now = INPUT_GEN.load(Ordering::SeqCst);
        let enabled = state.selection_autopopup_enabled.load(Ordering::SeqCst);
        let visible = state.toolbar_rect.lock().unwrap().is_some();
        if gen_now != gen_at_schedule || !enabled || visible {
            return; // 延迟窗口内发生新输入 / 关开关 / 已可见 → 丢弃
        }
        crate::selection_toolbar::trigger_at(&app, x, y);
    });
}
```

- [ ] **Step 2: 验证编译(此时纯函数全部接线,dead_code 警告清零)**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 编译通过,无 mouse_hook 相关 dead_code 警告。

- [ ] **Step 3: 跑 mouse_hook 单测确认未回归**

Run: `cargo test --manifest-path src-tauri/Cargo.toml mouse_hook`
Expected: 6 个纯函数测试仍全 PASS。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/mouse_hook.rs
git commit -m "feat: mouse_hook 接入 rdev 监听 + 处理线程(门控/命中/延迟取词)"
```

---

## Task 9: lib.rs 接线(初始化顺序 + 启动 hook)+ commands 命令

**Files:**
- Modify: `src-tauri/src/commands.rs`(加命令)
- Modify: `src-tauri/src/lib.rs:22-26`(setup)、`:45-66`(generate_handler)

- [ ] **Step 1: 加 set_selection_auto_popup 命令**

在 `commands.rs` 的 `copy_selection`(line 74-77)之后加:

```rust
#[tauri::command]
pub fn set_selection_auto_popup(app: AppHandle, enabled: bool) {
    app.state::<crate::state::AppState>()
        .selection_autopopup_enabled
        .store(enabled, std::sync::atomic::Ordering::SeqCst);
}
```

> `commands.rs:4` 已 `use tauri::Manager`,`.state()` 可用。

- [ ] **Step 2: setup 里按顺序初始化开关并启动 hook**

把 `lib.rs` 的 `.setup(...)`(line 22-26)替换为:

```rust
        .setup(|app| {
            tray::build_tray(app.handle())?;
            shortcuts::register_from_settings(app.handle());
            // 划词自动弹出开关:先读设置写入运行态原子,再启动全局鼠标钩子,
            // 保证处理线程不会读到 AtomicBool 默认的 false(见 state.rs 注释)。
            let enabled = settings_io::read_settings(app.handle()).selection_auto_popup;
            app.state::<state::AppState>()
                .selection_autopopup_enabled
                .store(enabled, std::sync::atomic::Ordering::SeqCst);
            mouse_hook::start(app.handle().clone());
            Ok(())
        })
```

在 `generate_handler!` 列表里 `commands::copy_selection,`(line 57)之后加一行:

```rust
            commands::copy_selection,
            commands::set_selection_auto_popup,
```

> **device_event_filter 备忘(暂不加代码)**:已知 Tauri bug 只断 rdev *键盘*事件,鼠标不受影响。若手验发现主窗口聚焦时鼠标事件丢失,再在 `tauri::Builder::default()` 后链式加 `.device_event_filter(tauri::DeviceEventFilter::Never)`。

- [ ] **Step 3: 验证编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 编译通过。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: setup 初始化划词开关并启动 mouse_hook;注册 set_selection_auto_popup"
```

---

## Task 10: 前端设置 — 类型 / 默认 / 合并 / 命令(TDD)

**Files:**
- Modify: `src/state/types.ts:31`、`src/state/defaults.ts`、`src/lib/commands.ts`
- Modify: `src/state/defaults.test.ts`(失败测试先行)

- [ ] **Step 1: 写失败测试**

在 `defaults.test.ts` 的 `describe("DEFAULT_SETTINGS")` 内追加:

```typescript
  it("defaults selectionAutoPopup to true", () => {
    expect(DEFAULT_SETTINGS.selectionAutoPopup).toBe(true);
  });
```

在 `describe("mergeSettings")` 内追加:

```typescript
  it("fills missing selectionAutoPopup from defaults", () => {
    expect(mergeSettings({}).selectionAutoPopup).toBe(true);
  });

  it("keeps stored selectionAutoPopup=false", () => {
    expect(mergeSettings({ selectionAutoPopup: false }).selectionAutoPopup).toBe(false);
  });
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run src/state/defaults.test.ts`
Expected: 新增 3 个测试 FAIL(`selectionAutoPopup` 为 undefined)。

- [ ] **Step 3: 加类型 + 默认 + 合并 + 命令**

`types.ts` 的 `Settings` 接口,`quickAskResetPolicy: QuickAskResetPolicy;`(line 31)之后加:

```typescript
  selectionAutoPopup: boolean;
```

`defaults.ts` 的 `DEFAULT_SETTINGS`,`quickAskResetPolicy: "after5m",`(line 16)之后加:

```typescript
  selectionAutoPopup: true,
```

`defaults.ts` 的 `mergeSettings` return 对象,`quickAskResetPolicy: stored.quickAskResetPolicy ?? base.quickAskResetPolicy,`(line 39)之后加:

```typescript
    selectionAutoPopup: stored.selectionAutoPopup ?? base.selectionAutoPopup,
```

`src/lib/commands.ts` 末尾(`showQuickAsk` 之后)加:

```typescript
/** 设置划词自动弹出开关(运行态);与 updateSettings 并行调用 */
export async function setSelectionAutoPopup(enabled: boolean): Promise<void> {
  await invoke("set_selection_auto_popup", { enabled });
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run src/state/defaults.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/types.ts src/state/defaults.ts src/state/defaults.test.ts src/lib/commands.ts
git commit -m "feat: 前端 selectionAutoPopup 设置(类型/默认/合并/命令)+ 单测"
```

---

## Task 11: i18n + BasicSettings 开关行(含测试)

**Files:**
- Modify: `src/i18n/zh-CN.ts:15`、`src/pages/settings/BasicSettings.tsx`
- Modify: `src/pages/settings/BasicSettings.test.tsx`

- [ ] **Step 1: 加 i18n 文案**

`zh-CN.ts` 的 `"basic.keepState.desc": ...,`(line 15)之后加:

```typescript
  "basic.selectionAutoPopup": "划词自动弹出",
  "basic.selectionAutoPopup.desc": "选中文本松开鼠标后自动弹出工具条",
```

- [ ] **Step 2: BasicSettings 加开关行 + 导入命令**

`BasicSettings.tsx:6` 的导入改为:

```typescript
import { setQuickAskProvider, setSelectionAutoPopup } from "../../lib/commands";
```

在 keepState 的 `</section>`(line 114)之后、`快捷提问默认 AI` section 之前插入:

```tsx
      <section>
        <h3>{t("basic.selectionAutoPopup")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle
            checked={settings.selectionAutoPopup}
            label={t("basic.selectionAutoPopup")}
            onChange={(v) => {
              updateSettings({ selectionAutoPopup: v });
              void setSelectionAutoPopup(v);
            }}
          />
          <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>{t("basic.selectionAutoPopup.desc")}</span>
        </div>
      </section>
```

- [ ] **Step 3: 加测试(mock lib/commands,断言持久化 + 同步后端)**

`BasicSettings.test.tsx` 顶部,在 `vi.mock("../../state/settingsStore", ...)` 块之后加:

```typescript
const setSelectionAutoPopup = vi.fn().mockResolvedValue(undefined);
const setQuickAskProvider = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({
  setQuickAskProvider: (url: string) => setQuickAskProvider(url),
  setSelectionAutoPopup: (v: boolean) => setSelectionAutoPopup(v),
}));
```

把 `beforeEach(() => saveSettings.mockClear());` 改为:

```typescript
beforeEach(() => {
  saveSettings.mockClear();
  setSelectionAutoPopup.mockClear();
});
```

在 `describe("BasicSettings")` 内追加:

```typescript
  it("toggles selectionAutoPopup: persists and syncs to backend", async () => {
    setup();
    await waitFor(() => screen.getByRole("switch", { name: "划词自动弹出" }));
    await userEvent.click(screen.getByRole("switch", { name: "划词自动弹出" }));
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.selectionAutoPopup).toBe(false);
    expect(setSelectionAutoPopup).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/pages/settings/BasicSettings.test.tsx`
Expected: 含新增在内全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/i18n/zh-CN.ts src/pages/settings/BasicSettings.tsx src/pages/settings/BasicSettings.test.tsx
git commit -m "feat: 设置页加划词自动弹出开关(i18n + Toggle + 测试)"
```

---

## Task 12: 去掉前端 onFocusChanged 隐藏路径 + 更新测试

**Files:**
- Modify: `src/pages/selection-toolbar/SelectionToolbar.tsx`
- Modify: `src/pages/selection-toolbar/SelectionToolbar.test.tsx`

- [ ] **Step 1: 删 onFocusChanged useEffect 与无用导入**

删除 `SelectionToolbar.tsx:3` 的 `import { getCurrentWindow } from "@tauri-apps/api/window";`。

删除整段失焦注销 useEffect(原 line 96-107):

```tsx
  // 失焦注销:点击工具条以外区域 → 窗口失焦 → 隐藏
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
```

> `hideSelectionToolbar` 仍用于 `runAction`(line 117),保留其导入。

- [ ] **Step 2: 删测试里无用的 window mock**

删除 `SelectionToolbar.test.tsx:20-22` 的:

```typescript
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: () => Promise.resolve(() => {}) }),
}));
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/pages/selection-toolbar/SelectionToolbar.test.tsx`
Expected: 既有 3 个测试(渲染四按钮、复制后隐藏、解释后隐藏)全 PASS。

- [ ] **Step 4: 提交**

```bash
git add src/pages/selection-toolbar/SelectionToolbar.tsx src/pages/selection-toolbar/SelectionToolbar.test.tsx
git commit -m "refactor: 移除工具条 onFocusChanged 隐藏路径(改由 Rust 点外部检测驱动)"
```

---

## Task 13: 全量验证(自动化 + 手动)

**Files:** 无(验证)

- [ ] **Step 1: 全量自动化测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS(mouse_hook 6 + settings_io + selection_toolbar 5 + quick_ask 等既有)。

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 2: 手动验证(rdev 是真 OS 钩子,必须手验;`npm run tauri dev`)**

逐项确认(spec §10):
1. 点工具条外部 → 隐藏
2. 拖选文本抬起 → 自动弹出
3. **终端内拖选** → 不打断正在运行的程序(无 `^C` SIGINT)
4. 普通点击 → 不弹
5. 点工具条按钮 → 执行动作,不二次弹
6. 设置关掉"划词自动弹出" → 仅快捷键可弹
7. **多屏 + 150% 缩放** → 命中检测准确(rdev 坐标与 `outer_position/size` 同物理空间)
8. 延迟窗口内(<80ms)再点击/拖选 → 不弹过期选区、不重复弹

- [ ] **Step 3: 若手验暴露问题的已知调参点**
- 鼠标事件在主窗口聚焦时丢失 → builder 加 `.device_event_filter(tauri::DeviceEventFilter::Never)`(Task 9 备忘)。
- 误触/漏触 → 调 `DRAG_DIST_PX` / `DRAG_MIN_MS` / `DELAY_MS`(`mouse_hook.rs`)。
- 后台线程建窗失败 → `process_loop` 的 hide / `schedule_capture` 的 trigger_at 改走 `app.run_on_main_thread`。

---

## 自检对照(spec 覆盖)

- 只加 rdev / 删 mouse_position → Task 1、6 ✓
- 保留 global-shortcut 负责快捷键 → 未改 `shortcuts.rs`,`trigger` 签名不变 ✓
- MouseMove 缓存坐标 → Task 2、8 ✓
- ButtonPress 记录 + 点外部隐藏 + bump gen → Task 8 ✓
- ButtonRelease 拖选判定 → Task 3(纯函数)+ Task 8 ✓
- 回调极轻(只原子 / channel)→ Task 8 handler ✓
- 外部点击 suppress 本次 mouse_up → Task 8 Press-外 + Release 第 1 步 ✓
- 阈值 + 延迟后取词 → Task 3 常量 + Task 8 schedule_capture ✓
- 四类不触发 → classify_release(Task 3)+ Press 分流(Task 8)✓
- 延迟任务 generation 二次校验 → Task 8 schedule_capture ✓
- 去 set_focus → Task 7 ✓
- 设置开关(默认 true)+ 初始化顺序 + Rust 结构体 → Task 5、9、10、11 ✓
- 去前端 onFocusChanged → Task 12 ✓

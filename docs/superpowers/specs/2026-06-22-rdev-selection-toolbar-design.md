# 划词工具条:rdev 全局鼠标事件落地设计

- 日期:2026-06-22
- 分支:`feature/selection-toolbar`
- 状态:已通过头脑风暴,待用户复审 → 进入 writing-plans

## 1. 背景与问题

划词工具条目前由全局快捷键(`Alt+Q`)触发,存在两个问题:

1. **点击工具条外部不消失(bug)。** 当前"点外部隐藏"挂在前端 `SelectionToolbar.tsx` 的 `getCurrentWindow().onFocusChanged`——失焦即隐藏。但工具条窗口以 `.focused(false)` 创建,且在 Windows 上 `skip_taskbar + always_on_top + transparent` 的工具窗不可靠地获得/失去焦点,blur 事件不触发,于是点外部不隐藏。
2. **缺少"划词即弹"(新功能)。** 希望监听全局鼠标拖选抬起,自动弹出工具条,而不只靠快捷键。

补充现象:

- `device_query` 实测有漏点击,放弃。
- 鼠标抬起自动取选区时,终端偶尔冒出 `^C` 打断正在运行的程序。根因:`get-selected-text` 在 Windows/Linux 合成 `Ctrl+C` 读剪贴板;**当终端无选区时这一下被当作 SIGINT**。终端有选区时 `Ctrl+C` 是复制——所以问题本质是**门控没做好**(在没有真实选区时也去取词)。核心修复是**严格门控**:只在确有拖选时取词。

## 2. 目标 / 非目标

**目标**
- 用一个事件驱动的全局鼠标库(`rdev`)同时解决 bug 与新功能。
- Rust 层做"点击外部命中检测"隐藏工具条,不再依赖窗口焦点。
- 监听左键拖选抬起,严格门控后自动弹出工具条。
- 删除 `mouse_position` 依赖,鼠标坐标改由 rdev 事件流缓存。

**非目标**
- 不用 rdev 重做快捷键(继续由 `tauri-plugin-global-shortcut` 负责)。
- 不替换 `get-selected-text`(其合成 `Ctrl+C` 的行为保留,靠门控规避副作用)。
- 不补 Alt+Tab/无鼠标点击切走时的自动隐藏(v1 明确不做)。
- 不做终端窗口黑名单(靠严格门控 + 设置开关兜底)。

## 3. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 库 | **`rdev`**(原版 0.5.3) | 用户指定。原版用户多;维护 fork `rdevin` 用户少、不靠谱。**已知风险:`rdev` 0.5.3 自 2023-06 停更**,实现步骤须验证与现有 `time=0.3.47` 锁定依赖树共存。 |
| 一库 vs 两库 | **一库(rdev)** | bug 与新功能本质同一原语(全局鼠标事件流);device_query 轮询漏点击已否决。 |
| 事件处理模型 | **channel + 独立处理线程** | rdev 回调跑在 OS 低级钩子里,回调一慢 Windows 会摘钩子;故回调只更新坐标/发 channel,判定与取词放处理线程。 |
| 取词副作用兜底 | **严格门控 + 设置开关(默认开)** | 终端有选区时 `Ctrl+C` 是复制,严格门控即可消除误触;设置开关作安全阀,复用现有 store/SettingsContext,不新增依赖。 |
| 焦点 | **去掉工具条 `set_focus()`** | 划词工具条不应抢焦点,否则源应用失活、选区可能被清掉。隐藏改由 Rust 外部点击检测驱动。 |
| Alt+Tab 兜底 | **不做** | v1 范围外。 |

## 4. 架构

```
                 rdev 钩子线程 (OS 低级钩子, 回调必须极轻)
                 ─────────────────────────────────────────
                 MouseMove{x,y}      → 写 static LAST_X/LAST_Y (AtomicI32)
                 ButtonPress(Left)   → 读 LAST → tx.send(Press{x,y})
                 ButtonRelease(Left) → 读 LAST → tx.send(Release{x,y})
                 其余事件忽略;不碰窗口、不碰 get-selected-text
                                          │ channel
                                          ▼
                 处理线程 (可放心阻塞)
                 ─────────────────────────────────────────
                 for msg in rx: 跑门控状态机 (§6)
                   - 外部点击 → 主线程 hide + suppress
                   - 有效拖选 → spawn(延迟后 trigger_at)
```

rdev 的按键事件不带坐标,仅 `MouseMove` 带 —— 这是必须缓存坐标的根本原因。

## 5. 模块与状态

### 5.1 新模块 `src-tauri/src/mouse_hook.rs`
- `pub fn start(app: AppHandle)`:在 `setup` 调一次,起 rdev 钩子线程 + 处理线程。
- 模块级坐标缓存:`static LAST_X/LAST_Y: AtomicI32`(初值哨兵,如 `i32::MIN`)。rdev 报 `f64`,取整写入。
- 模块级输入代号:`static INPUT_GEN: AtomicU64`(镜像现有 `quick_ask_reset_generation`)。每次 `Press` 自增,用于作废过期的延迟取词任务(§6)。
- `pub fn last_position() -> Option<(i32,i32)>`:哨兵时返回 `None`。

### 5.2 `AppState` 新增字段
```rust
pub toolbar_rect: Mutex<Option<(i32,i32,i32,i32)>>,  // 可见: Some(x,y,w,h) 物理像素; 隐藏: None
pub suppress_next_left_release: AtomicBool,           // 外部点击隐藏后压掉这一次 mouse_up
pub selection_autopopup_enabled: AtomicBool,          // 运行态开关; 见下方初始化
```
> **`AtomicBool::default()` 是 `false`**,而开关默认应为 `true`——`#[derive(Default)]` 给不出 `true`。真值来源是 `StoredSettings.selection_auto_popup`(serde 默认 `true`,§8);**`setup` 必须按「读设置 → 写 `selection_autopopup_enabled` 原子 → 启动 hook」的顺序初始化**,保证处理线程不会读到启动态的 `false`。

### 5.3 `selection_toolbar.rs` 改造
- 拆分 `trigger`:
  - `pub fn trigger_at(app, anchor_x, anchor_y)`:原 `trigger` 主体去掉鼠标查询;取词 + 写 pending(锚点用传入)+ ensure_window + emit。
  - `pub fn trigger(app)`:热键入口,读 `mouse_hook::last_position()`(`None` 回退主屏左上)→ `trigger_at`。**保持 `fn(&AppHandle)` 签名,`shortcuts.rs` 零改动。**
  - 划词路径用**抬起时的 (x,y)** 调 `trigger_at`(锚点精确,避免延迟期间鼠标移动跑偏)。
- `place_and_show`:`win.show()` 后用 `outer_position()/outer_size()` 取**实际物理矩形**写入 `toolbar_rect`;**删除 `let _ = win.set_focus();`**。
- `hide`:`win.hide()` 后 `toolbar_rect = None`。
- 删除 `mouse_position` 的 `use` 与调用。

## 6. 门控状态机(处理线程核心)

处理线程本地持有 `press: Option<(i32,i32,Instant)>`。判定逻辑抽成**纯函数**以便单测(见 §10)。

**收到 `Press{x,y}`:** 先 `INPUT_GEN += 1`(作废第 5 步排期的过期延迟任务),再按 `toolbar_rect` 分流:

| `toolbar_rect` | 点在矩形内? | 动作 |
|---|---|---|
| `Some`(可见) | 内 | 工具条按钮点击,交给按钮;`press=None` |
| `Some`(可见) | 外 | `suppress=true` → 主线程 `hide` → `press=None` |
| `None`(隐藏) | — | `press=Some(x,y,now)` |

**收到 `Release{x,y}`(按顺序):**
1. `if suppress.swap(false) { press=None; continue }` — 压掉外部点击隐藏 / 刚隐藏后的抬起
2. `let Some((px,py,t0)) = press.take() else continue` — 无记录的按下直接忽略
3. `if !autopopup_enabled { continue }` — 设置关了
4. `if toolbar_rect.is_some() { continue }` — 工具条仍可见,不自动触发
5. `dist = max(|x-px|,|y-py|)`、`dur = t0.elapsed()`;**`dist≥DRAG_DIST_PX && dur≥DRAG_MIN_MS`** 才算有效拖选 → 快照 `g = INPUT_GEN`,`spawn(sleep(DELAY_MS) → 二次校验 → trigger_at(x,y))`
   - **延迟任务醒来后必须二次校验**(80ms 内用户可能点别处/隐藏/关开关/再拖选):`INPUT_GEN == g`(无更新输入)且 `autopopup_enabled` 仍真且 `toolbar_rect` 仍 `None`——三者全满足才 `trigger_at`,否则丢弃。

该表精确覆盖"不触发"四类:普通点击(dist 不足)、点工具条内部(press 置 None)、刚隐藏后的 mouse_up(suppress / press=None)、工具条可见(第 4 步)。延迟期内的新输入由 `INPUT_GEN` + 第 5 步二次校验作废,避免过期取词/弹窗。

## 7. 阈值默认值(可调,手动验证时微调)
- `DRAG_DIST_PX = 6`(物理像素)
- `DRAG_MIN_MS = 80`
- `DELAY_MS = 80`(抬起后等选区/剪贴板沉降再取词)

## 8. 设置开关接线(复用现有 store/SettingsContext,无新依赖)
- `src/state/types.ts` + `defaults.ts`:加 `selectionAutoPopup: boolean`(默认 `true`),并在 `mergeSettings` 补缺省。
- 设置页(`BasicSettings.tsx`)加一行 `Toggle`。
- `src/lib/commands.ts`:加 `setSelectionAutoPopup(enabled)` 包装。
- **Rust 设置结构体**(`settings_io.rs` 的 `StoredSettings`):加
  `#[serde(rename = "selectionAutoPopup", default = "default_true")] pub selection_auto_popup: bool`
  (复用已有的 `default_true()` 助手,line 25),并在 `impl Default for StoredSettings` 补 `selection_auto_popup: true`。
- **Rust 启动顺序**:`setup` 中**先** `read_settings` →**写** `selection_autopopup_enabled` 原子 →**再** `mouse_hook::start`(见 §5.2,避免读到启动态 `false`)。
- 新增命令 `set_selection_auto_popup(app, enabled)` 写原子(在 `lib.rs` 的 `generate_handler!` 注册);前端切换时与 `updateSettings` 并行调用。

## 9. 前端改动
- `src/pages/selection-toolbar/SelectionToolbar.tsx:100-101`:删除 `onFocusChanged → hideSelectionToolbar`。其余(show 事件监听、`placeAndShowSelectionToolbar`、按钮动作)不动。
- `SelectionToolbar.test.tsx`:移除 onFocusChanged 相关 mock/期望。

## 10. 测试策略
- **Rust 纯函数单测**(镜像现有 `clamp_to_monitor` / `visible_toggle_action` 风格):
  - `point_in_rect(x,y,rect) -> bool`
  - `classify_release(dist, dur, enabled, visible, had_press, suppress) -> ReleaseAction { Trigger, Ignore }`(或等价签名)——覆盖四类不触发 + 有效拖选。
- **Rust 设置单测**(镜像 `missing_quick_ask_reset_policy_defaults_to_after5m`):缺 `selectionAutoPopup` 字段时反序列化为 `true`。
- **前端单测**:更新 `SelectionToolbar.test.tsx`。
- **手动验证**(rdev 是真 OS 钩子,必须手验):
  1. 点工具条外部 → 隐藏
  2. 拖选文本抬起 → 自动弹出
  3. 终端内拖选 → 不打断程序(无 `^C` SIGINT)
  4. 普通点击 → 不弹
  5. 点工具条按钮 → 执行动作,不二次弹
  6. 设置关掉自动模式 → 仅快捷键可弹
  7. **多屏 + 150% 缩放**下命中检测准确
  8. 延迟窗口内(<`DELAY_MS`)再点击/拖选 → 不弹过期选区、不重复弹(`INPUT_GEN` 二次校验)

## 11. 已知权衡 / 验证项
- **DPI / 多屏**:rdev 坐标须与 `outer_position/size`(物理像素)同坐标空间;复用现有 monitor-rect 逻辑;150% 缩放 + 多屏必测(命中偏差头号来源)。
- **device_event_filter**:已知 Tauri bug 只断 rdev *键盘*事件,鼠标不受影响;我们只用鼠标,大概率无需设置。若实测丢事件,再加 `.device_event_filter(tauri::DeviceEventFilter::Never)`。
- **冷启动**:首个 `MouseMove` 前坐标缓存为空;`trigger` 回退主屏左上(实际几乎不触发)。
- **构建**:验证 `rdev` 与锁定的 `time=0.3.47` 依赖树共存(`rdev` 0.5.3 已停更)。
- **macOS/Linux**:rdev `listen` 需辅助功能权限——与 `get-selected-text` 同一道门,目标平台扩展时一并处理(本期 Windows 优先)。

## 12. 改动文件清单
```
src-tauri/Cargo.toml                               -mouse_position  +rdev
src-tauri/src/mouse_hook.rs                        新建(rdev 线程 + 处理线程 + 坐标缓存)
src-tauri/src/lib.rs                               setup 调 mouse_hook::start;注册 set_selection_auto_popup
src-tauri/src/state.rs                             +3 字段
src-tauri/src/selection_toolbar.rs                 trigger 拆分;记录/清 toolbar_rect;去 set_focus;去 mouse_position
src-tauri/src/commands.rs                          +set_selection_auto_popup
src-tauri/src/settings_io.rs                       +StoredSettings.selection_auto_popup(+默认 +单测)
src/state/types.ts, src/state/defaults.ts          +selectionAutoPopup
src/pages/settings/BasicSettings.tsx               +Toggle 行
src/lib/commands.ts                                +setSelectionAutoPopup
src/pages/selection-toolbar/SelectionToolbar.tsx   去 onFocusChanged
src/pages/selection-toolbar/SelectionToolbar.test.tsx  更新期望
```

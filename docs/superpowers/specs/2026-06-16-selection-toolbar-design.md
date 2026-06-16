# 划词工具条设计

## 背景

当前 anyask 已有主窗口（侧栏 + AI 子 WebView）和快捷提问悬浮窗。用户希望新增"划词"能力：在**任意外部 App** 中选中文本后呼出一个悬浮工具条（效果类似豆包），点击工具条按钮触发对应功能。

工具条本期提供四个系统内置按钮：解释、翻译、总结、复制。未来还要允许用户启用/停用某一项、自建/修改/删除按钮，因此数据模型需为拓展留出空间。

技术可行性已由 spike 验证：`get-selected-text` 可捕获跨 App 选中文本，`mouse_position = "0.1.4"` 可获取鼠标坐标，二者兼容本项目。

本期不监听鼠标松开事件，改由全局快捷键触发，默认 `Alt+Q`，可在快捷键配置页修改。

## 目标

- 全局快捷键（默认 `Alt+Q`）触发：捕获当前选中文本与鼠标坐标，在鼠标坐标处弹出工具条。
- 工具条位置做防溢出计算，不超出鼠标所在显示器边界。
- 点击工具条以外任意区域 → 工具条注销（隐藏）。点击任一功能按钮 → 执行动作后注销。
- 四个内置按钮：
  - **复制**：把捕获到的文本写入系统剪贴板。
  - **解释 / 翻译 / 总结**：把捕获文本打印到控制台（便于观察），并打开快捷提问窗口。本期三者行为一致。
- 工具条按钮以**数据驱动**方式渲染，模型支持未来的启用/停用与自建按钮 CRUD。
- 触发快捷键纳入现有快捷键设置体系，可录制修改，注册失败有提示。

## 非目标

- 不监听鼠标松开/选区变化事件来自动弹出（本期仅快捷键触发）。
- 不实现按钮的启用/停用开关与自建按钮的 CRUD 界面（仅搭好数据模型）。
- 解释/翻译/总结暂不向 AI 注入选中文本、不区分各自提示词（仅打开快捷提问窗口）。
- 不实现工具条的"更多（…）"溢出菜单。
- 不改变主窗口、快捷提问窗、Provider 选择等现有逻辑（仅对 `quick_ask` 抽出一个"显示"入口）。

## 推荐方案

新增一个**复用型透明悬浮窗口** `selection-toolbar`，与 `quick-ask` 同模子，在 Rust 原生窗口层统一管理其创建、显示、定位与注销；React 在窗口内渲染圆角药丸工具条。

选择复用型窗口（首次触发创建，之后常驻隐藏、按需显示）而非每次重建，是因为工具条会被频繁呼出，重建会带来 WebView 创建延迟（约 100–300ms）与闪烁；复用窗口只需 `set_position + show`，体感即时。代价是常驻数十 MB 内存——但工具条只加载本地极轻量的药丸 DOM，不像快捷提问那样承载完整 AI 站点，该代价小且恒定。

> 未来若需回收内存，可参照 `quick_ask` 的重置策略加"空闲自销"，架构上 dispose 即一次 `window.close()`，无需改动其它部分。本期不做。

## 窗口与渲染分流

`tauri.conf.json` 仍只静态声明 `main` 窗口；`selection-toolbar` 由 Rust 运行时创建（同 `quick-ask`）。

窗口构建参数（`WebviewWindowBuilder`）：

- `WebviewUrl::App("index.html")`——复用前端单入口。
- `transparent(true)`、`decorations(false)`——透明无边框，前端自绘圆角与阴影。
- `always_on_top(true)`、`skip_taskbar(true)`、`resizable(false)`。
- `visible(false)`、`focused(false)`——隐身创建，待 `place_and_show` 定位后再显示，避免先在默认位置露一帧的虚影（同 `quick_ask` 的反闪烁手法）。
- `inner_size` 给一个临时值，真实尺寸由前端测量后 `set_size` 校正。

`main.tsx` 现有按窗口 label 的二路分流（`quick-ask` → `QuickAskShell`，否则 `App`）扩展为三路，新增 `selection-toolbar` → `SelectionToolbarShell`。

`SelectionToolbarShell` 与 `QuickAskShell` 同构：包 `I18nProvider` + `SettingsProvider`，应用主题（启动 + 主题变化 + 跟随系统），渲染 `SelectionToolbar`。透明窗口需把 `document.body` 背景设为透明（覆盖 `global.css` 中 `body { background: var(--bg) }`），使窗口只显示药丸本体。

## 触发与捕获

全局快捷键入口 `selection_toolbar::trigger(app)` **在按键 Released 时触发**（非 Pressed），按顺序执行：

0. `std::thread::sleep(20ms)` 让按键状态沉降——划词热键含修饰键（默认 `Alt+Q`），`get-selected-text` 在 Windows 上靠合成 `Ctrl+C` 取值，若在修饰键仍按住时取值会与之冲突。Released + settle 是 spike 已验证的可靠时机。
1. 捕获文本，**最多重试 3 次**（每次失败 `sleep(120ms * attempt)`，全部失败则记空串）——镜像 spike 的 `get_selected_text()` 重试封装。
2. `let (x, y) = match Mouse::get_mouse_position() { Mouse::Position { x, y } => (x, y), Mouse::Error => return };`——物理像素屏幕坐标；取不到则放弃本次弹出。
3. `println!("[selection] captured: {text:?} @ ({x},{y})");`——文本捕获的**主要观察点是 dev 终端的 Rust stdout**（与现有 `println!` 风格一致，最可靠）。
4. 把 `{ text, x, y, show: true }` 写入 `AppState.pending_selection`（鼠标锚点 `x/y` 只存于 Rust 状态，作为定位的唯一真相，不经前端回传）。
5. 确保 `selection-toolbar` 窗口存在（缺则隐身创建），随后 `app.emit_to("selection-toolbar", "selection-toolbar:show", ())`（前端只需感知"显示"信号，`text` 由前端 `get_pending_selection_show` 或事件后读状态；本期事件 payload 用 `()`，`text` 经 pending 状态传递）。

`get-selected-text` 在部分平台依赖剪贴板回退，可能有数十毫秒开销并短暂占用剪贴板（crate 内部会尝试恢复），叠加 settle + 重试，`trigger` 会在全局快捷键回调线程阻塞至多数百毫秒——与 spike 一致，本期可接受。

## 定位与防溢出

前端 `SelectionToolbar` 收到显示请求后：

1. 渲染按钮，用 `getBoundingClientRect()` 测量药丸**外层**真实尺寸（含阴影留白）。
2. `invoke("place_and_show_selection_toolbar", { width, height })`（尺寸为逻辑像素；锚点 `x/y` 由 Rust 从 `pending_selection` 读取，不由前端回传）。

Rust `place_and_show`（仅接收 `width/height`，从 `AppState.pending_selection` 读锚点 `x/y`）：

1. 在 `available_monitors()` 中找到包含鼠标点 `(x, y)` 的显示器；找不到则回退主显示器。
2. 逻辑尺寸 × 该显示器 `scale_factor()` → 物理尺寸。
3. 以鼠标坐标为锚点，按显示器边界做防溢出钳制后得到最终物理位置。
4. `set_size(LogicalSize)` + `set_position(PhysicalPosition)` + `show()` + `set_focus()`。
5. 清掉 `pending_selection.show`（保留 `text`/`x`/`y`）。这是首帧路径与事件路径的唯一汇聚点，在此统一消费 `show`，避免事件路径留下 stale 状态被后续重挂载重放。

**防溢出钳制**抽成纯函数便于单测，语义：

- 锚点默认 = 鼠标坐标（工具条左上角对齐鼠标）。
- 若 `x + width > 显示器右边界` → `x = 右边界 - width`。
- 若 `y + height > 显示器下边界` → `y = 下边界 - height`。
- 最终 `x`/`y` 不小于显示器左/上边界。
- 显示器边界优先取 work_area（排除任务栏）；当前 Tauri 版本若不暴露 work_area，则回退 `monitor.position()` + `monitor.size()`（全屏边界）。多屏时使用包含鼠标点那块屏的 `position()` 偏移。

## 首帧竞态与显示

首次触发时窗口刚创建，React 尚未挂载事件监听，`emit` 会丢失。解决：

- Rust 把待显示状态存于 `AppState.pending_selection`（含 `show` 标志、`text`、锚点 `x/y`）。事件 payload 为 `()`，`text` 一律经 pending 状态传递。
- 前端 `SelectionToolbar` **挂载时主动 `invoke("get_pending_selection_show")` 读一次**：若 `show` 为真，读出 `text` 后立即走显示流程（处理首次创建窗口时事件已丢的情况）。
- 后续触发（窗口已存在）走 `emit` 事件路径：事件只是"唤醒"信号，处理器再 `get_pending_selection_show()` 读最新 `text`，然后显示。
- 两条路径调用同一逻辑 `showWith(text)`（设 `textRef` → 测量 → `place_and_show`），无重复逻辑。事件路径恒显示；挂载路径仅在 `show` 为真时显示。
- **`show` 标志由 `place_and_show` 统一清掉**（两条路径都经此汇聚点），而非由 `get_pending_selection_show` 清——后者只覆盖首帧路径，事件路径（窗口已存在）会留下 `show: true` 的 stale 状态，dev 下 HMR/StrictMode 重挂载时 `get_pending` 会重放旧弹出。`get_pending_selection_show` 只读不清，返回完整 `PendingSelection`（前端取 `text` 与 `show`）。`text`/`x`/`y` 始终保留供按钮动作（复制）与定位使用。

## 注销

两类注销入口，都只**隐藏**窗口（不销毁，供复用）：

1. **失焦注销**：前端 `getCurrentWindow().onFocusChanged(focused => { if (!focused) hide })`，复用 `QuickAskBar` 的失焦模式。因为 `place_and_show` 会 `set_focus()`，用户点击工具条以外区域即让窗口失焦 → 注销，满足"点工具条以外区域注销"。
2. **按钮注销**：点击任一功能按钮，执行动作后调用同一隐藏路径。

隐藏经由命令 `hide_selection_toolbar`（Rust 侧 `window.hide()`）。

## 按钮数据模型

新增 `src/state/selectionActions.ts`，定义类型与内置常量（本期数据源 = 常量；未来改为 `settings.selectionActions ?? BUILTIN_SELECTION_ACTIONS`，渲染层不变）：

```ts
export type SelectionActionKind = "explain" | "translate" | "summarize" | "copy" | "prompt";
//                                                                          ↑ "prompt" 为未来自建按钮预留

export interface SelectionAction {
  id: string;                 // 内置 = kind；自建 = uuid
  source: "builtin" | "custom";
  kind: SelectionActionKind;  // 行为派发依据
  labelKey?: string;          // 内置走 i18n
  label?: string;             // 自建走原文（未来）
  icon: string;               // lucide 图标名（存字符串，未来自建可选图标）
  enabled: boolean;
  order: number;
  // 未来：promptTemplate?: string —— 自建按钮发给 AI 的提示词模板
}

export const BUILTIN_SELECTION_ACTIONS: SelectionAction[] = [
  { id: "explain",   source: "builtin", kind: "explain",   labelKey: "selection.explain",   icon: "BookOpen",  enabled: true, order: 1 },
  { id: "translate", source: "builtin", kind: "translate", labelKey: "selection.translate", icon: "Languages", enabled: true, order: 2 },
  { id: "summarize", source: "builtin", kind: "summarize", labelKey: "selection.summarize", icon: "AlignLeft", enabled: true, order: 3 },
  { id: "copy",      source: "builtin", kind: "copy",      labelKey: "selection.copy",      icon: "Copy",      enabled: true, order: 4 },
];
```

- **图标注册表** `ICON_REGISTRY: Record<string, LucideIcon>`：按字符串名取 lucide 组件（本期 4 个，为未来自建按钮选图标铺路）。
- **渲染**：`SelectionToolbar` 对 `actions.filter(a => a.enabled).sort(by order)` 通用映射出按钮，沿用 `QuickAskBar` 的按钮观感（图标 + 中文标签、hover 背景 `--bg-elev`、颜色 `--fg-muted`→`--fg`，主题 token 来自 `global.css`），并用分隔符/间距还原药丸排版。

## 按钮行为（本期）

按 `kind` 派发：

| 按钮 | kind | 行为 |
|---|---|---|
| 复制 | `copy` | `invoke("copy_selection")` → Rust 把 `pending_selection.text` 写入剪贴板 → 注销 |
| 解释 | `explain` | `console.log(text)` + `invoke("show_quick_ask")` → 注销 |
| 翻译 | `translate` | 同上 |
| 总结 | `summarize` | 同上 |

派发逻辑集中在一个 `kind → handler` 表，便于单测与未来扩展。`console.log` 是前端备份观察点（输出在工具条 WebView 的 devtools），主要观察点仍是触发时 Rust 的 stdout 打印。

`show_quick_ask` 命令调用新抽出的 `quick_ask::show(app)`：无条件"窗口缺则创建、存在则抬到最前并显示 AI 子 WebView"——区别于现有 `toggle`（可见时会隐藏）。`toggle` 行为保持不变。

## 热键与设置接入

沿用现有数据驱动的快捷键结构，新增一条 `selectionToolbar`：

- 前端 `Hotkeys`（`types.ts`）增 `selectionToolbar: string`；`DEFAULT_SETTINGS.hotkeys` 增默认 `"Alt+Q"`；`mergeSettings()` 对旧设置补齐。
- Rust `settings_io.rs` 的 `Hotkeys` 增 `#[serde(rename = "selectionToolbar", default = ...)]`，默认 `"Alt+Q"`。
- `HotkeyRegistration`（Rust + 前端 `commands.ts` 的接口）增 `selectionToolbar: bool`。
- `shortcuts.rs` 把 `register_one` 泛化出可指定 `ShortcutState` 的内部版本：现有 `quickAsk`/`showMain` 仍走 `Pressed`；`selectionToolbar` 走 **`Released`** → `selection_toolbar::trigger`（理由见「触发与捕获」：修饰键松开后取选区才可靠）。`register_from_settings` 三条都注册并汇报到 `HotkeyRegistration`。
- `HotkeySettings.tsx` 的 `ROWS` 增 `{ name: "selectionToolbar", labelKey: "hotkeys.selectionToolbar" }`——UI 自动多出一行可录制按钮，注册失败复用既有"注册失败"提示。
- 冲突检测：`hotkeys.ts` 新增 `hasAnyConflict(list)` 对三个键查重（任意两个相同即提示），保留现有 `hasConflict` 不动；`HotkeySettings.tsx` 改用 `hasAnyConflict([quickAsk, showMain, selectionToolbar])`。
- i18n（`zh-CN.ts`）新增：`hotkeys.selectionToolbar`、`selection.explain`、`selection.translate`、`selection.summarize`、`selection.copy`。

## 命令清单

新增 `#[tauri::command]`（`commands.rs` 薄封装，委托给模块函数）：

- `place_and_show_selection_toolbar(width, height)`——从 `pending_selection` 读锚点，定位防溢出并显示，**显示后清 `pending_selection.show`**（保留 `text`/`x`/`y`）。
- `hide_selection_toolbar()`——隐藏工具条。
- `get_pending_selection_show() -> PendingSelection`——首帧兜底读取（前端取 `text`/`show`），**只读不清**，`show` 的清理统一在 `place_and_show`。
- `copy_selection()`——把捕获文本写入剪贴板。
- `show_quick_ask()`——显示快捷提问窗口（委托 `quick_ask::show`）。

前端 `lib/commands.ts` 增对应封装函数。

## 状态结构

`AppState` 增加：

```rust
pub pending_selection: Mutex<PendingSelection>,
```

```rust
#[derive(Default, Clone, Serialize)]
pub struct PendingSelection {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub show: bool,
}
```

`AppState` 当前用 `#[derive(Default)]`，`PendingSelection::default()` 全零/空/false，新增字段无需手写 `Default`。该状态仅运行时使用，不持久化。

## 依赖与权限

- `src-tauri/Cargo.toml` 增：`get-selected-text = "0.1.6"`、`mouse_position = "0.1.4"`（均与 spike `exp/selectic-toolbar-spike` 验证版本一致）、`tauri-plugin-clipboard-manager = "2"`（复制经 Rust 侧写入）。
- `lib.rs`：`.plugin(tauri_plugin_clipboard_manager::init())`，注册新模块 `selection_toolbar`，`invoke_handler` 增上述命令。
- 新建 `src-tauri/capabilities/selection-toolbar.json`：`"windows": ["selection-toolbar"]`，权限 `core:default` + `store:default`（与 `quick-ask.json` 一致）。`store:default` 必需——`SelectionToolbarShell` 包 `SettingsProvider`，其 `loadSettings()` 经前端 IPC 调 `plugin-store` 的 `load()`，受 capability 管控；缺则读不到设置、主题失效。自定义命令不受 capability 限制，无需额外授权；剪贴板由 Rust 侧调用插件，同样不经过前端 capability。

## 错误处理

- `get_selected_text()` 失败或为空 → 文本记空串，仍照常弹工具条（复制空串无害，打开快捷提问不依赖文本）；终端打印 `captured: ""` 便于发现。
- `Mouse::get_mouse_position()` 取不到坐标 → 放弃本次弹出（不显示工具条）。
- `place_and_show` 找不到包含鼠标点的显示器 → 回退主显示器；尺寸异常用 `.max(1.0)` 兜底（对标现有代码）。
- 热键注册失败（与系统/输入法冲突）→ 经 `HotkeyRegistration` 回传，设置页显示"注册失败"。
- `copy_selection` 写剪贴板失败 → best-effort 吞掉，仍注销，不卡 UI。
- 工具条窗口创建失败 → 记录并返回，不影响应用其它功能。

## 测试策略

**Rust 单测**（对标 `quick_ask.rs` 的 `reset_delay` / `visible_toggle_action` 风格）：

- 防溢出钳制纯函数：正常（不溢出，锚点 = 鼠标）、右溢出贴右、下溢出贴下、同时右下溢出、显示器带偏移（多屏）时坐标正确。

**前端 Vitest**：

- `selectionActions`：`BUILTIN_SELECTION_ACTIONS` 完整性（4 项、kind/labelKey/icon 齐全）、`enabled` 过滤与 `order` 排序、`ICON_REGISTRY` 覆盖所有内置 icon 名。
- 派发：`kind → handler` 路由——`copy` 调 `copy_selection`、`explain/translate/summarize` 调 `show_quick_ask`，且都触发注销。
- `SelectionToolbar` 渲染：按 `enabled` 出按钮数；点击按钮调对应命令并隐藏。
- `DEFAULT_SETTINGS.hotkeys.selectionToolbar` 默认 `"Alt+Q"`；`mergeSettings()` 对旧设置补齐。
- 三键冲突检测：任意两键相同时 `hasConflict`（或其泛化版）返回真。

**手动验证**：

- 在外部 App 选中文本 → `Alt+Q` → 工具条在鼠标处弹出。
- 屏幕右/下边缘选词触发 → 工具条不溢出屏幕。
- 点击工具条以外区域 → 注销；再次触发可正常复用弹出。
- 复制按钮 → 选中文本进入剪贴板，可粘贴。
- 解释/翻译/总结按钮 → dev 终端打印捕获文本，且快捷提问窗口被打开。
- 快捷键配置页可见"划词工具条"行，可录制为其它键并生效；与其它键冲突时有提示。

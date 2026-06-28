# 划词工具条提示词注入设计

## 背景

当前项目是 Tauri 2 + React。划词工具条已经能捕获取词并显示按钮，但除“复制”外，“解释 / 翻译 / 总结”只打印捕获文本并打开 quick-ask 窗口，没有把提示词交给 AI 页面。

quick-ask 窗口由本地 React 壳 `quick-ask` 和外部 AI 子 WebView `quick-ask-ai` 组成。Rust 侧已有 `show_deferred`，用于避免从划词工具条 WebView 的 IPC 调用栈里同步创建另一个 WebView 导致 Windows/WebView2 卡死。

本设计把划词按钮做成可用的提示词入口：用户选中文本后点击内置按钮，前端按模板构造 prompt，Rust 打开或抬起 quick-ask，并把 prompt 注入 `quick-ask-ai` 的输入框。注入只填入，不自动发送。

## 已确认行为

- 翻译目标语言按 `settings.language` 推导；当前 `zh-CN` 映射为“简体中文”。
- 点击“解释 / 翻译 / 总结”后只填入输入框，不自动发送。
- 如果 AI 输入框已有内容，立即停止注入，不覆盖、不追加。
- 如果找不到输入框，每 500ms 重试一次，最多 10 秒。
- ChatGPT、Claude、Google AI Studio 走同一套通用输入框查找逻辑。
- 注入失败、输入框非空或超时暂不加 UI 提示，最多记录日志。
- 连续触发时后一次 prompt 覆盖前一次，旧注入任务失效。
- 选中文本为空或全是空白时仍打开 quick-ask，但不填充输入框。
- 长文本不截断，完整交给目标 AI 页面处理。
- 不主动新建对话，填入当前 AI 页面当前输入框。
- 判断空文本使用 `trim()`；实际注入保留原始选区格式，包括换行、缩进、前后空格。

## 方案

采用“前端生成 prompt，Rust 显示 quick-ask 并注入”的方案。

前端负责：

- 定义内置划词动作和默认提示词模板。
- 根据动作、选中文本和用户语言构造最终 prompt。
- 判断空文本时只打开 quick-ask，不填充输入框，并取消上一轮尚未完成的 prompt 注入。
- 未来承接自定义按钮和自定义提示词模板。

Rust 负责：

- 保留 deferred 显示逻辑，避免 Windows/WebView2 IPC 调用栈内同步创建 WebView。
- 打开或抬起 quick-ask 后，对 `quick-ask-ai` 执行运行时注入脚本。
- 用 generation/token 让后一次注入覆盖前一次注入。

不采用 Rust 生成 prompt 的方案，因为未来自定义按钮、排序、启用状态和模板都属于用户设置，放在前端 settings 体系内更清晰。Rust 不需要理解按钮配置，只需要接收最终 prompt 并执行 WebView 注入。

不只依赖 `initialization_script`，因为已有 `quick-ask-ai` WebView 时仍然需要运行时 `eval`。本次以运行时注入为主，后续如需优化新建窗口首屏时机，再补初始化脚本。

## 前端设计

### selectionActions

`src/state/selectionActions.ts` 保留内置动作定义，并扩展 `promptTemplate`：

- `explain`: `{{selection}}\n\n解释上文`
- `translate`: `{{selection}}\n\n翻译上文至{{targetLanguage}}`
- `summarize`: `{{selection}}\n\n总结上文`
- `copy`: 无 prompt 模板

新增纯函数：

- `languageName(language)`：当前把 `zh-CN` 映射为“简体中文”。
- `buildSelectionPrompt(action, text, language)`：渲染模板并返回 prompt；无模板动作返回 `null`。

模板变量先支持：

- `{{selection}}`
- `{{targetLanguage}}`

未来自定义按钮沿用相同渲染函数，不新增另一套模板语法。

### 用户自定义按钮的持久化方向

当前实现不做自定义按钮 UI，但类型设计预留到 settings：

```ts
interface PersistedSelectionAction {
  id: string;
  source: "custom";
  kind: "prompt";
  label: string;
  icon: string;
  enabled: boolean;
  order: number;
  promptTemplate: string;
}
```

未来 `Settings` 增加：

```ts
selectionActions: PersistedSelectionAction[];
```

运行时将内置动作和用户动作合并：

```ts
const actions = enabledActions([
  ...BUILTIN_SELECTION_ACTIONS,
  ...settings.selectionActions,
]);
```

如果未来允许用户修改内置模板，应增加单独的内置覆盖配置，而不是把内置动作整份复制到 settings。

### SelectionToolbar

`SelectionToolbarShell` 已挂 `SettingsProvider`，所以 `SelectionToolbar` 可以读取 `settings.language`。

点击逻辑：

- `copy`：沿用 `copySelection()`，然后隐藏工具条。
- 非 `copy` 且 `textRef.current.trim()` 为空：调用 `showQuickAskWithPrompt(null)`，不注入 prompt，但取消上一轮尚未完成的注入，然后隐藏工具条。
- 非 `copy` 且文本非空：构造 prompt，调用 `showQuickAskWithPrompt(prompt)`，然后隐藏工具条。

保留原始选区文本用于 prompt，不对注入内容做 trim。

## Rust 设计

### commands

新增 Tauri command：

```rust
#[tauri::command]
pub fn show_quick_ask_with_prompt(app: AppHandle, prompt: Option<String>) {
    quick_ask::show_with_prompt_deferred(app, prompt);
}
```

前端 `src/lib/commands.ts` 增加：

```ts
export async function showQuickAskWithPrompt(prompt: string | null): Promise<void> {
  await invoke("show_quick_ask_with_prompt", { prompt });
}
```

### quick_ask

新增 deferred 注入入口：

- `show_with_prompt_deferred(app, prompt)`：异步延迟 1ms 后调用显示逻辑；`prompt` 为非空文本时触发注入，`None` 或空白字符串只显示窗口并取消旧注入。
- 显示逻辑复用现有 `show(&app)`，不主动新建对话，不改变 reset policy。
- 如果 prompt 为 `None` 或空白字符串，不执行注入，只显示窗口。

为连续触发增加 generation/token：

- `AppState` 增加 `quick_ask_prompt_generation: AtomicU64`。
- 每次 `show_with_prompt_deferred` 递增 generation。
- 注入脚本闭包携带本次 generation。
- 新一次触发后旧任务不会再注入。

实现上可以在 Rust 侧用 generation 控制是否还应发起 `eval`；脚本内部也携带 token 防止页面侧旧定时器晚到。页面侧 token 可存在 `window.__ANYASK_QUICK_PROMPT_TOKEN__`。

### 注入脚本行为

脚本执行在 `quick-ask-ai` 子 WebView 内：

1. 保存本次 token 到 `window.__ANYASK_QUICK_PROMPT_TOKEN__`。
2. 每 500ms 调用一次 `injectPrompt()`。
3. 查找输入框：
   - `document.querySelector('#prompt-textarea')`
   - `document.querySelector('[contenteditable="true"]')`
   - `document.querySelector('textarea')`
4. 找不到输入框则继续轮询。
5. 找到输入框后读取当前文本：
   - contenteditable 用 `innerText`
   - 普通输入框用 `value`
6. 如果当前文本 `trim()` 非空，清理定时器并停止。
7. 如果当前文本为空，聚焦并写入 prompt：
   - contenteditable 设置 `innerText`，派发 `InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt })`
   - textarea/input 设置 `value`，派发 `Event('input', { bubbles: true })`
8. 注入成功后清理定时器。
9. 10 秒后清理定时器。

Rust 生成 JS 时必须通过 JSON 字符串序列化 prompt 和 token，避免换行、引号、反斜杠破坏脚本。

## 错误处理

- `quick-ask-ai` 不存在：显示 quick-ask 后重试注入；如果仍不存在，只记录日志。
- `eval` 返回错误：记录日志，不向前端抛错，不阻塞工具条隐藏。
- 输入框非空：视为用户已有编辑内容，停止注入，不提示。
- 10 秒内找不到输入框：停止轮询，不提示。
- 空选文本：仍打开 quick-ask，不构造和注入 prompt，并取消旧注入。

这些行为避免在划词工具条这种短交互里引入额外 UI 状态，同时保护用户已经输入的内容。

## 测试策略

遵循 TDD，先写失败测试再实现。

Vitest：

- 内置动作包含解释、翻译、总结的默认 prompt 模板，复制无 prompt。
- `buildSelectionPrompt` 能渲染解释、翻译、总结。
- `zh-CN` 映射为“简体中文”。
- 模板渲染保留原始选区格式。
- 空白选区点击非复制按钮会调用 `showQuickAskWithPrompt(null)`，不会注入文本。
- 非空选区点击非复制按钮会调用 `showQuickAskWithPrompt(prompt)`。
- 复制按钮仍只调用 `copySelection()`，不打开 quick-ask。

Rust 单元测试：

- 注入脚本生成函数能安全携带换行、引号、反斜杠等 prompt。
- 注入脚本包含输入框查找顺序、500ms 间隔、10 秒超时、非空停止逻辑。
- generation/token 逻辑能表达后一次覆盖前一次。

验证命令：

```powershell
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

如实现触及 TypeScript 类型或构建配置，再运行：

```powershell
npm run build
```

## 非目标

- 不实现自定义按钮管理 UI。
- 不实现用户修改内置模板。
- 不自动发送 prompt。
- 不主动新建 AI 对话。
- 不添加注入失败 UI 提示。
- 不为不同 AI 站点写单独适配分支。

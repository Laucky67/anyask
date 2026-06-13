# Anyask 第一阶段设计文档

- 日期：2026-06-13
- 状态：已确认，待转入实现规划
- 适用范围：第一阶段（Phase 1）

## 1. 背景与目标

各 AI 厂商各自推出桌面端，用户想同时用多个 AI 时面临：内存占用大、快捷键冲突多；部分厂商还没有桌面端。

Anyask 是一个 **AI 聚合聊天桌面端**：在一个应用里承载多个 AI 的官方网页，各自保留登录态与会话状态，用统一的快捷键与界面访问，替代"电脑里塞一堆桌面端"。

第一阶段功能刻意精简，但架构需具备可维护性与可扩展性，为后续功能留出空间。

## 2. 技术栈

- Tauri 2 + React 19 + TypeScript + Vite 7 + pnpm（项目已用此模板初始化）
- 承载层：Tauri 2 **多 webview**（`unstable` 特性，`Window::add_child`）
- 设置持久化：`tauri-plugin-store`
- 全局快捷键：`tauri-plugin-global-shortcut`
- 系统托盘：Tauri 2 内置 `TrayIcon`
- 多语言：轻量自建 i18n（当前仅 zh-CN）

## 3. 核心架构决策

### 3.1 为什么是「单窗口 + 多 webview」

硬需求：各 AI **独立保留登录态**，且「切出保留状态」开启时**秒切**。这要求多个 AI 的 webview 能**同时存活**。由此排除：

- 单 webview 切换时重新导航 —— 会丢失状态
- `iframe` 内嵌 —— ChatGPT/Claude 的 `X-Frame-Options`/CSP 禁止内嵌

最终在两个可行方案中选择方案 A：

**方案 A（采用）：单窗口 + 多 Webview**
主窗口承载 React 外壳（侧栏 + 内容区占位），每个 AI 是主窗口的子 webview，覆盖在内容区上方。切换即调整 webview 的显示/层级；打开设置时隐藏所有 AI webview，露出 React 设置页。

- 优点：真正的「一个窗口」体验、秒切、状态天然隔离、登录态各自持久化
- 代价：依赖 Tauri `unstable` 特性，存在已知毛刺（见 §9）

**方案 B（降级备选）：多个独立 WebviewWindow 叠加**
每个 AI 是独立系统窗口，手动定位到内容区并跟随主窗口同步。不依赖 unstable，但跨窗口位置/焦点/缩放同步脆弱、观感差。仅在方案 A 实测毛刺不可接受时降级。

### 3.2 隔离设计

「AI 视图承载层」封装为独立模块（Rust `webviews.rs` + 前端 `lib/commands.ts`）。上层（侧栏、设置、状态）只通过少量命令与之交互，不感知底层是「多 webview」还是「多窗口」。将来若需从方案 A 降级到方案 B，改动局限在这一层。

## 4. 配置数据模型

单一数据源 = `tauri-plugin-store` 的 JSON 文件，前后端均可读写。

```ts
interface Settings {
  language: 'zh-CN';                          // 占位，仅中文
  theme: 'light' | 'dark' | 'system';         // 默认 'system'
  keepStateOnSwitch: boolean;                 // 默认 true
  providers: AiProvider[];                    // 数组顺序 = 侧栏顺序
  hotkeys: {
    quickAsk: string;                         // 默认 'CommandOrControl+Space'
    showMain: string;                         // 默认 'CommandOrControl+Shift+Space'
  };
  quickAskProviderId: string;                 // 快捷提问窗加载哪个 AI
}

interface AiProvider {
  id: string;                                 // 'chatgpt' | 'claude' | 'aistudio'
  name: string;
  url: string;
  enabled: boolean;                           // 启用 = 侧栏显示
  logo:
    | { type: 'letter'; color: string }       // 无图：首字母 + 底色
    | { type: 'image'; src: string };         // 后续提供图片后切到此
}
```

内置三个 provider 默认值：

| id | name | url |
|---|---|---|
| chatgpt | ChatGPT | https://chatgpt.com |
| claude | Claude | https://claude.ai |
| aistudio | Google AI Studio | https://aistudio.google.com |

说明：「基础配置 → 启用 AI」的透明度开关与「AI 配置 → 是否启用」操作的是同一个 `enabled` 字段，两个入口保持一致。

## 5. 前端结构（src/）

```
main.tsx                 入口：挂载 App，初始化 i18n + 主题
App.tsx                  外壳布局：<Sidebar/> + <ContentArea/>
state/
  SettingsContext.tsx    启动时从 store 读取，提供给整棵树，写回 store
  types.ts               Settings / AiProvider / Hotkeys 类型
components/
  Sidebar.tsx            渲染 enabled 的 provider 图标 + 底部设置按钮
  ProviderLogo.tsx       有图用图，无图渲染「首字母 + 底色」圆角块
  ContentArea.tsx        路由：AI 占位视图 <-> 设置页
  Toggle.tsx             滑动开关（复用）
pages/settings/
  SettingsPage.tsx       左侧子分类导航：基础配置 / AI 配置 / 快捷键
  BasicSettings.tsx      语言、主题、启用 AI（透明度切换）、切出保留状态
  AiConfigSettings.tsx   每个 AI 一行可展开，配 logo/名称/网址/启用
  HotkeySettings.tsx     一行行快捷键捕获格
i18n/
  index.ts               t() hook + Provider
  zh-CN.ts               中文词典
lib/
  commands.ts            invoke(...) 的类型化封装
  theme.ts               应用浅色/深色/跟随系统到外壳
```

职责边界：React 仅负责「外壳」（侧栏、设置页、内容区占位）。AI 网页内容是原生子 webview，不由 React 渲染。

## 6. Rust 结构（src-tauri/src/）

```
lib.rs          组装：插件、托盘、setup（开机从 store 读取并武装快捷键）、注册命令
state.rs        AppState：providerId -> webview 标签映射、当前激活 id、内容区矩形
webviews.rs     AI webview 管理器：按需创建/显示/隐藏/销毁/定位到内容区
shortcuts.rs    从设置注册/注销全局快捷键 + 回调
tray.rs         托盘图标 + 菜单（显示主界面/退出）、关闭 -> 隐藏到托盘
quick_ask.rs    快捷提问窗的创建/显隐切换/屏幕中下居中定位
commands.rs     #[tauri::command]：set_active_provider / set_content_bounds /
                set_keep_state / apply_hotkeys / toggle_quick_ask / set_quick_provider 等
```

## 7. 关键行为流

1. **启动**：Rust `setup` 读 store（空则写入默认）→ 武装全局快捷键 → 建主窗口加载 React。前端载入设置进 Context，应用主题与语言。默认激活**第一个 enabled 的 provider**；若无任何启用项，内容区显示空状态提示。
2. **选 AI**：侧栏点击 → `set_active_provider(id)` + 上报内容区矩形 → Rust 确保该 AI 的 webview 存在（首次**异步**创建，规避 Windows 死锁）→ 定位覆盖内容区、提到最前；其余 webview 按 `keepStateOnSwitch` 决定隐藏（默认）还是销毁。
3. **开设置**：前端切到设置路由 → 通知 Rust 隐藏所有 AI webview → 露出 React 设置页。
4. **缩放/最大化**：前端监听窗口尺寸变化上报新矩形 → Rust 重定位激活 webview；额外监听最大化/还原事件做重定位（修复 unstable 的位置 bug）。
5. **改快捷键**：捕获组合 → 存 store → `apply_hotkeys()` 重新注册；两个键互相冲突时提示。
6. **切换启用**：改 `enabled` → 存 store → 侧栏重渲染；若禁用了当前激活的 AI，则切走并销毁其 webview。
7. **快捷提问键**：全局快捷键 → Rust 切换 quick-ask 窗显隐（首次按默认 provider 网址创建），定位屏幕中下居中。
8. **关闭主窗**：拦截关闭事件 → 改为隐藏；仅托盘菜单「退出」才真正退出。

## 8. 细节约定

- **快捷键捕获**：点击格子进入「监听」，捕获 keydown 拼装组合串，**必须包含一个非修饰键**才算有效；回车/有效组合保存，Esc 取消。存为 Tauri 加速器格式（如 `CommandOrControl+Shift+Space`），界面友好显示。
- **主题**：用 CSS 变量 + `data-theme` 控制外壳；`system` 监听 `prefers-color-scheme`。只影响外壳，AI 网站保留自身主题。
- **窗口尺寸**：主窗口默认 **1000×666**（最小约 900×600）；快捷提问窗 **400×600**、无边框、置顶、不进任务栏、屏幕中下居中。
- **白屏规避**：AI webview 懒加载（首次选中才创建），而非启动时全部创建；必要时检测白屏并重载。
- **登录态共享**：快捷提问窗与主程序使用同一数据目录/profile，故共享各 AI 的登录态；但会话/滚动等界面状态彼此独立，无需同步。

## 9. 已知风险与注意项

- **多 webview 为 unstable 特性**：API 可能变动；已知毛刺包括最大化/还原后子 webview 位置漂移、首次加载偶发白屏、Windows 上同步命令创建 webview 会死锁。缓解：异步创建、监听窗口事件重定位、懒加载 + 白屏重载。承载层做隔离，必要时降级方案 B。
- **`Ctrl+Space` 默认键的输入法冲突**：在 Windows 中文环境下 `Ctrl+Space` 常被输入法占用（中英文切换）。作为可修改的默认值保留，但首次启动可能冲突；已在快捷键设置中可改。
- **Google OAuth**：用户测试项目已验证 webview 内可完成 Google OAuth 登录与登录态保存，作为本设计的可行性前提。

## 10. 第一阶段范围（YAGNI）

纳入：

- 主界面侧栏选择 AI、内容区打开官网、保留登录态
- 系统托盘（关闭最小化到托盘、后台常驻）
- 快捷提问悬浮窗（加载设置中指定的默认 AI）
- 设置页三个子分类：基础配置、AI 配置、快捷键
- 内置 3 个 provider，字段全部可编辑（名称/网址/logo/启用）；数据模型已支持 N 个

不纳入（后续阶段）：

- 新增/删除自定义 provider 的 UI
- 多语言的实际翻译（仅 zh-CN 占位）
- 真实 logo 资源（用户后续提供，先用首字母 + 底色占位）
- 设置导入导出、账号同步
- 快捷提问窗自定义尺寸的 UI

## 11. 决策记录

| 决策 | 结论 |
|---|---|
| 承载层方案 | 单窗口 + 多 webview（方案 A），承载层隔离以便降级 |
| 快捷提问窗加载哪个 AI | 设置中指定的默认 AI |
| 关闭主窗口行为 | 最小化到系统托盘，后台常驻 |
| 切出保留状态默认值 | 默认开启（保留，秒切） |
| 默认快捷键 | 快捷提问 `Ctrl+Space`、显示主界面 `Ctrl+Shift+Space` |
| AI 配置范围（本期） | 仅编辑现有 3 个，新增/删除后续再做 |
| 主窗口默认尺寸 | 1000×666 |
| 快捷提问窗尺寸 | 400×600 |

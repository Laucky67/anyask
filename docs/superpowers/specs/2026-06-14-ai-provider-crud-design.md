# AI Provider 增删改查功能设计

## 1. 概述

为 anyask 应用实现完整的 AI Provider 管理功能，包括增删改查操作。用户可以在设置页管理 AI 服务商列表，配置名称、官网、Logo 和启用状态。

### 核心需求

- 服务商名称和官网地址必填
- Logo 可选，未上传时显示虚线框占位符，保存后自动生成（首字母+哈希颜色）
- 用户上传的 Logo 自动生成 128x128 缩略图
- 必须至少保留一个启用的 Provider
- 配置非实时更新，需点击保存按钮才持久化
- 快捷提问窗口与主窗口状态同步
- 后端校验 URL 格式和名称长度（≤20 字符）
- ProviderCard 宽度响应式，左右固定边距

## 2. 整体架构

### 2.1 组件结构

```
AiConfigSettings (设置页容器)
├─ ProviderList
│  ├─ ProviderCard (折叠状态) - 复用现有组件
│  ├─ ProviderEditPanel (展开状态)
│  │  ├─ Logo 上传区（居中显示）
│  │  ├─ 表单字段（名称、URL、启用开关）
│  │  └─ 操作按钮（删除、保存、取消）
│  └─ 临时 Provider（新增中）
└─ AddProviderButton (虚线框 + Plus 图标)
```

### 2.2 状态管理

**全局状态（Settings Context）：**
- `settings.providers: AiProvider[]` - 持久化的 Provider 列表

**页面本地状态：**
- `openId: string | null` - 当前展开的 Provider ID（只允许一个展开）
- `drafts: Map<string, DraftProvider>` - 各 Provider 的草稿状态
- `errors: Map<string, ValidationErrors>` - 校验错误信息
- `deletingId: string | null` - 正在删除确认的 Provider ID
- `tempProvider: DraftProvider | null` - 新增中的临时 Provider

### 2.3 数据流

**本地草稿模式（方案 A）：**

1. **打开卡片**：从 `settings.providers` 复制数据到 `drafts[id]`
2. **编辑**：只修改 `drafts[id]`，实时前端校验并显示错误
3. **切换卡片**：展开另一个卡片时，直接丢弃当前 draft（无提示）
4. **保存**：
   - 前端完整校验
   - 调用 Rust 命令 `validate_and_save_provider` 或 `add_provider`
   - 成功：更新 `settings.providers`，清除 draft 和 errors，关闭面板
   - 失败：显示后端返回的错误，保留 draft
5. **取消**：丢弃 draft 和 errors，关闭面板
6. **删除**：弹出原生确认框，确认后调用 Rust 命令并更新 settings

## 3. 数据类型与校验

### 3.1 TypeScript 类型定义

```typescript
// 扩展现有类型
interface DraftProvider extends AiProvider {
  uploadingLogo?: File;  // 上传中的 Logo 文件
}

interface ValidationErrors {
  name?: string;   // "名称不能为空" | "名称不能超过20个字符"
  url?: string;    // "URL不能为空" | "URL格式不正确"
  logo?: string;   // "文件大小超过5MB" | "不支持的图片格式"
}
```

### 3.2 前端校验规则

**名称：**
- 必填
- 长度 ≤ 20 个字符（使用 `Array.from(name).length` 处理多字节字符如 emoji）
- 去除首尾空格后判断

**URL：**
- 必填
- 格式校验：使用 `new URL()` 尝试解析，失败则报错
- 必须是 http/https 协议

**Logo：**
- 可选
- 文件类型：`image/png`, `image/jpeg`, `image/webp`, `image/gif`
- 文件大小：≤ 5MB
- 前端使用 Canvas 生成 128x128 缩略图预览并转为 base64

### 3.3 后端校验（Rust）

后端命令执行以下校验和处理：
1. 重复前端的所有校验（防御性编程）
2. **不进行 URL 可达性校验**（避免人机验证、地区限制、登录墙、超时等问题）
3. 如果 Logo 是上传的图片（base64），生成 128x128 缩略图并保存到应用数据目录
4. 保存到 settings.json 并触发 `SETTINGS_CHANGED_EVENT` 跨窗口同步

## 4. UI 交互设计

### 4.1 卡片展开/收起行为

- 点击 ProviderCard 触发展开/收起
- 只允许一个卡片处于展开状态
- 展开另一个卡片时，自动收起当前卡片并**丢弃其草稿**（无提示）
- 收起时箭头向下（▼），展开时箭头向上（▲）
- 存在临时 Provider 时，不允许展开其他卡片

### 4.2 编辑面板布局

```
┌─────────────────────────────────────┐
│ [Logo] ChatGPT              ▲      │ ← ProviderCard (点击收起)
├─────────────────────────────────────┤
│                                     │
│         [Logo 上传区 - 居中]         │
│         ┌────────┐                  │
│         │   +    │  或显示缩略图     │
│         │ [编辑] │  (Pencil 图标)   │
│         └────────┘                  │
│                                     │
│  服务商名称                          │
│  [ChatGPT________________]          │
│                                     │
│  官网地址                            │
│  [https://chatgpt.com____]          │
│                                     │
│  是否启用  [Toggle 开关]             │
│  [提示文字区域]                      │
│                                     │
│  [错误提示区域]                      │
│                                     │
│  [🗑️ 删除]     [取消] [保存]        │
│                                     │
└─────────────────────────────────────┘
```

### 4.3 Logo 上传交互

**未上传状态：**
- 显示灰色虚线圆框（`border: 2px dashed var(--border)`）
- 中间显示 "+" 号（Plus 图标）
- 无编辑图标
- 点击打开文件选择对话框

**已上传状态：**
- 显示 128x128 缩略图
- 右下角显示编辑图标（lucide-react 的 `Pencil` 图标）
- 点击可替换 Logo

**上传处理流程：**
1. 选择文件后立即校验（格式、大小）
2. 前端使用 Canvas 生成 128x128 缩略图预览
3. 转为 base64 存入 draft
4. 点击保存时，后端再次处理并持久化到文件系统

### 4.4 删除确认与限制

**删除确认对话框：**
- 使用浏览器原生 `window.confirm()`
- 提示文本：`"确定要删除「${provider.name}」吗？此操作不可恢复。"`

**不可删除的情况：**
- Provider 是唯一启用的（至少保留一个启用）
- 删除按钮显示为禁用状态（`disabled` 属性）
- 鼠标悬停显示 tooltip："至少需要保留一个启用的AI"

### 4.5 启用状态限制

**新规则：必须至少保留一个启用的 Provider**

**两处取消启用的位置：**

1. **AI 配置页（AiConfigSettings）：**
   - 展开的 Provider 编辑面板中的"是否启用"开关
   - 如果当前是唯一启用的，禁用 Toggle 开关
   - 显示提示："至少需要保留一个启用的AI"

2. **基本设置页（BasicSettings）：**
   - 当前显示启用的 AI 列表
   - 同样的校验逻辑

**实现逻辑：**
```typescript
const enabledCount = settings.providers.filter(p => p.enabled).length;
const canDisable = enabledCount > 1;
const isOnlyEnabled = draft.enabled && !canDisable;
```

### 4.6 自动切换逻辑

**快捷提问窗口：**
- `QuickAskBar` 中添加 useEffect 监听 `settings.quickAskProviderId`
- 如果当前 Provider 被禁用或删除，自动切换到第一个启用的：
  ```typescript
  const enabledProviders = settings.providers.filter(p => p.enabled);
  const current = enabledProviders.find(p => p.id === settings.quickAskProviderId) 
    ?? enabledProviders[0];
  ```
- 自动调用 `setQuickAskProvider(current.url)` 导航

**主窗口：**
- 调用 `syncAiWebviews` 自动处理启用状态变更

### 4.7 响应式布局

**ProviderCard 宽度：**
- 容器设置 `maxWidth: 800px` 避免过宽
- ProviderCard 传入 `width="100%"` 自动填充
- 左右通过容器的 `padding: 24px` 保持固定间距

```typescript
<div style={{ 
  padding: 24, 
  display: "flex", 
  flexDirection: "column", 
  gap: 8, 
  maxWidth: 800 
}}>
  <ProviderCard width="100%" {...props} />
</div>
```

## 5. 新增 Provider 功能

### 5.1 添加按钮 UI

位于 Provider 列表底部，虚线框样式：

```typescript
<button
  type="button"
  aria-label="添加AI服务商"
  onClick={handleAdd}
  style={{
    width: "100%",
    height: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px dashed var(--border)",
    borderRadius: 10,
    background: "transparent",
    color: "var(--fg-muted)",
    cursor: "pointer",
  }}
>
  <Plus size={24} />
</button>
```

### 5.2 添加流程（保存后才持久化）

**点击 "+" 按钮后：**
1. 前端生成临时 ID：`temp-${Date.now()}`
2. 创建临时 Provider draft（不添加到 settings）：
   ```typescript
   {
     id: tempId,
     name: "新建服务商",
     url: "",
     enabled: true,
     logo: { type: "letter", color: "#808080" }  // 临时灰色
   }
   ```
3. 自动展开编辑面板
4. 用户填写名称和 URL（必填）

**点击保存：**
1. 前端校验（名称、URL 必填）
2. 调用 Rust 命令 `add_provider(name, url, enabled, logo)`
   - 后端生成 UUID 前 8 位作为真实 id
   - 根据 name 哈希生成最终颜色（letter 类型）
   - 添加到 settings 并同步
   - 返回真实 id
3. 前端删除临时 draft，关闭面板
4. 新 Provider 出现在列表中

**点击取消：**
- 删除临时 draft，关闭面板
- 列表中不留痕迹

**临时 Provider 的特殊处理：**
- 隐藏删除按钮（不能删除临时 Provider）
- 存在临时 Provider 时，不允许展开其他卡片

## 6. Rust 后端实现

### 6.1 新增 Tauri 命令

#### `add_provider`
```rust
#[tauri::command]
async fn add_provider(
    name: String,
    url: String,
    enabled: bool,
    logo: ProviderLogo,
    state: State<'_, AppState>
) -> Result<String, String>
```

**功能：**
- 生成 UUID 并取前 8 位作为 id
- 校验 name（必填、长度 ≤ 20、去除首尾空格）
- 校验 url（必填、格式合法、http/https 协议）
- 如果 logo 是 letter 类型，根据 name 哈希生成固定颜色
- 如果 logo 是 image 类型（base64），生成 128x128 缩略图并保存到 `{app_data_dir}/provider-logos/{id}.png`
- 添加到 settings.providers
- 保存 settings 并触发 `SETTINGS_CHANGED_EVENT`
- 返回新生成的 id

#### `validate_and_save_provider`
```rust
#[tauri::command]
async fn validate_and_save_provider(
    id: String,
    name: String,
    url: String,
    enabled: bool,
    logo: ProviderLogo,
    state: State<'_, AppState>
) -> Result<(), String>
```

**功能：**
- 校验 name（必填、长度 ≤ 20）
- 校验 url（必填、格式合法、http/https）
- 校验 enabled：如果设为 false，检查是否还有其他启用的 Provider，如果没有则返回错误
- 如果 logo 是 image 类型且是新上传的 base64，生成缩略图保存
- 更新 settings.json 中对应的 Provider
- 触发 `SETTINGS_CHANGED_EVENT` 跨窗口同步

#### `delete_provider`
```rust
#[tauri::command]
async fn delete_provider(
    id: String,
    state: State<'_, AppState>
) -> Result<(), String>
```

**功能：**
- 检查是否是唯一启用的 Provider，如果是则返回错误
- 从 settings.providers 中移除指定 id 的 Provider
- 如果该 Provider 有上传的 logo 文件，删除对应的缩略图文件
- 如果被快捷提问使用，更新 `quickAskProviderId` 为第一个启用的 Provider
- 保存 settings 并触发同步事件

#### `refresh_active_ai_webview`
```rust
#[tauri::command]
async fn refresh_active_ai_webview(
    state: State<'_, AppState>
) -> Result<(), String>
```

**功能：**
- 找到主窗口当前激活的 AI webview
- 调用 webview 的导航方法重新加载其配置的 URL

### 6.2 工具函数

#### 颜色哈希函数
```rust
fn hash_color_from_name(name: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let colors = [
        "#10A37F", "#D97757", "#4285F4", "#E94235", 
        "#34A853", "#FBBC04", "#9333EA", "#EC4899"
    ];
    
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    let hash = hasher.finish();
    let index = (hash as usize) % colors.len();
    
    colors[index].to_string()
}
```

#### 缩略图生成
使用 `image` crate：
1. 解码 base64 图片数据
2. 等比缩放到 128x128（保持宽高比，不足部分透明填充）
3. 保存到 `{app_data_dir}/provider-logos/{id}.png`
4. 返回文件路径作为 `ProviderLogo { type: "image", src: "..." }`

## 7. 跨窗口同步

### 7.1 同步机制

复用现有的 `SETTINGS_CHANGED_EVENT` 机制：

**主窗口修改 Provider：**
1. 用户在设置页保存/删除 Provider
2. Rust 更新 settings.json
3. 触发 `SETTINGS_CHANGED_EVENT` 广播
4. 快捷提问窗口的 `SettingsContext` 监听到事件，更新内存状态
5. 两个窗口的 UI 自动反映最新的 Provider 列表

### 7.2 AI Webview 同步

**主窗口的 Provider 变更：**
- URL 变更或启用状态变更：调用 `syncAiWebviews` 重新创建/导航 webview
- 名称/Logo 变更：不影响 webview，只影响 UI 显示

**快捷提问窗口的 webview：**
- Provider 删除或禁用：如果是当前使用的，自动切换到第一个启用的
- URL 变更：调用 `setQuickAskProvider` 导航到新 URL

## 8. 额外功能：Sidebar 刷新按钮

### 8.1 需求

在 Sidebar 的设置按钮**上方**添加刷新按钮：
- 功能：刷新当前激活的 AI webview 到其配置的 URL
- 图标：lucide-react 的 `RotateCw`
- 调用 Rust 命令 `refresh_active_ai_webview()`

### 8.2 Sidebar 图标更新

- 设置图标：从当前的改为 lucide-react 的 `Settings` 图标
- 刷新图标：lucide-react 的 `RotateCw` 图标

## 9. 实现清单

### 9.1 前端（React/TypeScript）

- [ ] 重构 `AiConfigSettings.tsx`
  - [ ] 添加本地状态管理（openId, drafts, errors, tempProvider）
  - [ ] 实现草稿模式逻辑
  - [ ] 实现展开/收起时的草稿丢弃
- [ ] 创建 `ProviderEditPanel.tsx` 组件
  - [ ] Logo 上传区（虚线框/缩略图 + 编辑图标）
  - [ ] 表单字段（名称、URL、Toggle）
  - [ ] 前端校验逻辑
  - [ ] 错误提示显示
  - [ ] 操作按钮（删除、保存、取消）
- [ ] 修改 `ProviderCard.tsx`
  - [ ] 支持点击事件（展开/收起）
  - [ ] 展开时显示箭头向上
- [ ] 实现 Logo 上传和缩略图生成
  - [ ] 文件选择和校验
  - [ ] Canvas 生成 128x128 预览
  - [ ] base64 转换
- [ ] 添加 Provider 功能
  - [ ] 虚线框 "+" 按钮
  - [ ] 临时 Provider 逻辑
  - [ ] 保存时调用 `add_provider` 命令
- [ ] 启用状态限制
  - [ ] 计算 `canDisable` 逻辑
  - [ ] 禁用 Toggle 并显示提示
  - [ ] 删除按钮禁用状态
- [ ] 前端命令绑定（`src/lib/commands.ts`）
  - [ ] `add_provider`
  - [ ] `validate_and_save_provider`
  - [ ] `delete_provider`
  - [ ] `refresh_active_ai_webview`
- [ ] 自动切换逻辑
  - [ ] `QuickAskBar` 监听 `quickAskProviderId` 变化
  - [ ] 当前 Provider 被禁用/删除时切换
- [ ] Sidebar 更新
  - [ ] 添加刷新按钮（`RotateCw` 图标）
  - [ ] 更新设置图标（`Settings` 图标）
- [ ] 更新国际化文案（`src/i18n/zh-CN.ts`）

### 9.2 后端（Rust/Tauri）

- [ ] 新增 Tauri 命令（`src-tauri/src/commands.rs`）
  - [ ] `add_provider`（生成 UUID 前 8 位、校验、保存）
  - [ ] `validate_and_save_provider`（校验、更新、同步）
  - [ ] `delete_provider`（检查、删除、同步）
  - [ ] `refresh_active_ai_webview`（刷新当前 webview）
- [ ] 工具函数（新建 `src-tauri/src/provider_utils.rs`）
  - [ ] `hash_color_from_name`（名称哈希生成颜色）
  - [ ] `generate_thumbnail`（缩略图生成）
  - [ ] `validate_provider_name`（名称校验）
  - [ ] `validate_provider_url`（URL 校验）
- [ ] 添加依赖
  - [ ] `uuid` crate（生成 UUID）
  - [ ] `image` crate（图片处理）
  - [ ] `base64` crate（base64 解码）
- [ ] 注册命令到 Tauri builder（`src-tauri/src/main.rs`）

### 9.3 测试

- [ ] 前端单元测试
  - [ ] ProviderEditPanel 组件测试
  - [ ] Logo 上传逻辑测试
  - [ ] 校验逻辑测试
- [ ] 集成测试
  - [ ] 增删改查完整流程
  - [ ] 跨窗口同步验证
  - [ ] 启用状态限制验证

## 10. 边界情况与错误处理

### 10.1 边界情况

1. **删除唯一启用的 Provider：** 后端返回错误，前端禁用删除按钮
2. **禁用唯一启用的 Provider：** 前端禁用 Toggle，显示提示
3. **删除快捷提问正在使用的 Provider：** 自动切换到第一个启用的
4. **切换卡片时有未保存的草稿：** 直接丢弃，无提示
5. **保存临时 Provider 时校验失败：** 显示错误，保持编辑状态
6. **上传超大文件（>5MB）：** 前端立即拦截，显示错误
7. **上传非图片文件：** 前端立即拦截，显示错误
8. **后端缩略图生成失败：** 返回错误，前端显示提示
9. **URL 格式错误：** 前端和后端都校验，前端优先反馈
10. **名称超过 20 字符：** 前端实时校验，保存时后端再次校验

### 10.2 错误提示文案

```typescript
const ERROR_MESSAGES = {
  nameRequired: "名称不能为空",
  nameTooLong: "名称不能超过20个字符",
  urlRequired: "URL不能为空",
  urlInvalid: "URL格式不正确",
  logoTooLarge: "文件大小超过5MB",
  logoInvalidFormat: "不支持的图片格式",
  cannotDisableLast: "至少需要保留一个启用的AI",
  cannotDeleteLast: "至少需要保留一个启用的AI",
  saveFailed: "保存失败，请重试",
};
```

## 11. 性能优化

1. **Logo 上传：** 前端先生成预览，避免频繁调用后端
2. **草稿状态：** 使用 Map 而非数组，O(1) 查找
3. **跨窗口同步：** 复用现有事件机制，避免轮询
4. **缩略图生成：** 只在保存时执行，避免编辑时阻塞
5. **文件校验：** 前端优先拦截，减少后端负担

## 12. 未来扩展

1. **拖拽排序：** Provider 列表支持拖拽调整顺序
2. **批量操作：** 批量启用/禁用多个 Provider
3. **导入导出：** 支持导出 Provider 配置为 JSON，方便备份和分享
4. **预设模板：** 内置常见 AI 服务商模板，一键添加
5. **Logo 库：** 提供预制 Logo 图标库，无需上传

# Anyask 第一阶段 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Anyask 第一阶段：一个 Tauri 桌面端，在单窗口内通过侧栏切换多个 AI 官网（各自保留登录态），含设置页（基础/AI/快捷键）、系统托盘、全局快捷键、快捷提问悬浮窗。

**Architecture:** 主窗口承载 React 外壳（侧栏 + 内容区 + 设置页）；每个 AI 是覆盖在内容区上方的子 webview（Tauri `unstable` 多 webview，Rust 侧 `add_child` + `auto_resize`），由 Rust 承载层（`webviews.rs`）统一管理，前端经命令驱动。设置持久化用 `tauri-plugin-store`（单一数据源），全局快捷键与托盘在 Rust 侧。承载层做隔离，便于将来降级到「多窗口」方案。该多 webview 方案已由同目录 MVP（`../TestTauri/testgpt`）验证可行。

**Tech Stack:** Tauri 2 (features=`unstable`) + React 19 + TypeScript + Vite 7 + pnpm；测试用 Vitest + @testing-library/react；插件 `tauri-plugin-store`、`tauri-plugin-global-shortcut`。

参考设计文档：`docs/superpowers/specs/2026-06-13-anyask-phase1-design.md`

---

## 约定与前置说明

- 包管理器：**pnpm**。安装依赖 `pnpm add ...`，开发依赖 `pnpm add -D ...`。
- 运行前端单测：`pnpm test`（一次性）/ `pnpm test:watch`（监听）。
- 运行整个桌面端：`pnpm tauri dev`（会同时起 Vite 与 Rust）。
- Rust 单测：在 `src-tauri/` 下 `cargo test`。
- **测试策略**：纯逻辑与 React 组件用 Vitest 做 TDD（先写失败测试）。涉及原生窗口/托盘/全局快捷键/多 webview 的部分无法自动化，用 `pnpm tauri dev` 手动验证，每个任务给出明确的操作步骤与预期现象。
- 提交信息用中文，前缀 `feat:` / `test:` / `chore:` / `docs:`。
- 所有路径以项目根 `D:\selfStudy\myprojects\anyask` 为基准，文中用正斜杠相对路径。

## 文件结构总览

前端 `src/`：
```
main.tsx                      入口：挂载 App，初始化主题、i18n、SettingsProvider
App.tsx                       外壳布局：<Sidebar/> + <ContentArea/>
styles/global.css             CSS 变量 + 主题（data-theme）+ 基础布局
state/
  types.ts                    Settings / AiProvider / Hotkeys / ThemeMode 等类型
  defaults.ts                 DEFAULT_SETTINGS / DEFAULT_PROVIDERS / mergeSettings()
  settingsStore.ts            封装 tauri-plugin-store 的 load/get/set（含 merge 默认）
  SettingsContext.tsx         React Provider：加载设置、提供、updateSettings 写回
i18n/
  zh-CN.ts                    中文词典（key -> 文案）
  index.ts                    t()/useT() + I18nProvider
lib/
  hotkeys.ts                  键盘事件 -> 加速器字符串、校验、友好显示、冲突检测
  theme.ts                    resolveTheme()/applyTheme()/watchSystemTheme()
  commands.ts                 invoke(...) 的类型化封装（AI webview 同步 + 快捷键/窗口/快捷提问）
components/
  Toggle.tsx                  滑动开关
  ProviderLogo.tsx            有图用图，无图渲染「首字母 + 底色」
  Sidebar.tsx                 渲染 enabled providers + 底部设置按钮
  ContentArea.tsx             路由：AI 占位视图 <-> 设置页
pages/settings/
  SettingsPage.tsx            子分类导航：基础配置 / AI 配置 / 快捷键
  BasicSettings.tsx           语言、主题、启用 AI（透明度）、切出保留状态
  AiConfigSettings.tsx        每个 AI 一行可展开，配 logo/名称/网址/启用
  HotkeySettings.tsx          快捷键捕获行
test/
  setup.ts                    vitest setup（jest-dom）
```

后端 `src-tauri/src/`：
```
lib.rs            组装：插件、托盘、setup（读 store 武装快捷键）、注册命令
state.rs          AppState：quick-ask provider 缓存等共享状态
webviews.rs       AI webview 承载层：add_child + auto_resize 创建/显示/隐藏/销毁（sync_ai_webviews / hide_ai_webviews）
commands.rs       #[tauri::command]：apply_hotkeys / show_main_window / toggle_quick_ask / set_quick_ask_provider
shortcuts.rs      从 store 读取并注册/重注册全局快捷键 + 回调
tray.rs           托盘图标 + 菜单（显示主界面/退出）、关闭->隐藏到托盘
quick_ask.rs      快捷提问窗的创建/显隐切换/屏幕中下居中
settings_io.rs    Rust 侧读取 store（仅读快捷键/quickAskProviderId）
```

---

## Task 1: 搭建 Vitest 测试框架

**Files:**
- Modify: `package.json`（加 devDeps 与 scripts）
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/sanity.test.ts`

- [ ] **Step 1: 安装测试依赖**

Run:
```bash
pnpm add -D vitest@^2 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: 安装成功，`package.json` devDependencies 出现上述包。

- [ ] **Step 2: 创建 vitest 配置**

Create `vitest.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: 创建测试 setup**

Create `src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";

// jsdom 不实现 matchMedia，主题逻辑依赖它，提供最小桩
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
```

- [ ] **Step 4: 加 package.json 脚本**

Modify `package.json` 的 `"scripts"`，加入：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 写一个 sanity 测试**

Create `src/test/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 运行测试验证通过**

Run: `pnpm test`
Expected: PASS，1 个测试通过。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup.ts src/test/sanity.test.ts
git commit -m "chore: 接入 Vitest 测试框架"
```

---

## Task 2: 设置类型、默认值与 mergeSettings（纯逻辑 TDD）

**Files:**
- Create: `src/state/types.ts`
- Create: `src/state/defaults.ts`
- Test: `src/state/defaults.test.ts`

- [ ] **Step 1: 定义类型**

Create `src/state/types.ts`:
```ts
export type ThemeMode = "light" | "dark" | "system";
export type Language = "zh-CN";

export type ProviderLogo =
  | { type: "letter"; color: string }
  | { type: "image"; src: string };

export interface AiProvider {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  logo: ProviderLogo;
}

export interface Hotkeys {
  quickAsk: string;
  showMain: string;
}

export interface Settings {
  language: Language;
  theme: ThemeMode;
  keepStateOnSwitch: boolean;
  providers: AiProvider[];
  hotkeys: Hotkeys;
  quickAskProviderId: string;
}
```

- [ ] **Step 2: 写失败测试**

Create `src/state/defaults.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_PROVIDERS, mergeSettings } from "./defaults";

describe("DEFAULT_SETTINGS", () => {
  it("has 3 built-in providers all enabled", () => {
    expect(DEFAULT_PROVIDERS.map((p) => p.id)).toEqual(["chatgpt", "claude", "aistudio"]);
    expect(DEFAULT_PROVIDERS.every((p) => p.enabled)).toBe(true);
  });

  it("defaults keepStateOnSwitch to true and theme to system", () => {
    expect(DEFAULT_SETTINGS.keepStateOnSwitch).toBe(true);
    expect(DEFAULT_SETTINGS.theme).toBe("system");
  });

  it("default hotkeys use CommandOrControl", () => {
    expect(DEFAULT_SETTINGS.hotkeys.quickAsk).toBe("CommandOrControl+Space");
    expect(DEFAULT_SETTINGS.hotkeys.showMain).toBe("CommandOrControl+Shift+Space");
  });
});

describe("mergeSettings", () => {
  it("returns defaults when stored is null", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("fills missing fields from defaults", () => {
    const merged = mergeSettings({ theme: "dark" });
    expect(merged.theme).toBe("dark");
    expect(merged.keepStateOnSwitch).toBe(true);
    expect(merged.providers).toHaveLength(3);
  });

  it("keeps stored providers when present", () => {
    const merged = mergeSettings({
      providers: [{ id: "x", name: "X", url: "https://x.com", enabled: false, logo: { type: "letter", color: "#000" } }],
    });
    expect(merged.providers).toHaveLength(1);
    expect(merged.providers[0].id).toBe("x");
  });

  it("does not mutate DEFAULT_SETTINGS", () => {
    const merged = mergeSettings({ theme: "dark" });
    merged.providers.push({ id: "y", name: "Y", url: "", enabled: true, logo: { type: "letter", color: "#111" } });
    expect(DEFAULT_SETTINGS.providers).toHaveLength(3);
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `pnpm test src/state/defaults.test.ts`
Expected: FAIL（找不到 `./defaults` 模块）。

- [ ] **Step 4: 实现 defaults.ts**

Create `src/state/defaults.ts`:
```ts
import type { AiProvider, Settings } from "./types";

export const DEFAULT_PROVIDERS: AiProvider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true, logo: { type: "letter", color: "#10A37F" } },
  { id: "claude", name: "Claude", url: "https://claude.ai", enabled: true, logo: { type: "letter", color: "#D97757" } },
  { id: "aistudio", name: "Google AI Studio", url: "https://aistudio.google.com", enabled: true, logo: { type: "letter", color: "#4285F4" } },
];

export const DEFAULT_SETTINGS: Settings = {
  language: "zh-CN",
  theme: "system",
  keepStateOnSwitch: true,
  providers: DEFAULT_PROVIDERS,
  hotkeys: { quickAsk: "CommandOrControl+Space", showMain: "CommandOrControl+Shift+Space" },
  quickAskProviderId: "chatgpt",
};

/** 深拷贝默认值，避免外部修改污染常量 */
function cloneDefaults(): Settings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
}

/** 把（可能不完整/旧版）已存设置与默认值合并，保证字段齐全且不修改常量 */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const base = cloneDefaults();
  if (!stored) return base;
  return {
    language: stored.language ?? base.language,
    theme: stored.theme ?? base.theme,
    keepStateOnSwitch: stored.keepStateOnSwitch ?? base.keepStateOnSwitch,
    providers: stored.providers && stored.providers.length > 0 ? stored.providers : base.providers,
    hotkeys: {
      quickAsk: stored.hotkeys?.quickAsk ?? base.hotkeys.quickAsk,
      showMain: stored.hotkeys?.showMain ?? base.hotkeys.showMain,
    },
    quickAskProviderId: stored.quickAskProviderId ?? base.quickAskProviderId,
  };
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `pnpm test src/state/defaults.test.ts`
Expected: PASS（全部通过）。

- [ ] **Step 6: 提交**

```bash
git add src/state/types.ts src/state/defaults.ts src/state/defaults.test.ts
git commit -m "feat: 设置数据模型、默认值与 mergeSettings"
```

---

## Task 3: 接入 tauri-plugin-store 与 settingsStore 封装

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Create: `src/state/settingsStore.ts`

注：store 的真实 I/O 依赖 Tauri 运行时，无法在 jsdom 单测里跑，本任务用手动验证。

- [ ] **Step 1: Rust 侧加 store 插件**

Modify `src-tauri/Cargo.toml`，在 `[dependencies]` 加：
```toml
tauri-plugin-store = "2"
```

- [ ] **Step 2: 注册插件**

Modify `src-tauri/src/lib.rs`，在 `tauri::Builder::default()` 链上加 `.plugin(tauri_plugin_store::Builder::default().build())`：
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: 开放 store 权限**

Modify `src-tauri/capabilities/default.json` 的 `permissions` 数组，加入 `"store:default"`：
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": ["core:default", "opener:default", "store:default"]
}
```

- [ ] **Step 4: 前端加 store 包**

Run: `pnpm add @tauri-apps/plugin-store`
Expected: 安装成功。

- [ ] **Step 5: 实现 settingsStore 封装**

Create `src/state/settingsStore.ts`:
```ts
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Settings } from "./types";
import { mergeSettings } from "./defaults";

const STORE_FILE = "settings.json";
const KEY = "settings";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true });
  }
  return storePromise;
}

/** 读取设置；缺字段用默认值补全 */
export async function loadSettings(): Promise<Settings> {
  const store = await getStore();
  const stored = await store.get<Partial<Settings>>(KEY);
  return mergeSettings(stored ?? null);
}

/** 全量写回设置 */
export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set(KEY, settings);
  await store.save();
}
```

- [ ] **Step 6: 手动验证插件可用**

Run: `pnpm tauri dev`
操作：等应用窗口起来（仍是默认模板页）。打开开发者工具控制台（窗口内右键 -> Inspect，或 `Ctrl+Shift+I`），执行：
```js
const { load } = await import("@tauri-apps/plugin-store");
const s = await load("settings.json", { autoSave: true });
await s.set("ping", 1); await s.save(); console.log(await s.get("ping"));
```
Expected: 控制台打印 `1`，无权限报错。关闭应用。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src/state/settingsStore.ts package.json pnpm-lock.yaml
git commit -m "feat: 接入 tauri-plugin-store 与设置读写封装"
```

---

## Task 4: SettingsContext（加载/提供/更新）

**Files:**
- Create: `src/state/SettingsContext.tsx`
- Test: `src/state/SettingsContext.test.tsx`

测试用 mock 掉 `settingsStore`，验证「加载后提供设置」「update 合并并写回」。

- [ ] **Step 1: 写失败测试**

Create `src/state/SettingsContext.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "./defaults";

const loadSettings = vi.fn();
const saveSettings = vi.fn();
vi.mock("./settingsStore", () => ({
  loadSettings: () => loadSettings(),
  saveSettings: (s: unknown) => saveSettings(s),
}));

import { SettingsProvider, useSettings } from "./SettingsContext";

function Probe() {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="theme">{settings.theme}</span>
      <button onClick={() => updateSettings({ theme: "dark" })}>dark</button>
    </div>
  );
}

beforeEach(() => {
  loadSettings.mockReset();
  saveSettings.mockReset();
  loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, theme: "light" });
  saveSettings.mockResolvedValue(undefined);
});

describe("SettingsContext", () => {
  it("loads settings and provides them", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light"));
  });

  it("updateSettings merges and persists", async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("light"));
    await act(async () => {
      screen.getByText("dark").click();
    });
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark"));
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm test src/state/SettingsContext.test.tsx`
Expected: FAIL（找不到 `./SettingsContext`）。

- [ ] **Step 3: 实现 SettingsContext**

Create `src/state/SettingsContext.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import { loadSettings, saveSettings } from "./settingsStore";

interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSettings().then((s) => {
      if (alive) {
        setSettings(s);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, ready, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm test src/state/SettingsContext.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/state/SettingsContext.tsx src/state/SettingsContext.test.tsx
git commit -m "feat: SettingsContext 加载/提供/更新设置"
```

---

## Task 5: i18n（中文词典 + t()）

**Files:**
- Create: `src/i18n/zh-CN.ts`
- Create: `src/i18n/index.ts`
- Test: `src/i18n/index.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `src/i18n/index.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { translate } from "./index";
import { I18nProvider, useT } from "./index";

describe("translate", () => {
  it("returns the mapped string", () => {
    expect(translate("settings.title")).toBe("设置");
  });
  it("falls back to the key when missing", () => {
    expect(translate("nonexistent.key")).toBe("nonexistent.key");
  });
});

function Probe() {
  const t = useT();
  return <span>{t("settings.basic")}</span>;
}

describe("useT", () => {
  it("provides translation function", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByText("基础配置")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm test src/i18n/index.test.tsx`
Expected: FAIL（找不到模块）。

- [ ] **Step 3: 实现中文词典**

Create `src/i18n/zh-CN.ts`:
```ts
export const zhCN: Record<string, string> = {
  "app.name": "Anyask",
  "sidebar.settings": "设置",
  "settings.title": "设置",
  "settings.basic": "基础配置",
  "settings.ai": "AI 配置",
  "settings.hotkeys": "快捷键",
  "basic.language": "界面语言",
  "basic.theme": "外观主题",
  "basic.theme.light": "浅色",
  "basic.theme.dark": "深色",
  "basic.theme.system": "跟随系统",
  "basic.enabledAi": "启用 AI",
  "basic.keepState": "切出保留状态",
  "basic.keepState.desc": "切换 AI 时保留原对话界面状态",
  "ai.logo": "图标",
  "ai.name": "服务商名称",
  "ai.url": "官网地址",
  "ai.enabled": "是否启用",
  "hotkeys.quickAsk": "快捷提问",
  "hotkeys.showMain": "显示主界面",
  "hotkeys.recording": "请按下快捷键…",
  "hotkeys.conflict": "与其它快捷键冲突",
  "common.empty": "暂无可用 AI，请在设置中启用",
};
```

- [ ] **Step 4: 实现 i18n index**

Create `src/i18n/index.ts`:
```tsx
import { createContext, useContext, type ReactNode } from "react";
import { zhCN } from "./zh-CN";

const dict = zhCN;

export function translate(key: string): string {
  return dict[key] ?? key;
}

type TFn = (key: string) => string;
const I18nContext = createContext<TFn>(translate);

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
}

export function useT(): TFn {
  return useContext(I18nContext);
}
```

> 注：`index.ts` 含 JSX，需改名为 `index.tsx`。请将文件命名为 `src/i18n/index.tsx`（测试导入路径 `./index` 不变）。

- [ ] **Step 5: 运行测试验证通过**

Run: `pnpm test src/i18n/index.test.tsx`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/i18n/zh-CN.ts src/i18n/index.tsx src/i18n/index.test.tsx
git commit -m "feat: 轻量 i18n（中文词典 + t）"
```

---

## Task 6: 主题解析与应用

**Files:**
- Create: `src/lib/theme.ts`
- Test: `src/lib/theme.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resolveTheme, applyTheme } from "./theme";

describe("resolveTheme", () => {
  it("returns explicit light/dark as-is", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("resolves system to system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });
  it("sets data-theme on <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm test src/lib/theme.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 theme.ts**

Create `src/lib/theme.ts`:
```ts
import type { ThemeMode } from "../state/types";

export type EffectiveTheme = "light" | "dark";

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): EffectiveTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export function applyTheme(effective: EffectiveTheme): void {
  document.documentElement.setAttribute("data-theme", effective);
}

/** 监听系统主题变化，回调返回是否暗色；返回取消订阅函数 */
export function watchSystemTheme(cb: (prefersDark: boolean) => void): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm test src/lib/theme.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat: 主题解析与应用"
```

---

## Task 7: 全局样式与基础组件（Toggle、ProviderLogo）

**Files:**
- Create: `src/styles/global.css`
- Create: `src/components/Toggle.tsx`
- Create: `src/components/ProviderLogo.tsx`
- Test: `src/components/Toggle.test.tsx`
- Test: `src/components/ProviderLogo.test.tsx`

- [ ] **Step 1: 创建全局样式（CSS 变量 + 主题）**

Create `src/styles/global.css`:
```css
:root {
  --bg: #ffffff;
  --bg-elev: #f5f5f7;
  --fg: #1d1d1f;
  --fg-muted: #6e6e73;
  --border: #e0e0e3;
  --accent: #2563eb;
  --sidebar-w: 64px;
}
[data-theme="dark"] {
  --bg: #1e1e1e;
  --bg-elev: #2a2a2a;
  --fg: #f5f5f7;
  --fg-muted: #a1a1a6;
  --border: #3a3a3a;
  --accent: #3b82f6;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  background: var(--bg);
  color: var(--fg);
}
```

- [ ] **Step 2: 写 Toggle 失败测试**

Create `src/components/Toggle.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("reflects checked state via aria-checked", () => {
    render(<Toggle checked label="保留" onChange={() => {}} />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
  it("calls onChange with toggled value", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="保留" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 3: 运行验证失败**

Run: `pnpm test src/components/Toggle.test.tsx`
Expected: FAIL。

- [ ] **Step 4: 实现 Toggle**

Create `src/components/Toggle.tsx`:
```tsx
interface ToggleProps {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

export function Toggle({ checked, label, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: "pointer",
        padding: 2,
        background: checked ? "var(--accent)" : "var(--border)",
        transition: "background 0.15s",
        display: "inline-flex",
        justifyContent: checked ? "flex-end" : "flex-start",
        alignItems: "center",
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
    </button>
  );
}
```

- [ ] **Step 5: 运行验证通过**

Run: `pnpm test src/components/Toggle.test.tsx`
Expected: PASS。

- [ ] **Step 6: 写 ProviderLogo 失败测试**

Create `src/components/ProviderLogo.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderLogo, initialOf } from "./ProviderLogo";

describe("initialOf", () => {
  it("returns first uppercased character", () => {
    expect(initialOf("chatgpt")).toBe("C");
    expect(initialOf("Claude")).toBe("C");
  });
  it("handles empty name", () => {
    expect(initialOf("")).toBe("?");
  });
});

describe("ProviderLogo", () => {
  it("renders letter fallback with background color", () => {
    render(<ProviderLogo name="ChatGPT" logo={{ type: "letter", color: "#10A37F" }} size={32} />);
    const el = screen.getByText("C");
    expect(el).toBeInTheDocument();
  });
  it("renders image when provided", () => {
    render(<ProviderLogo name="ChatGPT" logo={{ type: "image", src: "/x.png" }} size={32} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/x.png");
  });
});
```

- [ ] **Step 7: 运行验证失败**

Run: `pnpm test src/components/ProviderLogo.test.tsx`
Expected: FAIL。

- [ ] **Step 8: 实现 ProviderLogo**

Create `src/components/ProviderLogo.tsx`:
```tsx
import type { ProviderLogo as Logo } from "../state/types";

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

interface Props {
  name: string;
  logo: Logo;
  size: number;
}

export function ProviderLogo({ name, logo, size }: Props) {
  if (logo.type === "image") {
    return <img src={logo.src} alt={name} width={size} height={size} style={{ borderRadius: size * 0.25, objectFit: "cover" }} />;
  }
  return (
    <span
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: logo.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: size * 0.5,
        userSelect: "none",
      }}
    >
      {initialOf(name)}
    </span>
  );
}
```

- [ ] **Step 9: 运行验证通过**

Run: `pnpm test src/components/ProviderLogo.test.tsx`
Expected: PASS。

- [ ] **Step 10: 提交**

```bash
git add src/styles/global.css src/components/Toggle.tsx src/components/Toggle.test.tsx src/components/ProviderLogo.tsx src/components/ProviderLogo.test.tsx
git commit -m "feat: 全局样式与 Toggle/ProviderLogo 组件"
```

---

## Task 8: Sidebar 组件

**Files:**
- Create: `src/components/Sidebar.tsx`
- Test: `src/components/Sidebar.test.tsx`

Sidebar 接收 props（不直接读 context，便于测试）：`providers`（已过滤 enabled）、`activeId`、`onSelect`、`onOpenSettings`、`settingsActive`。

- [ ] **Step 1: 写失败测试**

Create `src/components/Sidebar.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";
import type { AiProvider } from "../state/types";

const providers: AiProvider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", enabled: true, logo: { type: "letter", color: "#10A37F" } },
  { id: "claude", name: "Claude", url: "https://claude.ai", enabled: true, logo: { type: "letter", color: "#D97757" } },
];

describe("Sidebar", () => {
  it("renders one button per provider plus settings", () => {
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByRole("button", { name: "ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });
  it("calls onSelect with provider id", async () => {
    const onSelect = vi.fn();
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={onSelect} onOpenSettings={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Claude" }));
    expect(onSelect).toHaveBeenCalledWith("claude");
  });
  it("calls onOpenSettings", async () => {
    const onOpenSettings = vi.fn();
    render(<Sidebar providers={providers} activeId="chatgpt" settingsActive={false} onSelect={() => {}} onOpenSettings={onOpenSettings} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm test src/components/Sidebar.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现 Sidebar**

Create `src/components/Sidebar.tsx`:
```tsx
import type { AiProvider } from "../state/types";
import { ProviderLogo } from "./ProviderLogo";
import { useT } from "../i18n";

interface Props {
  providers: AiProvider[];
  activeId: string | null;
  settingsActive: boolean;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ providers, activeId, settingsActive, onSelect, onOpenSettings }: Props) {
  const t = useT();
  return (
    <nav
      style={{
        width: "var(--sidebar-w)",
        height: "100%",
        background: "var(--bg-elev)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.name}
            title={p.name}
            onClick={() => onSelect(p.id)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 2,
              borderRadius: 10,
              outline: !settingsActive && activeId === p.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            <ProviderLogo name={p.name} logo={p.logo} size={40} />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={t("sidebar.settings")}
        title={t("sidebar.settings")}
        onClick={onOpenSettings}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 22,
          color: settingsActive ? "var(--accent)" : "var(--fg-muted)",
        }}
      >
        ⚙
      </button>
    </nav>
  );
}
```

- [ ] **Step 4: 运行验证通过**

Run: `pnpm test src/components/Sidebar.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat: Sidebar 侧栏组件"
```

---

## Task 9: App 外壳与 ContentArea 路由（暂不接原生 webview）

**Files:**
- Create: `src/components/ContentArea.tsx`
- Rewrite: `src/App.tsx`
- Rewrite: `src/main.tsx`
- Delete: `src/App.css`（不再使用）
- Test: `src/App.test.tsx`

此阶段内容区先放占位（AI 视图占位 div + 设置页）；原生 webview 在 Task 15 接入。`ContentArea` 暴露一个带 `data-content-area` 的容器（后续承载层用它测量矩形）。

- [ ] **Step 1: 写 App 失败测试**

Create `src/App.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "./state/defaults";

vi.mock("./state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: () => Promise.resolve(),
}));

import App from "./App";

beforeEach(() => {});

describe("App", () => {
  it("shows the active AI placeholder by default", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("content-area")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "ChatGPT" })).toBeInTheDocument();
  });

  it("opens settings when gear clicked", async () => {
    render(<App />);
    await waitFor(() => screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByText("基础配置")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm test src/App.test.tsx`
Expected: FAIL（App 尚未重写、ContentArea 不存在）。

- [ ] **Step 3: 实现 ContentArea**

Create `src/components/ContentArea.tsx`:
```tsx
import type { ReactNode } from "react";

interface Props {
  /** 设置页打开时渲染设置内容；否则渲染 AI 占位（原生 webview 覆盖其上） */
  showSettings: boolean;
  settings: ReactNode;
  emptyHint?: string;
}

export function ContentArea({ showSettings, settings, emptyHint }: Props) {
  return (
    <div style={{ flex: 1, height: "100%", position: "relative", overflow: "hidden" }}>
      {showSettings ? (
        <div style={{ height: "100%", overflow: "auto" }}>{settings}</div>
      ) : (
        <div
          data-content-area
          data-testid="content-area"
          style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-muted)" }}
        >
          {emptyHint ?? ""}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 重写 App.tsx**

Rewrite `src/App.tsx`:
```tsx
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "./state/SettingsContext";
import { Sidebar } from "./components/Sidebar";
import { ContentArea } from "./components/ContentArea";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { useT } from "./i18n";
import { resolveTheme, applyTheme, watchSystemTheme, systemPrefersDark } from "./lib/theme";

export default function App() {
  const { settings, ready } = useSettings();
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const enabledProviders = useMemo(() => settings.providers.filter((p) => p.enabled), [settings.providers]);

  // 默认激活第一个 enabled 的 provider
  useEffect(() => {
    if (!ready) return;
    if (activeId && enabledProviders.some((p) => p.id === activeId)) return;
    setActiveId(enabledProviders[0]?.id ?? null);
  }, [ready, enabledProviders, activeId]);

  // 应用主题（启动 + 主题设置变化 + 跟随系统时监听系统变化）
  useEffect(() => {
    const apply = () => applyTheme(resolveTheme(settings.theme, systemPrefersDark()));
    apply();
    return watchSystemTheme(() => {
      if (settings.theme === "system") apply();
    });
  }, [settings.theme]);

  if (!ready) return null;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sidebar
        providers={enabledProviders}
        activeId={activeId}
        settingsActive={showSettings}
        onSelect={(id) => {
          setActiveId(id);
          setShowSettings(false);
        }}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ContentArea
        showSettings={showSettings}
        settings={<SettingsPage />}
        emptyHint={enabledProviders.length === 0 ? t("common.empty") : ""}
      />
    </div>
  );
}
```

- [ ] **Step 5: 重写 main.tsx**

Rewrite `src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { SettingsProvider } from "./state/SettingsContext";
import { I18nProvider } from "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </I18nProvider>
  </React.StrictMode>
);
```

- [ ] **Step 6: 删除无用文件**

Run: `git rm src/App.css 2>/dev/null || rm -f src/App.css`
（若 `main.tsx` 之前引用了 `App.css`，已在重写中移除。）

- [ ] **Step 7: 运行验证通过**

Run: `pnpm test src/App.test.tsx`
Expected: PASS。（依赖 `SettingsPage`，由下一个任务实现——若此任务先行，临时建一个最小 `SettingsPage` 返回含「基础配置」文案的占位，再在 Task 10 完善。）

> 执行提示：Task 9 与 Task 10 有依赖。建议先做 Task 10 的 SettingsPage 骨架再跑 App 测试，或按上面提示放占位。

- [ ] **Step 8: 提交**

```bash
git add src/App.tsx src/main.tsx src/components/ContentArea.tsx src/App.test.tsx
git rm --cached src/App.css 2>/dev/null || true
git commit -m "feat: App 外壳与内容区路由"
```

---

## Task 10: SettingsPage 骨架 + BasicSettings

**Files:**
- Create: `src/pages/settings/SettingsPage.tsx`
- Create: `src/pages/settings/BasicSettings.tsx`
- Test: `src/pages/settings/BasicSettings.test.tsx`

BasicSettings 用 `useSettings()`。测试时用 `SettingsProvider` 包裹并 mock `settingsStore`。

- [ ] **Step 1: 写 BasicSettings 失败测试**

Create `src/pages/settings/BasicSettings.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
}));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { BasicSettings } from "./BasicSettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <BasicSettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => saveSettings.mockClear());

describe("BasicSettings", () => {
  it("lists providers as toggle-able enable chips", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Google AI Studio")).toBeInTheDocument();
  });

  it("toggles a provider enabled and persists", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await act(async () => {
      (await screen.findByRole("button", { name: /ChatGPT 启用状态/ })).click();
    });
    expect(saveSettings).toHaveBeenCalled();
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.providers.find((p: any) => p.id === "chatgpt").enabled).toBe(false);
  });

  it("toggles keepStateOnSwitch", async () => {
    setup();
    await waitFor(() => screen.getByRole("switch", { name: "切出保留状态" }));
    await userEvent.click(screen.getByRole("switch", { name: "切出保留状态" }));
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.keepStateOnSwitch).toBe(false);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm test src/pages/settings/BasicSettings.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现 BasicSettings**

Create `src/pages/settings/BasicSettings.tsx`:
```tsx
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { ProviderLogo } from "../../components/ProviderLogo";
import type { ThemeMode } from "../../state/types";

export function BasicSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();

  const setProviderEnabled = (id: string, enabled: boolean) => {
    updateSettings({
      providers: settings.providers.map((p) => (p.id === id ? { ...p, enabled } : p)),
    });
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
      <section>
        <h3>{t("basic.language")}</h3>
        <select value={settings.language} disabled>
          <option value="zh-CN">中文</option>
        </select>
      </section>

      <section>
        <h3>{t("basic.theme")}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateSettings({ theme: mode })}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: settings.theme === mode ? "var(--accent)" : "transparent",
                color: settings.theme === mode ? "#fff" : "var(--fg)",
                cursor: "pointer",
              }}
            >
              {t(`basic.theme.${mode}`)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>{t("basic.enabledAi")}</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {settings.providers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={`${p.name} 启用状态`}
              onClick={() => setProviderEnabled(p.id, !p.enabled)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                opacity: p.enabled ? 1 : 0.4,
                transition: "opacity 0.15s",
              }}
            >
              <ProviderLogo name={p.name} logo={p.logo} size={44} />
              <span style={{ fontSize: 12 }}>{p.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>{t("basic.keepState")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Toggle
            checked={settings.keepStateOnSwitch}
            label={t("basic.keepState")}
            onChange={(v) => updateSettings({ keepStateOnSwitch: v })}
          />
          <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>{t("basic.keepState.desc")}</span>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 实现 SettingsPage 骨架**

Create `src/pages/settings/SettingsPage.tsx`:
```tsx
import { useState } from "react";
import { useT } from "../../i18n";
import { BasicSettings } from "./BasicSettings";
import { AiConfigSettings } from "./AiConfigSettings";
import { HotkeySettings } from "./HotkeySettings";

type Tab = "basic" | "ai" | "hotkeys";

export function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("basic");
  const tabs: { key: Tab; label: string }[] = [
    { key: "basic", label: t("settings.basic") },
    { key: "ai", label: t("settings.ai") },
    { key: "hotkeys", label: t("settings.hotkeys") },
  ];
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 160, borderRight: "1px solid var(--border)", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 16, margin: "4px 8px 12px" }}>{t("settings.title")}</h2>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            style={{
              textAlign: "left",
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === tb.key ? "var(--bg-elev)" : "transparent",
              color: "var(--fg)",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "basic" && <BasicSettings />}
        {tab === "ai" && <AiConfigSettings />}
        {tab === "hotkeys" && <HotkeySettings />}
      </div>
    </div>
  );
}
```

> 依赖 `AiConfigSettings`（Task 11）与 `HotkeySettings`（Task 13）。若先跑测试，临时建返回 `null` 的占位组件，后续任务替换。

- [ ] **Step 5: 运行验证通过**

Run: `pnpm test src/pages/settings/BasicSettings.test.tsx`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/pages/settings/SettingsPage.tsx src/pages/settings/BasicSettings.tsx src/pages/settings/BasicSettings.test.tsx
git commit -m "feat: 设置页骨架与基础配置"
```

---

## Task 11: AiConfigSettings（手风琴式 AI 配置）

**Files:**
- Create: `src/pages/settings/AiConfigSettings.tsx`
- Test: `src/pages/settings/AiConfigSettings.test.tsx`

每个 AI 一行（logo + 名称），点击展开，可编辑名称/网址/启用（logo 本期只读展示「首字母+底色」，留接口待后续传图）。

- [ ] **Step 1: 写失败测试**

Create `src/pages/settings/AiConfigSettings.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
}));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { AiConfigSettings } from "./AiConfigSettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <AiConfigSettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => saveSettings.mockClear());

describe("AiConfigSettings", () => {
  it("renders a row per provider", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("ChatGPT")).toBeInTheDocument());
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("expands a row and edits the url", async () => {
    setup();
    await waitFor(() => screen.getByText("ChatGPT"));
    await userEvent.click(screen.getByRole("button", { name: /展开 ChatGPT/ }));
    const urlInput = await screen.findByLabelText("ChatGPT 官网地址");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://chat.openai.com");
    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.providers.find((p: any) => p.id === "chatgpt").url).toBe("https://chat.openai.com");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm test src/pages/settings/AiConfigSettings.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现 AiConfigSettings**

Create `src/pages/settings/AiConfigSettings.tsx`:
```tsx
import { useState } from "react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { ProviderLogo } from "../../components/ProviderLogo";
import { Toggle } from "../../components/Toggle";
import type { AiProvider } from "../../state/types";

export function AiConfigSettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);

  const patchProvider = (id: string, patch: Partial<AiProvider>) => {
    updateSettings({
      providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
      {settings.providers.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <button
              type="button"
              aria-label={`展开 ${p.name}`}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : p.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 12, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)" }}
            >
              <ProviderLogo name={p.name} logo={p.logo} size={28} />
              <span style={{ flex: 1, textAlign: "left" }}>{p.name}</span>
              <span style={{ color: "var(--fg-muted)" }}>{open ? "▲" : "▼"}</span>
            </button>
            {open && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--border)" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{t("ai.name")}</span>
                  <input
                    aria-label={`${p.name} 服务商名称`}
                    value={p.name}
                    onChange={(e) => patchProvider(p.id, { name: e.target.value })}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{t("ai.url")}</span>
                  <input
                    aria-label={`${p.name} 官网地址`}
                    value={p.url}
                    onChange={(e) => patchProvider(p.id, { url: e.target.value })}
                  />
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{t("ai.enabled")}</span>
                  <Toggle checked={p.enabled} label={`${p.name} ${t("ai.enabled")}`} onChange={(v) => patchProvider(p.id, { enabled: v })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 运行验证通过**

Run: `pnpm test src/pages/settings/AiConfigSettings.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/pages/settings/AiConfigSettings.tsx src/pages/settings/AiConfigSettings.test.tsx
git commit -m "feat: AI 配置（手风琴编辑名称/网址/启用）"
```

---

## Task 12: 快捷键纯逻辑（加速器构建/校验/显示/冲突）

**Files:**
- Create: `src/lib/hotkeys.ts`
- Test: `src/lib/hotkeys.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/hotkeys.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasConflict } from "./hotkeys";

function ev(parts: Partial<KeyboardEvent>): KeyboardEvent {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: "", key: "", ...parts } as KeyboardEvent;
}

describe("eventToAccelerator", () => {
  it("builds modifier + key", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, code: "KeyA", key: "a" }))).toBe("CommandOrControl+A");
  });
  it("orders modifiers as Ctrl, Alt, Shift", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyK", key: "k" }))).toBe("CommandOrControl+Alt+Shift+K");
  });
  it("maps Space and digits", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, code: "Space", key: " " }))).toBe("CommandOrControl+Space");
    expect(eventToAccelerator(ev({ ctrlKey: true, code: "Digit1", key: "1" }))).toBe("CommandOrControl+1");
  });
  it("returns null when only modifiers are pressed", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, altKey: true, code: "ControlLeft", key: "Control" }))).toBeNull();
  });
});

describe("isValidAccelerator", () => {
  it("requires a non-modifier key", () => {
    expect(isValidAccelerator("CommandOrControl+A")).toBe(true);
    expect(isValidAccelerator("CommandOrControl+Alt")).toBe(false);
    expect(isValidAccelerator("")).toBe(false);
  });
});

describe("formatAccelerator", () => {
  it("renders friendly label", () => {
    expect(formatAccelerator("CommandOrControl+Shift+Space")).toBe("Ctrl + Shift + Space");
  });
});

describe("hasConflict", () => {
  it("detects identical accelerators", () => {
    expect(hasConflict("CommandOrControl+Space", "CommandOrControl+Space")).toBe(true);
    expect(hasConflict("CommandOrControl+Space", "CommandOrControl+Shift+Space")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm test src/lib/hotkeys.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 hotkeys.ts**

Create `src/lib/hotkeys.ts`:
```ts
const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight",
]);

/** 从 code 推导加速器主键名；不支持的返回 null */
function codeToKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code; // F1..F12
  const map: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  return map[code] ?? null;
}

/** 键盘事件 -> Tauri 加速器字符串；仅按下修饰键时返回 null */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const key = codeToKey(e.code);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** 必须含至少一个非修饰键才有效 */
export function isValidAccelerator(acc: string): boolean {
  if (!acc) return false;
  const parts = acc.split("+");
  const last = parts[parts.length - 1];
  return last !== "CommandOrControl" && last !== "Alt" && last !== "Shift" && last !== "Super" && last.length > 0;
}

/** 友好显示（Windows 风格） */
export function formatAccelerator(acc: string): string {
  return acc
    .split("+")
    .map((p) => (p === "CommandOrControl" ? "Ctrl" : p === "Super" ? "Win" : p))
    .join(" + ");
}

export function hasConflict(a: string, b: string): boolean {
  return a.length > 0 && a === b;
}
```

- [ ] **Step 4: 运行验证通过**

Run: `pnpm test src/lib/hotkeys.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/hotkeys.ts src/lib/hotkeys.test.ts
git commit -m "feat: 快捷键加速器构建/校验/显示/冲突逻辑"
```

---

## Task 13: HotkeySettings 组件（捕获 UI）

**Files:**
- Create: `src/pages/settings/HotkeySettings.tsx`
- Test: `src/pages/settings/HotkeySettings.test.tsx`

行结构：左功能名，右捕获格。点击格子进入「监听」，键盘按下时用 `eventToAccelerator` 拼装，有效则保存到 store 并调用 `applyHotkeys` 命令（命令在 Task 17 实现；此处 mock）。

- [ ] **Step 1: 写失败测试**

Create `src/pages/settings/HotkeySettings.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "../../state/defaults";

const saveSettings = vi.fn().mockResolvedValue(undefined);
vi.mock("../../state/settingsStore", () => ({
  loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
  saveSettings: (s: unknown) => saveSettings(s),
}));
const applyHotkeys = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/commands", () => ({ applyHotkeys: () => applyHotkeys() }));

import { SettingsProvider } from "../../state/SettingsContext";
import { I18nProvider } from "../../i18n";
import { HotkeySettings } from "./HotkeySettings";

function setup() {
  return render(
    <I18nProvider>
      <SettingsProvider>
        <HotkeySettings />
      </SettingsProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  saveSettings.mockClear();
  applyHotkeys.mockClear();
});

describe("HotkeySettings", () => {
  it("shows current hotkeys formatted", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("快捷提问")).toBeInTheDocument());
    expect(screen.getByText("Ctrl + Space")).toBeInTheDocument();
    expect(screen.getByText("Ctrl + Shift + Space")).toBeInTheDocument();
  });

  it("captures a new hotkey on click + keydown", async () => {
    setup();
    await waitFor(() => screen.getByText("快捷提问"));
    await userEvent.click(screen.getByRole("button", { name: /设置 快捷提问 快捷键/ }));
    fireEvent.keyDown(window, { ctrlKey: true, altKey: true, code: "KeyJ", key: "j" });
    await waitFor(() => {
      const last = saveSettings.mock.calls.at(-1)![0];
      expect(last.hotkeys.quickAsk).toBe("CommandOrControl+Alt+J");
    });
    expect(applyHotkeys).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm test src/pages/settings/HotkeySettings.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现 HotkeySettings**

Create `src/pages/settings/HotkeySettings.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useSettings } from "../../state/SettingsContext";
import { useT } from "../../i18n";
import { eventToAccelerator, isValidAccelerator, formatAccelerator, hasConflict } from "../../lib/hotkeys";
import { applyHotkeys } from "../../lib/commands";
import type { Hotkeys } from "../../state/types";

type HotkeyName = keyof Hotkeys;

const ROWS: { name: HotkeyName; labelKey: string }[] = [
  { name: "quickAsk", labelKey: "hotkeys.quickAsk" },
  { name: "showMain", labelKey: "hotkeys.showMain" },
];

export function HotkeySettings() {
  const { settings, updateSettings } = useSettings();
  const t = useT();
  const [recording, setRecording] = useState<HotkeyName | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") {
        setRecording(null);
        return;
      }
      const acc = eventToAccelerator(e);
      if (acc && isValidAccelerator(acc)) {
        const nextHotkeys: Hotkeys = { ...settings.hotkeys, [recording]: acc };
        updateSettings({ hotkeys: nextHotkeys });
        void applyHotkeys();
        setRecording(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, settings.hotkeys, updateSettings]);

  const conflict = hasConflict(settings.hotkeys.quickAsk, settings.hotkeys.showMain);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
      {ROWS.map((row) => {
        const isRec = recording === row.name;
        return (
          <div key={row.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10 }}>
            <span>{t(row.labelKey)}</span>
            <button
              type="button"
              aria-label={`设置 ${t(row.labelKey)} 快捷键`}
              onClick={() => setRecording(row.name)}
              style={{
                minWidth: 160,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${isRec ? "var(--accent)" : "var(--border)"}`,
                background: "var(--bg-elev)",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              {isRec ? t("hotkeys.recording") : formatAccelerator(settings.hotkeys[row.name])}
            </button>
          </div>
        );
      })}
      {conflict && <span style={{ color: "#e05260", fontSize: 13 }}>{t("hotkeys.conflict")}</span>}
    </div>
  );
}
```

- [ ] **Step 4: 创建 commands.ts（含 applyHotkeys 占位，Task 17 补全实现细节）**

Create `src/lib/commands.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";

/** 通知 Rust 用最新设置重新注册全局快捷键 */
export async function applyHotkeys(): Promise<void> {
  await invoke("apply_hotkeys");
}

/** 显示并聚焦主窗口 */
export async function showMainWindow(): Promise<void> {
  await invoke("show_main_window");
}

/** 切换快捷提问窗显隐 */
export async function toggleQuickAsk(): Promise<void> {
  await invoke("toggle_quick_ask");
}

/** 设置快捷提问窗加载的 provider（传 url） */
export async function setQuickAskProvider(url: string): Promise<void> {
  await invoke("set_quick_ask_provider", { url });
}
```

- [ ] **Step 5: 运行验证通过**

Run: `pnpm test src/pages/settings/HotkeySettings.test.tsx`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/pages/settings/HotkeySettings.tsx src/pages/settings/HotkeySettings.test.tsx src/lib/commands.ts
git commit -m "feat: 快捷键设置捕获 UI 与命令封装"
```

---

## Task 14: AI webview 承载层核心 —— Rust 侧（移植已验证的 MVP 方案，手动验证）

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/webviews.rs`
- Modify: `src-tauri/src/lib.rs`

**背景**：本项目的多 webview 方案已在同目录 MVP（`../TestTauri/testgpt`）验证可行：Rust 侧用 `WebviewBuilder` + `window.add_child(...)` 加子 webview，`.auto_resize()` 自动跟随窗口缩放，`webview.show()/hide()/set_focus()` 切换，登录态默认持久化，且**无需额外 webview 权限**（创建在 Rust 侧）。本任务把该方案移植为 Anyask 的左侧栏布局。

> 关键常量：`SIDEBAR_WIDTH = 64.0`，必须与前端 CSS `--sidebar-w: 64px` 一致。AI webview 覆盖 `LogicalPosition(SIDEBAR_WIDTH, 0)` 到窗口右下角。

- [ ] **Step 1: Cargo 依赖（unstable + time 锁定）**

Modify `src-tauri/Cargo.toml` 的 `[dependencies]`：
```toml
tauri = { version = "2", features = ["unstable"] }
# 锁定 time < 0.3.48：0.3.48 经 cookie 0.18.1 触发 Tauri 依赖树 trait coherence 冲突（MVP 已踩坑）
time = "=0.3.47"
```

- [ ] **Step 2: 确认权限无需变更**

`src-tauri/capabilities/default.json` **不需要**新增 webview 权限（创建在 Rust 侧，不走 JS API）。保持 Task 3 的：
```json
"permissions": ["core:default", "opener:default", "store:default"]
```

- [ ] **Step 3: 实现 webviews.rs**

Create `src-tauri/src/webviews.rs`:
```rust
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

pub const SIDEBAR_WIDTH: f64 = 64.0; // 必须与前端 --sidebar-w 一致
const PREFIX: &str = "ai-";

pub fn label(id: &str) -> String {
    format!("{PREFIX}{id}")
}

/// 内容区（侧栏右侧）逻辑尺寸
fn content_size(window: &tauri::Window) -> tauri::Result<LogicalSize<f64>> {
    let scale = window.scale_factor()?;
    let inner = window.inner_size()?.to_logical::<f64>(scale);
    Ok(LogicalSize::new(
        (inner.width - SIDEBAR_WIDTH).max(1.0),
        inner.height.max(1.0),
    ))
}

/// 确保某 provider 的 webview 存在；不存在则创建（覆盖内容区，auto_resize 跟随窗口）
fn ensure(app: &AppHandle, id: &str, url: &str, visible: bool) -> Result<(), String> {
    if app.get_webview(&label(id)).is_some() {
        return Ok(());
    }
    let window = app.get_window("main").ok_or("main window not found")?;
    let size = content_size(&window).map_err(|e| e.to_string())?;
    let parsed = url.parse().map_err(|_| format!("invalid url: {url}"))?;
    let builder = WebviewBuilder::new(label(id), WebviewUrl::External(parsed))
        .auto_resize()
        .focused(visible);
    let webview = window
        .add_child(builder, LogicalPosition::new(SIDEBAR_WIDTH, 0.0), size)
        .map_err(|e| e.to_string())?;
    if !visible {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct ProviderArg {
    pub id: String,
    pub url: String,
}

/// 同步 AI webview 现状到期望：
/// - 为每个 enabled provider 确保存在
/// - active 显示并聚焦，其余按 keep_state 隐藏(true)或销毁(false)
/// - 不在 enabled 列表里的既有 AI webview 一律销毁
#[tauri::command]
pub async fn sync_ai_webviews(
    app: AppHandle,
    providers: Vec<ProviderArg>,
    active_id: Option<String>,
    keep_state: bool,
) -> Result<(), String> {
    let enabled_labels: std::collections::HashSet<String> =
        providers.iter().map(|p| label(&p.id)).collect();

    for (lbl, wv) in app.webviews() {
        if lbl.starts_with(PREFIX) && !enabled_labels.contains(&lbl) {
            let _ = wv.close();
        }
    }

    for p in &providers {
        let is_active = active_id.as_deref() == Some(p.id.as_str());
        if is_active {
            ensure(&app, &p.id, &p.url, true)?;
            if let Some(wv) = app.get_webview(&label(&p.id)) {
                wv.show().map_err(|e| e.to_string())?;
                wv.set_focus().map_err(|e| e.to_string())?;
            }
        } else if keep_state {
            ensure(&app, &p.id, &p.url, false)?;
            if let Some(wv) = app.get_webview(&label(&p.id)) {
                wv.hide().map_err(|e| e.to_string())?;
            }
        } else if let Some(wv) = app.get_webview(&label(&p.id)) {
            let _ = wv.close();
        }
    }
    Ok(())
}

/// 隐藏全部 AI webview（打开设置时用）
#[tauri::command]
pub async fn hide_ai_webviews(app: AppHandle) -> Result<(), String> {
    for (lbl, wv) in app.webviews() {
        if lbl.starts_with(PREFIX) {
            let _ = wv.hide();
        }
    }
    Ok(())
}
```

- [ ] **Step 4: 在 lib.rs 注册命令**

Modify `src-tauri/src/lib.rs`：声明 `mod webviews;`，把两个命令加入 `invoke_handler`（与现有命令并列）：
```rust
mod webviews;
// invoke_handler 中追加：
//   webviews::sync_ai_webviews,
//   webviews::hide_ai_webviews
```

- [ ] **Step 5: 编译检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过（首次因 unstable 拉取 wry/webview 依赖，编译较久）。

- [ ] **Step 6: 手动验证核心（de-risk）**

Run: `pnpm tauri dev`，在主窗口开发者工具控制台执行：
```js
const { invoke } = await import("@tauri-apps/api/core");
await invoke("sync_ai_webviews", {
  providers: [{ id: "chatgpt", url: "https://chatgpt.com" }, { id: "claude", url: "https://claude.ai" }],
  activeId: "chatgpt",
  keepState: true,
});
```
Expected：
- 主窗口右侧(x≥64)出现 ChatGPT，左侧 64px 仍是 React 外壳。
- 再执行一次、把 `activeId` 改为 `"claude"` → 切到 Claude，ChatGPT 隐藏但保留。
- 拖动窗口改变大小 → webview 自动跟随缩放（`auto_resize` 生效，无需手动重定位）。
- 登录 ChatGPT 后重启应用再执行 → 仍是登录态。
- 执行 `await invoke("hide_ai_webviews")` → AI webview 全部隐藏，露出 React 外壳。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/webviews.rs src-tauri/src/lib.rs
git commit -m "feat: AI webview 承载层核心（Rust add_child + auto_resize）"
```

> **GATE**：若 `auto_resize` 在左侧栏(x 偏移)布局下缩放异常（位置错位），降级：去掉 `.auto_resize()`，改为前端监听 resize 调一个 `reposition_ai_webviews` 命令（用 `set_position`/`set_size` 按 `content_size` 重新摆放）。其余逻辑不变。

---

## Task 15: 主界面接线承载层（前端调用 Rust 命令，手动验证）

**Files:**
- Modify: `src/lib/commands.ts`（新增 AI webview 命令封装）
- Modify: `src/App.tsx`（状态变化时调用命令）
- Modify: `src/App.test.tsx`（mock 命令）

承载层在 Rust 侧（Task 14）。前端只需在 (enabledProviders, activeId, keepState, showSettings) 变化时调用命令。**无需**测量矩形或监听 resize（`auto_resize` 已处理）。

- [ ] **Step 1: commands.ts 新增封装**

Modify `src/lib/commands.ts`，在文件顶部补充类型导入并追加两个函数：
```ts
import type { AiProvider } from "../state/types";

/** 同步 AI webview：创建/显示/隐藏/销毁 */
export async function syncAiWebviews(
  providers: AiProvider[],
  activeId: string | null,
  keepState: boolean
): Promise<void> {
  await invoke("sync_ai_webviews", {
    providers: providers.map((p) => ({ id: p.id, url: p.url })),
    activeId,
    keepState,
  });
}

/** 隐藏全部 AI webview（打开设置时） */
export async function hideAiWebviews(): Promise<void> {
  await invoke("hide_ai_webviews");
}
```

- [ ] **Step 2: App 中接线**

Modify `src/App.tsx`：导入区追加：
```tsx
import { syncAiWebviews, hideAiWebviews } from "./lib/commands";
```
在组件内、主题 effect 之后追加承载层同步 effect：
```tsx
  // 同步 AI webview（Rust 侧承载；auto_resize 处理缩放，无需测矩形）
  useEffect(() => {
    if (!ready) return;
    if (showSettings) {
      void hideAiWebviews();
      return;
    }
    void syncAiWebviews(enabledProviders, activeId, settings.keepStateOnSwitch);
  }, [ready, showSettings, activeId, enabledProviders, settings.keepStateOnSwitch]);
```
（不需要 `contentRef`/`readRect`/resize 监听；`ContentArea` 维持 Task 9 的版本即可。）

- [ ] **Step 3: 更新 App 测试 mock**

App 现在从 `./lib/commands` 导入。`src/App.test.tsx` 顶部（`import App` 之前）加 mock：
```tsx
vi.mock("./lib/commands", () => ({
  syncAiWebviews: vi.fn().mockResolvedValue(undefined),
  hideAiWebviews: vi.fn().mockResolvedValue(undefined),
}));
```

- [ ] **Step 4: 跑前端单测**

Run: `pnpm test`
Expected: 全绿。

- [ ] **Step 5: 手动验证主流程**

Run: `pnpm tauri dev`
操作与预期：
1. 启动后默认显示第一个 enabled（ChatGPT），覆盖内容区(x≥64)，左栏可见。
2. 点 Claude → 切换；点回 ChatGPT → 保留之前状态（keepState 默认开）。
3. 打开设置 → AI webview 全部隐藏，露出设置页；点某 AI → 恢复显示。
4. 基础配置里关掉 Claude → 侧栏不再显示，其 webview 被销毁。
5. 把"切出保留状态"关掉后切换 AI → 切走的 AI 被销毁，切回时重新加载。
6. 改变窗口大小 → 当前 webview 自动跟随（auto_resize）。

- [ ] **Step 6: 提交**

```bash
git add src/lib/commands.ts src/App.tsx src/App.test.tsx
git commit -m "feat: 主界面接线 AI webview 承载层"
```

---

## Task 16: 系统托盘与关闭到托盘（手动验证）

**Files:**
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`（确保有托盘所需配置）
- Modify: `src-tauri/Cargo.toml`（tray-icon 特性）

- [ ] **Step 1: 开启 tray-icon 特性**

Modify `src-tauri/Cargo.toml` 的 tauri 依赖特性，加 `"tray-icon"`：
```toml
tauri = { version = "2", features = ["unstable", "tray-icon"] }
```

- [ ] **Step 2: 实现 tray.rs**

Create `src-tauri/src/tray.rs`:
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn show_main(app: &AppHandle) {
    // 多 webview 模式下 main 是承载多个 webview 的 Window，用 get_window 做窗口级操作
    if let Some(win) = app.get_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
```

- [ ] **Step 3: 在 lib.rs 装配托盘并拦截关闭**

Modify `src-tauri/src/lib.rs`：声明模块、setup 里建托盘、给主窗口加关闭拦截（隐藏代替退出）：
```rust
mod tray;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            tray::build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: 编译检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过（无 error）。

- [ ] **Step 5: 手动验证**

Run: `pnpm tauri dev`
操作与预期：
1. 任务栏/托盘区出现应用图标。
2. 点主窗口关闭按钮(X) → 窗口隐藏，应用**未退出**（托盘图标还在）。
3. 右键托盘 → 「显示主界面」→ 窗口重新出现并聚焦。
4. 右键托盘 → 「退出」→ 应用真正退出。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/tray.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "feat: 系统托盘与关闭最小化到托盘"
```

---

## Task 17: 全局快捷键（Rust 注册 + apply_hotkeys 命令）（手动验证）

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/settings_io.rs`
- Create: `src-tauri/src/shortcuts.rs`
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 加 global-shortcut 插件依赖**

Modify `src-tauri/Cargo.toml`：
```toml
tauri-plugin-global-shortcut = "2"
```

- [ ] **Step 2: 加权限**

Modify `src-tauri/capabilities/default.json` 的 `permissions`，加 `"global-shortcut:default"`。

- [ ] **Step 3: 实现 settings_io.rs（Rust 侧读 store）**

Create `src-tauri/src/settings_io.rs`:
```rust
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Deserialize)]
pub struct Hotkeys {
    #[serde(rename = "quickAsk")]
    pub quick_ask: String,
    #[serde(rename = "showMain")]
    pub show_main: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StoredSettings {
    pub hotkeys: Hotkeys,
    #[serde(rename = "quickAskProviderId")]
    pub quick_ask_provider_id: String,
    pub providers: Vec<ProviderLite>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderLite {
    pub id: String,
    pub url: String,
}

const DEFAULT_QUICK_ASK: &str = "CommandOrControl+Space";
const DEFAULT_SHOW_MAIN: &str = "CommandOrControl+Shift+Space";

/// 读取设置；store 不存在或解析失败时返回默认快捷键
pub fn read_settings(app: &AppHandle) -> StoredSettings {
    let fallback = StoredSettings {
        hotkeys: Hotkeys { quick_ask: DEFAULT_QUICK_ASK.into(), show_main: DEFAULT_SHOW_MAIN.into() },
        quick_ask_provider_id: "chatgpt".into(),
        providers: vec![ProviderLite { id: "chatgpt".into(), url: "https://chatgpt.com".into() }],
    };
    let Ok(store) = app.store("settings.json") else { return fallback };
    let Some(value) = store.get("settings") else { return fallback };
    serde_json::from_value::<StoredSettings>(value).unwrap_or(fallback)
}

/// 取快捷提问窗要加载的 url
pub fn quick_ask_url(s: &StoredSettings) -> String {
    s.providers
        .iter()
        .find(|p| p.id == s.quick_ask_provider_id)
        .map(|p| p.url.clone())
        .unwrap_or_else(|| "https://chatgpt.com".into())
}
```

- [ ] **Step 4: 实现 shortcuts.rs**

Create `src-tauri/src/shortcuts.rs`:
```rust
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::quick_ask;
use crate::settings_io::read_settings;
use crate::tray::show_main;

/// 注销全部并按当前设置重新注册两个全局快捷键
pub fn register_from_settings(app: &AppHandle) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let s = read_settings(app);

    if let Ok(sc) = s.hotkeys.quick_ask.parse::<Shortcut>() {
        let _ = gs.on_shortcut(sc, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                quick_ask::toggle(app);
            }
        });
    }
    if let Ok(sc) = s.hotkeys.show_main.parse::<Shortcut>() {
        let _ = gs.on_shortcut(sc, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                show_main(app);
            }
        });
    }
}
```

- [ ] **Step 5: 实现 commands.rs**

Create `src-tauri/src/commands.rs`:
```rust
use tauri::AppHandle;

use crate::quick_ask;
use crate::shortcuts;
use crate::tray;

#[tauri::command]
pub fn apply_hotkeys(app: AppHandle) {
    shortcuts::register_from_settings(&app);
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    tray::show_main(&app);
}

#[tauri::command]
pub fn toggle_quick_ask(app: AppHandle) {
    quick_ask::toggle(&app);
}

#[tauri::command]
pub fn set_quick_ask_provider(app: AppHandle, url: String) {
    quick_ask::set_url(&app, url);
}
```

- [ ] **Step 6: 装配到 lib.rs**

Modify `src-tauri/src/lib.rs`：声明模块、注册插件、setup 里注册快捷键、扩展 invoke_handler：
```rust
mod commands;
mod quick_ask;
mod settings_io;
mod shortcuts;
mod state;
mod tray;

// ... 在 Builder 链上：
//   .plugin(tauri_plugin_global_shortcut::Builder::new().build())
// setup 内追加： shortcuts::register_from_settings(app.handle());
// invoke_handler 改为：
//   tauri::generate_handler![
//     commands::apply_hotkeys,
//     commands::show_main_window,
//     commands::toggle_quick_ask,
//     commands::set_quick_ask_provider
//   ]
```
（`greet` 可删除；`state` / `quick_ask` 模块由 Task 18 创建，本任务先建空的 `state.rs`：`pub struct AppState;`，并临时在 `quick_ask.rs` 放空函数 `pub fn toggle(_:&tauri::AppHandle){}`、`pub fn set_url(_:&tauri::AppHandle,_:String){}`，Task 18 再补全。）

- [ ] **Step 7: 编译检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过。

- [ ] **Step 8: 手动验证**

Run: `pnpm tauri dev`
操作与预期：
1. 按 `Ctrl+Shift+Space` → 主窗口显示/聚焦（即使刚才隐藏到托盘）。
2. 进设置 → 快捷键 → 把「显示主界面」改成 `Ctrl+Alt+M`，立即生效（旧键失效、新键可唤起）。
3. （`Ctrl+Space` 触发 quick-ask 在 Task 18 后才有可见效果。）

- [ ] **Step 9: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/ src-tauri/capabilities/default.json
git commit -m "feat: 全局快捷键注册与 apply_hotkeys 命令"
```

---

## Task 18: 快捷提问悬浮窗（手动验证）

**Files:**
- Create: `src-tauri/src/state.rs`（替换占位）
- Rewrite: `src-tauri/src/quick_ask.rs`（替换占位）
- Modify: `src-tauri/src/lib.rs`（管理 AppState）
- Modify: `src/lib/commands.ts` 已就绪（Task 13），在 BasicSettings/AiConfig 改 quickAskProviderId 时调用 `setQuickAskProvider`

快捷提问窗：无边框、置顶、不进任务栏、400×600、屏幕中下居中、加载默认 provider url。首次按键创建，再次按键切换显隐。

- [ ] **Step 1: 实现 state.rs**

Create/replace `src-tauri/src/state.rs`:
```rust
use std::sync::Mutex;

/// 快捷提问窗当前应加载的 url（运行时可被设置覆盖）
#[derive(Default)]
pub struct AppState {
    pub quick_ask_url: Mutex<Option<String>>,
}
```

- [ ] **Step 2: 实现 quick_ask.rs**

Create/replace `src-tauri/src/quick_ask.rs`:
```rust
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::settings_io::{quick_ask_url, read_settings};
use crate::state::AppState;

const LABEL: &str = "quick-ask";
const WIDTH: f64 = 400.0;
const HEIGHT: f64 = 600.0;

fn target_url(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    if let Some(url) = state.quick_ask_url.lock().unwrap().clone() {
        return url;
    }
    quick_ask_url(&read_settings(app))
}

/// 切换显隐；不存在则创建
pub fn toggle(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => {
                let _ = win.show();
                let _ = win.set_focus();
                center_bottom(&win);
            }
        }
        return;
    }
    let url = target_url(app);
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url.parse().unwrap()))
        .title("快捷提问")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build();
    if let Ok(win) = win {
        center_bottom(&win);
        let _ = win.set_focus();
    }
}

/// 设置 url（下次创建生效；若已存在则导航）
pub fn set_url(app: &AppHandle, url: String) {
    let state = app.state::<AppState>();
    *state.quick_ask_url.lock().unwrap() = Some(url.clone());
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.eval(&format!("window.location.replace('{}')", url.replace('\'', "\\'")));
    }
}

/// 定位到屏幕中下居中
fn center_bottom(win: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = win.current_monitor() {
        let screen = monitor.size();
        let scale = monitor.scale_factor();
        let w = (WIDTH * scale) as i32;
        let h = (HEIGHT * scale) as i32;
        let x = (screen.width as i32 - w) / 2;
        let y = (screen.height as i32 - h) - (screen.height as i32 / 12); // 偏下，留出底部边距
        let _ = win.set_position(tauri::PhysicalPosition::new(x.max(0), y.max(0)));
    }
}
```

- [ ] **Step 3: 在 lib.rs 注册 AppState**

Modify `src-tauri/src/lib.rs`：在 Builder 链上加 `.manage(state::AppState::default())`。

- [ ] **Step 4: AI 配置变更时同步 quick-ask 默认 provider**

在前端：设计「快捷提问默认 AI」选择放在 BasicSettings 或 AiConfig。本期最小实现——在 BasicSettings 末尾加一个下拉选择 `quickAskProviderId`，变更时 `updateSettings` 并调用 `setQuickAskProvider(url)`。

Modify `src/pages/settings/BasicSettings.tsx`，在 keepState section 之后追加：
```tsx
      <section>
        <h3>快捷提问默认 AI</h3>
        <select
          value={settings.quickAskProviderId}
          onChange={(e) => {
            const id = e.target.value;
            const url = settings.providers.find((p) => p.id === id)?.url ?? "";
            updateSettings({ quickAskProviderId: id });
            void import("../../lib/commands").then((m) => m.setQuickAskProvider(url));
          }}
        >
          {settings.providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </section>
```
（对应 i18n 文案可后续补；此处直接中文占位可接受。）

- [ ] **Step 5: 编译检查**

Run: `cd src-tauri && cargo check`
Expected: 编译通过。

- [ ] **Step 6: 手动验证**

Run: `pnpm tauri dev`
操作与预期：
1. 按 `Ctrl+Space` → 屏幕中下出现无边框小窗（400×600），加载默认 AI（ChatGPT），无任务栏条目，置顶。
2. 再按 `Ctrl+Space` → 小窗隐藏；再按 → 再次显示。
3. 小窗内站点已是登录态（与主程序共享）。页面足够窄，AI 站点自动隐藏其会话侧栏（符合参考图）。
4. 设置里把「快捷提问默认 AI」改为 Claude → 关掉小窗再唤出（或当场导航）变为 Claude。

- [ ] **Step 7: 提交**

```bash
git add src-tauri/src/state.rs src-tauri/src/quick_ask.rs src-tauri/src/lib.rs src/pages/settings/BasicSettings.tsx
git commit -m "feat: 快捷提问悬浮窗"
```

---

## Task 19: 窗口尺寸配置与端到端核对

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `index.html`（标题）

- [ ] **Step 1: 配置主窗口默认尺寸**

Modify `src-tauri/tauri.conf.json` 的 `app.windows[0]`：
```json
{
  "label": "main",
  "title": "Anyask",
  "width": 1000,
  "height": 666,
  "minWidth": 900,
  "minHeight": 600
}
```
（确保 `label` 为 `"main"`，与 Rust 中 `get_webview_window("main")` 一致。）

- [ ] **Step 2: 更新页面标题**

Modify `index.html` 的 `<title>` 为 `Anyask`。

- [ ] **Step 3: 全量前端测试**

Run: `pnpm test`
Expected: 全绿。

- [ ] **Step 4: Rust 编译**

Run: `cd src-tauri && cargo check`
Expected: 通过。

- [ ] **Step 5: 端到端手动核对清单**

Run: `pnpm tauri dev`，逐项确认：
- [ ] 启动窗口 1000×666，标题 Anyask，默认显示第一个启用的 AI。
- [ ] 侧栏切换三个 AI，登录态与会话状态各自独立保留（keepState 开）。
- [ ] 设置 → 基础：切主题（浅/深/跟随系统）外壳即时变化；切「保留状态」为关后，切走再回来的 AI 会重载。
- [ ] 设置 → 基础：点 AI 图标切换启用，半透明=禁用，侧栏随之增减。
- [ ] 设置 → AI 配置：展开改名称/网址即时生效（改网址后该 AI 重载到新址）。
- [ ] 设置 → 快捷键：点格子按组合捕获并生效；纯修饰键不被接受；两键相同时提示冲突。
- [ ] 关闭主窗 → 隐藏到托盘；托盘「显示主界面」恢复；「退出」真正退出。
- [ ] `Ctrl+Shift+Space` 唤起主界面；`Ctrl+Space` 唤起/隐藏快捷提问窗。
- [ ] 快捷提问窗：无边框、置顶、中下居中、共享登录态。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/tauri.conf.json index.html
git commit -m "feat: 窗口尺寸配置与第一阶段端到端核对"
```

---

## 已知后续事项（不在本期）

- 真实 logo 资源接入（`ProviderLogo` 已支持 `type:"image"`，届时把 provider.logo 改为图片 src）。
- 新增/删除自定义 provider 的 UI。
- 多语言实际翻译（i18n 结构已就绪，加 `en.ts` 等并让 language 生效）。
- `Ctrl+Space` 与中文输入法冲突时的引导提示。
- 多 webview unstable 特性的稳定性观察；若毛刺不可接受，启用方案 B（多窗口）替换 `webviews.rs`。

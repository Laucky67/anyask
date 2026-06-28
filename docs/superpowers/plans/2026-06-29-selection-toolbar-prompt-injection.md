# Selection Toolbar Prompt Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selection toolbar's Explain, Translate, and Summarize buttons generate prompt text from the captured selection and fill that prompt into the quick-ask AI WebView without sending it.

**Architecture:** React owns selection action configuration, prompt templates, language mapping, and prompt rendering. Rust owns quick-ask window lifecycle, deferred WebView-safe showing, prompt injection into `quick-ask-ai`, and cancellation of stale injection attempts through a generation token.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vitest, Rust, `serde_json`, WebView `eval`.

---

## Scope Check

This plan implements one subsystem: selection-toolbar prompt actions flowing into quick-ask. It does not implement custom-button management UI, built-in template editing, auto-send, per-provider DOM adapters, or new conversation creation. The plan keeps those future features compatible by storing prompt rendering in frontend action code and keeping Rust unaware of action configuration.

## File Structure

- Modify `src/state/selectionActions.ts`: add prompt template support, language-name mapping, and prompt rendering helpers.
- Modify `src/state/selectionActions.test.ts`: cover templates, language mapping, and prompt rendering.
- Modify `src/lib/commands.ts`: add `showQuickAskWithPrompt(prompt: string | null)`.
- Modify `src/pages/selection-toolbar/SelectionToolbar.tsx`: read `settings.language`, render prompts, and call prompt-aware quick-ask command.
- Modify `src/pages/selection-toolbar/SelectionToolbar.test.tsx`: cover prompt injection calls, empty-selection cancellation, and copy behavior.
- Modify `src-tauri/src/state.rs`: add `quick_ask_prompt_generation`.
- Modify `src-tauri/src/quick_ask.rs`: add prompt generation helpers, JS builder, deferred prompt injection, and retry when `quick-ask-ai` is not yet registered.
- Modify `src-tauri/src/commands.rs`: expose `show_quick_ask_with_prompt`.
- Modify `src-tauri/src/lib.rs`: register the new Tauri command.
- No capability file change is expected because existing custom commands are invoked without command-specific capability entries; verify this remains true during build.

## Task 0: Branch And Baseline Guard

**Files:**
- Read: git metadata only
- Test: existing test suites

- [ ] **Step 1: Confirm branch**

Run:

```powershell
git branch --show-current
```

Expected:

```text
feature/selection-toolbar-prompt-injection
```

- [ ] **Step 2: Confirm clean implementation workspace**

Run:

```powershell
git status --short
```

Expected before implementation begins: either clean output, or only already-approved docs changes from planning. There must be no unreviewed source changes.

- [ ] **Step 3: Run frontend baseline**

Run:

```powershell
npm test
```

Expected: current frontend tests pass before feature work starts. If they fail, record the failing test names and stop before writing feature tests.

- [ ] **Step 4: Run Rust baseline**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: current Rust tests pass before feature work starts. If they fail, record the failing test names and stop before writing feature tests.

## Task 1: Frontend Prompt Templates And Rendering

**Files:**
- Modify: `src/state/selectionActions.test.ts`
- Modify: `src/state/selectionActions.ts`

- [ ] **Step 1: Write failing tests for prompt templates and rendering**

Replace the import in `src/state/selectionActions.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  BUILTIN_SELECTION_ACTIONS,
  ICON_REGISTRY,
  buildSelectionPrompt,
  enabledActions,
  languageName,
} from "./selectionActions";
```

Add this helper and test block after the existing `BUILTIN_SELECTION_ACTIONS` tests:

```ts
function builtinAction(id: string) {
  const action = BUILTIN_SELECTION_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`missing builtin action: ${id}`);
  return action;
}

describe("selection prompt templates", () => {
  it("defines prompt templates for AI actions and leaves copy without one", () => {
    expect(builtinAction("explain").promptTemplate).toBe("{{selection}}\n\n解释上文");
    expect(builtinAction("translate").promptTemplate).toBe("{{selection}}\n\n翻译上文至{{targetLanguage}}");
    expect(builtinAction("summarize").promptTemplate).toBe("{{selection}}\n\n总结上文");
    expect(builtinAction("copy").promptTemplate).toBeUndefined();
  });

  it("maps zh-CN to Simplified Chinese as the target language name", () => {
    expect(languageName("zh-CN")).toBe("简体中文");
  });

  it("renders explain, translate, and summarize prompts while preserving selection text", () => {
    const selection = "  function demo() {\n    return \"ok\";\n  }  ";

    expect(buildSelectionPrompt(builtinAction("explain"), selection, "zh-CN")).toBe(
      `${selection}\n\n解释上文`
    );
    expect(buildSelectionPrompt(builtinAction("translate"), selection, "zh-CN")).toBe(
      `${selection}\n\n翻译上文至简体中文`
    );
    expect(buildSelectionPrompt(builtinAction("summarize"), selection, "zh-CN")).toBe(
      `${selection}\n\n总结上文`
    );
  });

  it("returns null for actions without a prompt template", () => {
    expect(buildSelectionPrompt(builtinAction("copy"), "hello", "zh-CN")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail for missing exports/properties**

Run:

```powershell
npm test -- src/state/selectionActions.test.ts
```

Expected: FAIL because `buildSelectionPrompt`, `languageName`, and `promptTemplate` do not exist yet.

- [ ] **Step 3: Implement prompt templates and rendering helpers**

Update `src/state/selectionActions.ts` to import `Language`, extend `SelectionAction`, add prompt templates, and add rendering helpers:

```ts
import { BookOpen, Languages, AlignLeft, Copy, type LucideIcon } from "lucide-react";
import type { Language } from "./types";

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
  promptTemplate?: string; // 内置/自建按钮发给 AI 的提示词模板
}

export const BUILTIN_SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: "explain",
    source: "builtin",
    kind: "explain",
    labelKey: "selection.explain",
    icon: "BookOpen",
    enabled: true,
    order: 1,
    promptTemplate: "{{selection}}\n\n解释上文",
  },
  {
    id: "translate",
    source: "builtin",
    kind: "translate",
    labelKey: "selection.translate",
    icon: "Languages",
    enabled: true,
    order: 2,
    promptTemplate: "{{selection}}\n\n翻译上文至{{targetLanguage}}",
  },
  {
    id: "summarize",
    source: "builtin",
    kind: "summarize",
    labelKey: "selection.summarize",
    icon: "AlignLeft",
    enabled: true,
    order: 3,
    promptTemplate: "{{selection}}\n\n总结上文",
  },
  { id: "copy", source: "builtin", kind: "copy", labelKey: "selection.copy", icon: "Copy", enabled: true, order: 4 },
];

/** 按字符串名取 lucide 组件（为未来自建按钮选图标铺路） */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  BookOpen,
  Languages,
  AlignLeft,
  Copy,
};

const TARGET_LANGUAGE_NAMES: Record<Language, string> = {
  "zh-CN": "简体中文",
};

export function languageName(language: Language): string {
  return TARGET_LANGUAGE_NAMES[language];
}

export function buildSelectionPrompt(
  action: SelectionAction,
  selection: string,
  language: Language
): string | null {
  if (!action.promptTemplate) return null;
  return action.promptTemplate
    .replace(/\{\{selection\}\}/g, selection)
    .replace(/\{\{targetLanguage\}\}/g, languageName(language));
}

/** 取启用的动作，按 order 升序 */
export function enabledActions(actions: SelectionAction[]): SelectionAction[] {
  return actions.filter((a) => a.enabled).sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 4: Run prompt-rendering tests and verify they pass**

Run:

```powershell
npm test -- src/state/selectionActions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add src/state/selectionActions.ts src/state/selectionActions.test.ts
git commit -m "feat: add selection prompt templates"
```

Expected: commit succeeds with only these two files.

## Task 2: Toolbar Wiring And Frontend Command Wrapper

**Files:**
- Modify: `src/lib/commands.ts`
- Modify: `src/pages/selection-toolbar/SelectionToolbar.test.tsx`
- Modify: `src/pages/selection-toolbar/SelectionToolbar.tsx`

- [ ] **Step 1: Write failing toolbar tests**

In `src/pages/selection-toolbar/SelectionToolbar.test.tsx`, change the Testing Library import to:

```ts
import { render, screen, waitFor } from "@testing-library/react";
```

Add a mock for the prompt-aware command near the existing command mocks:

```ts
const showQuickAskWithPrompt = vi.fn().mockResolvedValue(undefined);
```

Update the `../../lib/commands` mock to expose the new wrapper:

```ts
vi.mock("../../lib/commands", () => ({
  placeAndShowSelectionToolbar: (w: number, h: number) => placeAndShowSelectionToolbar(w, h),
  hideSelectionToolbar: () => hideSelectionToolbar(),
  getPendingSelectionShow: () => getPendingSelectionShow(),
  copySelection: () => copySelection(),
  showQuickAsk: () => showQuickAsk(),
  showQuickAskWithPrompt: (prompt: string | null) => showQuickAskWithPrompt(prompt),
}));
```

Add a settings mock so `SelectionToolbar` can read `settings.language`:

```ts
vi.mock("../../state/SettingsContext", () => ({
  useSettings: () => ({
    settings: { language: "zh-CN" },
    ready: true,
    updateSettings: () => Promise.resolve(),
  }),
}));
```

Update `beforeEach` to reset the new mock:

```ts
beforeEach(() => {
  for (const m of [placeAndShowSelectionToolbar, hideSelectionToolbar, copySelection, showQuickAsk, showQuickAskWithPrompt]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
  getPendingSelectionShow.mockReset().mockResolvedValue({ text: "", x: 0, y: 0, show: false });
});
```

Replace the existing `"explain button opens quick-ask then hides"` test with:

```ts
it("explain button opens quick-ask without prompt when captured text is blank", async () => {
  getPendingSelectionShow.mockResolvedValue({ text: "   \n", x: 0, y: 0, show: true });
  setup();
  await waitFor(() => expect(placeAndShowSelectionToolbar).toHaveBeenCalled());

  await userEvent.click(screen.getByRole("button", { name: "解释" }));

  expect(showQuickAskWithPrompt).toHaveBeenCalledWith(null);
  expect(showQuickAsk).not.toHaveBeenCalled();
  expect(hideSelectionToolbar).toHaveBeenCalled();
  expect(copySelection).not.toHaveBeenCalled();
});
```

Add this test:

```ts
it("translate button sends a rendered prompt to quick-ask when captured text is non-empty", async () => {
  getPendingSelectionShow.mockResolvedValue({ text: "hello\nworld", x: 0, y: 0, show: true });
  setup();
  await waitFor(() => expect(placeAndShowSelectionToolbar).toHaveBeenCalled());

  await userEvent.click(screen.getByRole("button", { name: "翻译" }));

  expect(showQuickAskWithPrompt).toHaveBeenCalledWith("hello\nworld\n\n翻译上文至简体中文");
  expect(showQuickAsk).not.toHaveBeenCalled();
  expect(hideSelectionToolbar).toHaveBeenCalled();
  expect(copySelection).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run toolbar tests and verify they fail**

Run:

```powershell
npm test -- src/pages/selection-toolbar/SelectionToolbar.test.tsx
```

Expected: FAIL because `showQuickAskWithPrompt` is not exported and `SelectionToolbar` still calls `showQuickAsk()`.

- [ ] **Step 3: Add frontend command wrapper**

In `src/lib/commands.ts`, add this function immediately after `showQuickAsk()`:

```ts
/** 打开快捷提问窗口并注入 prompt；prompt=null 表示只打开并取消旧注入 */
export async function showQuickAskWithPrompt(prompt: string | null): Promise<void> {
  await invoke("show_quick_ask_with_prompt", { prompt });
}
```

- [ ] **Step 4: Wire `SelectionToolbar` to prompt rendering**

In `src/pages/selection-toolbar/SelectionToolbar.tsx`, update imports:

```ts
import {
  BUILTIN_SELECTION_ACTIONS,
  ICON_REGISTRY,
  buildSelectionPrompt,
  enabledActions,
  type SelectionAction,
} from "../../state/selectionActions";
import { useSettings } from "../../state/SettingsContext";
import {
  placeAndShowSelectionToolbar,
  hideSelectionToolbar,
  getPendingSelectionShow,
  copySelection,
  showQuickAskWithPrompt,
} from "../../lib/commands";
```

Inside `SelectionToolbar`, read settings:

```ts
export function SelectionToolbar() {
  const t = useT();
  const { settings } = useSettings();
  const outerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<string>("");
  const actions = enabledActions(BUILTIN_SELECTION_ACTIONS);
```

Replace `runAction` with:

```ts
const runAction = useCallback((action: SelectionAction) => {
  if (action.kind === "copy") {
    void copySelection();
  } else {
    const selectedText = textRef.current;
    const prompt = selectedText.trim()
      ? buildSelectionPrompt(action, selectedText, settings.language)
      : null;
    void showQuickAskWithPrompt(prompt);
  }
  void hideSelectionToolbar();
}, [settings.language]);
```

- [ ] **Step 5: Run toolbar tests and verify they pass**

Run:

```powershell
npm test -- src/pages/selection-toolbar/SelectionToolbar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run related frontend tests**

Run:

```powershell
npm test -- src/state/selectionActions.test.ts src/pages/selection-toolbar/SelectionToolbar.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add src/lib/commands.ts src/pages/selection-toolbar/SelectionToolbar.tsx src/pages/selection-toolbar/SelectionToolbar.test.tsx
git commit -m "feat: send selection prompts from toolbar"
```

Expected: commit succeeds with only these three files.

## Task 3: Rust Prompt Injection Script Builder

**Files:**
- Modify: `src-tauri/src/quick_ask.rs`

- [ ] **Step 1: Write failing Rust tests for script generation**

In the existing `#[cfg(test)] mod tests` in `src-tauri/src/quick_ask.rs`, add these tests:

```rust
    #[test]
    fn prompt_token_uses_generation() {
        assert_eq!(prompt_token(7), "anyask-prompt-7");
    }

    #[test]
    fn prompt_generation_matches_only_same_generation() {
        assert!(prompt_generation_matches(3, 3));
        assert!(!prompt_generation_matches(4, 3));
    }

    #[test]
    fn prompt_injection_script_serializes_prompt_as_json() {
        let prompt = "line 1\n\"quoted\" and \\\\ slash";
        let script = prompt_injection_script(prompt, 7);
        let prompt_json = serde_json::to_string(prompt).unwrap();

        assert!(script.contains(&format!("const PROMPT = {prompt_json};")));
        assert!(script.contains("const TOKEN = \"anyask-prompt-7\";"));
        assert!(!script.contains("const PROMPT = line 1"));
    }

    #[test]
    fn prompt_injection_script_contains_expected_dom_strategy() {
        let script = prompt_injection_script("hello", 1);

        assert!(script.contains("document.querySelector('#prompt-textarea')"));
        assert!(script.contains("document.querySelector('[contenteditable=\"true\"]')"));
        assert!(script.contains("document.querySelector('textarea')"));
        assert!(script.contains("currentText.trim()"));
        assert!(script.contains("setInterval(() =>"));
        assert!(script.contains("}, 500);"));
        assert!(script.contains("}, 10000);"));
        assert!(script.contains("new InputEvent('input'"));
        assert!(script.contains("new Event('input'"));
    }
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml prompt_
```

Expected: FAIL because `prompt_token`, `prompt_generation_matches`, and `prompt_injection_script` do not exist yet.

- [ ] **Step 3: Implement script builder helpers**

In `src-tauri/src/quick_ask.rs`, add constants near the existing `TOPBAR_HEIGHT` constant:

```rust
const WEBVIEW_LOOKUP_RETRY_MS: u64 = 50;
const WEBVIEW_LOOKUP_MAX_ATTEMPTS: u8 = 20;
const PROMPT_INJECTION_INTERVAL_MS: u64 = 500;
const PROMPT_INJECTION_TIMEOUT_MS: u64 = 10_000;
```

Add these helper functions before `reset_delay`:

```rust
fn prompt_token(generation: u64) -> String {
    format!("anyask-prompt-{generation}")
}

fn prompt_generation_matches(current: u64, generation: u64) -> bool {
    current == generation
}

fn prompt_injection_script(prompt: &str, generation: u64) -> String {
    let prompt_json = serde_json::to_string(prompt).unwrap_or_else(|_| "\"\"".to_string());
    let token_json = serde_json::to_string(&prompt_token(generation))
        .unwrap_or_else(|_| "\"anyask-prompt-invalid\"".to_string());
    const SCRIPT_TEMPLATE: &str = r#"(function () {
  'use strict';

  const PROMPT = __ANYASK_PROMPT__;
  const TOKEN = __ANYASK_TOKEN__;

  window.__ANYASK_QUICK_PROMPT_TOKEN__ = TOKEN;

  function isCurrent() {
    return window.__ANYASK_QUICK_PROMPT_TOKEN__ === TOKEN;
  }

  function setInputText(el, text) {
    if (!isCurrent()) return;
    el.focus();

    if (el.getAttribute('contenteditable') === 'true') {
      el.innerText = text;
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text
      }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function findInput() {
    return document.querySelector('#prompt-textarea')
      || document.querySelector('[contenteditable="true"]')
      || document.querySelector('textarea');
  }

  function inputText(el) {
    if (el.getAttribute('contenteditable') === 'true') {
      return el.innerText || '';
    }
    return el.value || '';
  }

  function injectPrompt() {
    if (!isCurrent()) return true;

    const input = findInput();
    if (!input) return false;

    const currentText = inputText(input);
    if (currentText.trim()) return true;

    setInputText(input, PROMPT);
    return true;
  }

  const timer = setInterval(() => {
    if (injectPrompt()) {
      clearInterval(timer);
    }
  }, __ANYASK_INTERVAL_MS__);

  setTimeout(() => clearInterval(timer), __ANYASK_TIMEOUT_MS__);
})();"#;

    SCRIPT_TEMPLATE
        .replace("__ANYASK_PROMPT__", &prompt_json)
        .replace("__ANYASK_TOKEN__", &token_json)
        .replace("__ANYASK_INTERVAL_MS__", &PROMPT_INJECTION_INTERVAL_MS.to_string())
        .replace("__ANYASK_TIMEOUT_MS__", &PROMPT_INJECTION_TIMEOUT_MS.to_string())
}
```

- [ ] **Step 4: Run Rust prompt tests and verify they pass**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml prompt_
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add src-tauri/src/quick_ask.rs
git commit -m "feat: build quick ask prompt injection script"
```

Expected: commit succeeds with only `src-tauri/src/quick_ask.rs`.

## Task 4: Rust Deferred Prompt Injection Command

**Files:**
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/quick_ask.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for optional prompt handling**

In the existing `#[cfg(test)] mod tests` in `src-tauri/src/quick_ask.rs`, add these tests:

```rust
    #[test]
    fn prompt_for_injection_discards_none_and_blank() {
        assert_eq!(prompt_for_injection(None), None);
        assert_eq!(prompt_for_injection(Some(String::new())), None);
        assert_eq!(prompt_for_injection(Some(" \n\t ".into())), None);
    }

    #[test]
    fn prompt_for_injection_keeps_original_non_blank_text() {
        let prompt = "  hello\nworld  ".to_string();
        assert_eq!(prompt_for_injection(Some(prompt.clone())), Some(prompt));
    }
```

- [ ] **Step 2: Run optional prompt tests and verify they fail**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml prompt_for_injection
```

Expected: FAIL because `prompt_for_injection` does not exist yet.

- [ ] **Step 3: Add prompt generation state**

In `src-tauri/src/state.rs`, add this field to `AppState` after `quick_ask_reset_generation`:

```rust
    /// 单调递增 token，用于让后一次 prompt 注入取消前一次尚未完成的注入。
    pub quick_ask_prompt_generation: AtomicU64,
```

- [ ] **Step 4: Add prompt generation and injection runtime helpers**

In `src-tauri/src/quick_ask.rs`, add these functions after `cancel_pending_reset`:

```rust
fn prompt_for_injection(prompt: Option<String>) -> Option<String> {
    prompt.filter(|value| !value.trim().is_empty())
}

fn next_prompt_generation(app: &AppHandle) -> u64 {
    app.state::<AppState>()
        .quick_ask_prompt_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1
}

fn current_prompt_generation(app: &AppHandle) -> u64 {
    app.state::<AppState>()
        .quick_ask_prompt_generation
        .load(Ordering::SeqCst)
}

fn is_prompt_generation_current(app: &AppHandle, generation: u64) -> bool {
    prompt_generation_matches(current_prompt_generation(app), generation)
}

fn eval_prompt_script(app: &AppHandle, prompt: &str, generation: u64) -> Result<bool, String> {
    if !is_prompt_generation_current(app, generation) {
        println!("[quick-ask] prompt injection skipped: generation={generation}, reason=stale");
        return Ok(true);
    }

    let Some(wv) = app.get_webview(AI_LABEL) else {
        return Ok(false);
    };

    let script = prompt_injection_script(prompt, generation);
    wv.eval(&script).map_err(|e| e.to_string())?;
    println!("[quick-ask] prompt injection scheduled: generation={generation}");
    Ok(true)
}

async fn inject_prompt_when_ready(app: AppHandle, prompt: String, generation: u64) {
    for attempt in 0..=WEBVIEW_LOOKUP_MAX_ATTEMPTS {
        if !is_prompt_generation_current(&app, generation) {
            println!("[quick-ask] prompt injection cancelled: generation={generation}, reason=stale");
            return;
        }

        match eval_prompt_script(&app, &prompt, generation) {
            Ok(true) => return,
            Ok(false) if attempt < WEBVIEW_LOOKUP_MAX_ATTEMPTS => {
                tokio::time::sleep(Duration::from_millis(WEBVIEW_LOOKUP_RETRY_MS)).await;
            }
            Ok(false) => {
                eprintln!(
                    "[quick-ask] prompt injection skipped: generation={generation}, reason=ai_webview_missing"
                );
                return;
            }
            Err(error) => {
                eprintln!(
                    "[quick-ask] prompt injection failed: generation={generation}, error={error}"
                );
                return;
            }
        }
    }
}
```

- [ ] **Step 5: Add deferred prompt entrypoint**

In `src-tauri/src/quick_ask.rs`, add this public function after `show_deferred`:

```rust
pub fn show_with_prompt_deferred(app: AppHandle, prompt: Option<String>) {
    let generation = next_prompt_generation(&app);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1)).await;
        show(&app);

        let Some(prompt) = prompt_for_injection(prompt) else {
            println!("[quick-ask] prompt injection skipped: generation={generation}, reason=empty");
            return;
        };

        inject_prompt_when_ready(app, prompt, generation).await;
    });
}
```

- [ ] **Step 6: Expose Tauri command**

In `src-tauri/src/commands.rs`, add this command after `show_quick_ask`:

```rust
#[tauri::command]
pub fn show_quick_ask_with_prompt(app: AppHandle, prompt: Option<String>) {
    quick_ask::show_with_prompt_deferred(app, prompt);
}
```

In `src-tauri/src/lib.rs`, add the new command to `tauri::generate_handler!` immediately after `commands::show_quick_ask`:

```rust
            commands::show_quick_ask,
            commands::show_quick_ask_with_prompt,
            commands::add_provider,
```

- [ ] **Step 7: Run Rust tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```powershell
git add src-tauri/src/state.rs src-tauri/src/quick_ask.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: inject prompts into quick ask webview"
```

Expected: commit succeeds with only these four files.

## Task 5: Full Verification And Regression Checks

**Files:**
- Read: entire changed set
- Test: frontend and Rust suites

- [ ] **Step 1: Run full frontend tests**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 2: Run full Rust tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript and Vite build**

Run:

```powershell
npm run build
```

Expected: PASS. This catches strict TypeScript issues such as unused imports, incorrect mock types, and command wrapper type mismatches.

- [ ] **Step 4: Review changed files**

Run:

```powershell
git diff HEAD~4..HEAD -- src src-tauri/src
```

Expected:

- Frontend prompt rendering lives in `selectionActions.ts`.
- `SelectionToolbar.tsx` calls `showQuickAskWithPrompt(promptOrNull)` for non-copy actions.
- Empty selection passes `null`, canceling old prompt injection while still opening quick-ask.
- Rust command accepts `Option<String>`.
- Rust prompt generation increments before each prompt-aware show request.
- Rust script serialization uses `serde_json::to_string`.
- No provider-specific DOM branches were added.

- [ ] **Step 5: Manual smoke test in a GUI-capable environment**

Run the app normally from a GUI-capable shell. If using `npm run tauri dev`, start it as a background process and stop it after testing.

Smoke steps:

1. Select non-empty text in another app.
2. Click “翻译”.
3. Confirm quick-ask opens.
4. Confirm the AI input receives:

```text
<original selected text>

翻译上文至简体中文
```

5. Type manual text in the AI input.
6. Select text again and click “总结”.
7. Confirm the existing manual text is not overwritten.
8. Clear the AI input.
9. Select empty/blank text path through the toolbar and click “解释”.
10. Confirm quick-ask opens and no prompt is inserted.

- [ ] **Step 6: Record verification result**

Run:

```powershell
git status --short
```

Expected: clean output. If manual smoke could not run because the environment has no interactive GUI, record that exact limitation in the final report and distinguish it from code failure.

# Quick Ask Focus Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the quick-ask hotkey hide only when the quick-ask window is focused, raise it when it is visible but not focused, and add a configurable hidden-window reset policy.

**Architecture:** Frontend settings remain the source of persisted user preferences. Rust reads the same store field and owns native window behavior: focus-aware hotkey handling, hidden-window reset scheduling, and final disposal of the quick-ask parent window plus AI child WebView. Pure decision logic is tested separately from Tauri window APIs so the risky behavior has automated coverage where the current codebase can support it.

**Tech Stack:** Tauri 2.11, Rust 2021, React 19, TypeScript, Vite, Vitest, pnpm, cargo test.

---

## File Structure

- Modify `src/state/types.ts`: add `QuickAskResetPolicy` and `Settings.quickAskResetPolicy`.
- Modify `src/state/defaults.ts`: default and merge the new setting.
- Modify `src/state/defaults.test.ts`: cover default and old-setting merge behavior.
- Modify `src/i18n/zh-CN.ts`: add labels for the basic settings select.
- Modify `src/pages/settings/BasicSettings.tsx`: render and persist the select.
- Modify `src/pages/settings/BasicSettings.test.tsx`: cover rendering and persistence.
- Modify `src-tauri/Cargo.toml`: add a direct `tokio` dependency for timer sleep.
- Modify `src-tauri/src/settings_io.rs`: deserialize `quickAskResetPolicy` with Rust defaults and tests.
- Modify `src-tauri/src/state.rs`: add `quick_ask_reset_generation`.
- Modify `src-tauri/src/quick_ask.rs`: add tested pure helpers, focus-aware toggle behavior, hidden reset scheduling, and disposal.
- Modify `src-tauri/src/lib.rs`: cancel pending reset when `quick-ask` receives focus.

---

### Task 1: Frontend Settings Shape And Defaults

**Files:**
- Modify: `src/state/types.ts`
- Modify: `src/state/defaults.ts`
- Test: `src/state/defaults.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/state/defaults.test.ts`:

```ts
  it("defaults quickAskResetPolicy to after5m", () => {
    expect(DEFAULT_SETTINGS.quickAskResetPolicy).toBe("after5m");
  });
```

Add these tests inside the existing `mergeSettings` describe block, after the `fills missing fields from defaults` test:

```ts
  it("fills missing quickAskResetPolicy from defaults", () => {
    const merged = mergeSettings({ theme: "dark" });
    expect(merged.quickAskResetPolicy).toBe("after5m");
  });

  it("keeps stored quickAskResetPolicy", () => {
    const merged = mergeSettings({ quickAskResetPolicy: "never" });
    expect(merged.quickAskResetPolicy).toBe("never");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test -- src/state/defaults.test.ts
```

Expected: FAIL because `quickAskResetPolicy` does not exist on `Settings` / `DEFAULT_SETTINGS`.

- [ ] **Step 3: Add the setting type and default merge**

In `src/state/types.ts`, add the union type after `Hotkeys`:

```ts
export type QuickAskResetPolicy = "reopen" | "after5m" | "after10m" | "after20m" | "after30m" | "never";
```

Add the field to `Settings`:

```ts
  quickAskProviderId: string;
  quickAskResetPolicy: QuickAskResetPolicy;
```

In `src/state/defaults.ts`, keep the import unchanged because it already imports `Settings`, then add the default:

```ts
  quickAskProviderId: "chatgpt",
  quickAskResetPolicy: "after5m",
```

In `mergeSettings()`, add the merged field:

```ts
    quickAskProviderId: stored.quickAskProviderId ?? base.quickAskProviderId,
    quickAskResetPolicy: stored.quickAskResetPolicy ?? base.quickAskResetPolicy,
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm test -- src/state/defaults.test.ts
```

Expected: PASS for all `DEFAULT_SETTINGS` and `mergeSettings` tests.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/state/types.ts src/state/defaults.ts src/state/defaults.test.ts
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: add quick ask reset setting default"
```

---

### Task 2: Basic Settings UI For Reset Policy

**Files:**
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/pages/settings/BasicSettings.tsx`
- Test: `src/pages/settings/BasicSettings.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Add this test to `src/pages/settings/BasicSettings.test.tsx`:

```ts
  it("persists quick ask reset policy changes", async () => {
    setup();
    const select = await screen.findByRole("combobox", { name: "快捷提问重置为新对话" });
    expect(select).toHaveValue("after5m");

    await userEvent.selectOptions(select, "after10m");

    const last = saveSettings.mock.calls.at(-1)![0];
    expect(last.quickAskResetPolicy).toBe("after10m");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test -- src/pages/settings/BasicSettings.test.tsx
```

Expected: FAIL because no combobox named `快捷提问重置为新对话` exists.

- [ ] **Step 3: Add translations**

Add these keys to `src/i18n/zh-CN.ts` near the other `basic.*` keys:

```ts
  "basic.quickAskResetPolicy": "快捷提问重置为新对话",
  "basic.quickAskResetPolicy.reopen": "重新打开时",
  "basic.quickAskResetPolicy.after5m": "关闭后5分钟",
  "basic.quickAskResetPolicy.after10m": "关闭后10分钟",
  "basic.quickAskResetPolicy.after20m": "关闭后20分钟",
  "basic.quickAskResetPolicy.after30m": "关闭后30分钟",
  "basic.quickAskResetPolicy.never": "从不",
```

- [ ] **Step 4: Add the select to BasicSettings**

Update the import in `src/pages/settings/BasicSettings.tsx`:

```ts
import type { QuickAskResetPolicy, ThemeMode } from "../../state/types";
```

Add this constant above `export function BasicSettings()`:

```ts
const quickAskResetPolicyOptions: Array<{ value: QuickAskResetPolicy; labelKey: string }> = [
  { value: "reopen", labelKey: "basic.quickAskResetPolicy.reopen" },
  { value: "after5m", labelKey: "basic.quickAskResetPolicy.after5m" },
  { value: "after10m", labelKey: "basic.quickAskResetPolicy.after10m" },
  { value: "after20m", labelKey: "basic.quickAskResetPolicy.after20m" },
  { value: "after30m", labelKey: "basic.quickAskResetPolicy.after30m" },
  { value: "never", labelKey: "basic.quickAskResetPolicy.never" },
];
```

Add this section after the “快捷提问默认 AI” section:

```tsx
      <section>
        <h3 id="quick-ask-reset-policy-label">{t("basic.quickAskResetPolicy")}</h3>
        <select
          aria-labelledby="quick-ask-reset-policy-label"
          value={settings.quickAskResetPolicy}
          onChange={(e) => {
            updateSettings({ quickAskResetPolicy: e.target.value as QuickAskResetPolicy });
          }}
        >
          {quickAskResetPolicyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </section>
```

- [ ] **Step 5: Run the UI test to verify it passes**

Run:

```bash
pnpm test -- src/pages/settings/BasicSettings.test.tsx
```

Expected: PASS for the new reset policy test and existing BasicSettings tests.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src/i18n/zh-CN.ts src/pages/settings/BasicSettings.tsx src/pages/settings/BasicSettings.test.tsx
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: expose quick ask reset policy setting"
```

---

### Task 3: Rust Store Deserialization For Reset Policy

**Files:**
- Modify: `src-tauri/src/settings_io.rs`

- [ ] **Step 1: Write the failing Rust tests**

Add this test module to the bottom of `src-tauri/src/settings_io.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_quick_ask_reset_policy_defaults_to_after5m() {
        let settings = serde_json::from_value::<StoredSettings>(json!({})).unwrap();

        assert_eq!(settings.quick_ask_reset_policy, QuickAskResetPolicy::After5m);
    }

    #[test]
    fn deserializes_each_quick_ask_reset_policy_value() {
        let cases = [
            ("reopen", QuickAskResetPolicy::Reopen),
            ("after5m", QuickAskResetPolicy::After5m),
            ("after10m", QuickAskResetPolicy::After10m),
            ("after20m", QuickAskResetPolicy::After20m),
            ("after30m", QuickAskResetPolicy::After30m),
            ("never", QuickAskResetPolicy::Never),
        ];

        for (raw, expected) in cases {
            let settings = serde_json::from_value::<StoredSettings>(json!({
                "quickAskResetPolicy": raw
            }))
            .unwrap();

            assert_eq!(settings.quick_ask_reset_policy, expected);
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `src-tauri`:

```bash
cargo test quick_ask_reset_policy --lib
```

Expected: FAIL because `QuickAskResetPolicy` and `StoredSettings.quick_ask_reset_policy` are not defined.

- [ ] **Step 3: Implement the Rust policy type**

In `src-tauri/src/settings_io.rs`, add this default helper near the existing defaults:

```rust
fn default_quick_ask_reset_policy() -> QuickAskResetPolicy {
    QuickAskResetPolicy::After5m
}
```

Add this enum after `Hotkeys`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum QuickAskResetPolicy {
    #[serde(rename = "reopen")]
    Reopen,
    #[serde(rename = "after5m")]
    After5m,
    #[serde(rename = "after10m")]
    After10m,
    #[serde(rename = "after20m")]
    After20m,
    #[serde(rename = "after30m")]
    After30m,
    #[serde(rename = "never")]
    Never,
}

impl Default for QuickAskResetPolicy {
    fn default() -> Self {
        default_quick_ask_reset_policy()
    }
}
```

Add this field to `StoredSettings`:

```rust
    #[serde(rename = "quickAskResetPolicy", default = "default_quick_ask_reset_policy")]
    pub quick_ask_reset_policy: QuickAskResetPolicy,
```

Add it to `StoredSettings::default()`:

```rust
            quick_ask_reset_policy: default_quick_ask_reset_policy(),
```

- [ ] **Step 4: Run Rust tests to verify they pass**

Run from `src-tauri`:

```bash
cargo test quick_ask_reset_policy --lib
```

Expected: PASS for the two reset policy deserialization tests.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src-tauri/src/settings_io.rs
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: read quick ask reset policy in tauri"
```

---

### Task 4: Pure Rust Logic For Toggle And Reset Timing

**Files:**
- Modify: `src-tauri/src/quick_ask.rs`

- [ ] **Step 1: Write the failing pure logic tests**

Add this test module to the bottom of `src-tauri/src/quick_ask.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings_io::QuickAskResetPolicy;
    use std::time::Duration;

    #[test]
    fn reset_delay_maps_each_policy() {
        let cases = [
            (QuickAskResetPolicy::Reopen, ResetDelay::Immediate),
            (QuickAskResetPolicy::After5m, ResetDelay::After(Duration::from_secs(5 * 60))),
            (QuickAskResetPolicy::After10m, ResetDelay::After(Duration::from_secs(10 * 60))),
            (QuickAskResetPolicy::After20m, ResetDelay::After(Duration::from_secs(20 * 60))),
            (QuickAskResetPolicy::After30m, ResetDelay::After(Duration::from_secs(30 * 60))),
            (QuickAskResetPolicy::Never, ResetDelay::Never),
        ];

        for (policy, expected) in cases {
            assert_eq!(reset_delay(policy), expected);
        }
    }

    #[test]
    fn visible_focused_window_hides_on_hotkey() {
        assert_eq!(visible_toggle_action(Ok(true)), VisibleToggleAction::Hide);
    }

    #[test]
    fn visible_unfocused_window_raises_on_hotkey() {
        assert_eq!(visible_toggle_action(Ok(false)), VisibleToggleAction::Raise);
    }

    #[test]
    fn focus_lookup_failure_raises_instead_of_hiding() {
        assert_eq!(visible_toggle_action(Err(())), VisibleToggleAction::Raise);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `src-tauri`:

```bash
cargo test reset_delay --lib
cargo test visible_ --lib
cargo test focus_lookup_failure --lib
```

Expected: FAIL because `ResetDelay`, `reset_delay`, `VisibleToggleAction`, and `visible_toggle_action` are not defined.

- [ ] **Step 3: Add the pure helpers**

Update the imports in `src-tauri/src/quick_ask.rs`:

```rust
use std::time::Duration;

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::settings_io::{quick_ask_url, read_settings, QuickAskResetPolicy};
```

Add these helpers near the constants:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResetDelay {
    Immediate,
    After(Duration),
    Never,
}

fn reset_delay(policy: QuickAskResetPolicy) -> ResetDelay {
    match policy {
        QuickAskResetPolicy::Reopen => ResetDelay::Immediate,
        QuickAskResetPolicy::After5m => ResetDelay::After(Duration::from_secs(5 * 60)),
        QuickAskResetPolicy::After10m => ResetDelay::After(Duration::from_secs(10 * 60)),
        QuickAskResetPolicy::After20m => ResetDelay::After(Duration::from_secs(20 * 60)),
        QuickAskResetPolicy::After30m => ResetDelay::After(Duration::from_secs(30 * 60)),
        QuickAskResetPolicy::Never => ResetDelay::Never,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VisibleToggleAction {
    Hide,
    Raise,
}

fn visible_toggle_action(focused: Result<bool, ()>) -> VisibleToggleAction {
    match focused {
        Ok(true) => VisibleToggleAction::Hide,
        Ok(false) | Err(()) => VisibleToggleAction::Raise,
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `src-tauri`:

```bash
cargo test reset_delay --lib
cargo test visible_ --lib
cargo test focus_lookup_failure --lib
```

Expected: PASS for all pure quick ask logic tests.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src-tauri/src/quick_ask.rs
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "test: cover quick ask reset decisions"
```

---

### Task 5: Native Quick Ask Lifecycle Integration

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/quick_ask.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add timer dependency and reset generation state**

In `src-tauri/Cargo.toml`, add a direct Tokio dependency near the existing dependencies:

```toml
tokio = { version = "1", features = ["time"] }
```

In `src-tauri/src/state.rs`, replace the import with:

```rust
use std::sync::{atomic::AtomicU64, Mutex};
```

Add this field to `AppState`:

```rust
    /// Monotonic token used to invalidate hidden-window reset tasks.
    pub quick_ask_reset_generation: AtomicU64,
```

Keep `#[derive(Default)]` on `AppState`. `AtomicU64::default()` initializes the field to `0`, so no manual `Default` implementation is required. If the derive is removed during implementation, add an explicit `impl Default for AppState` that initializes this field with `AtomicU64::new(0)`.

- [ ] **Step 2: Add lifecycle helpers**

In `src-tauri/src/quick_ask.rs`, add this import:

```rust
use std::sync::atomic::Ordering;
```

Add these helpers after `raise()`:

```rust
fn next_reset_generation(app: &AppHandle) -> u64 {
    app.state::<AppState>()
        .quick_ask_reset_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1
}

fn is_reset_generation_current(app: &AppHandle, generation: u64) -> bool {
    app.state::<AppState>()
        .quick_ask_reset_generation
        .load(Ordering::SeqCst)
        == generation
}

pub fn cancel_pending_reset(app: &AppHandle) {
    let _ = next_reset_generation(app);
}

fn schedule_reset_after_hide(app: &AppHandle, policy: QuickAskResetPolicy) {
    let generation = next_reset_generation(app);
    match reset_delay(policy) {
        ResetDelay::Immediate => {
            let _ = dispose_quick_ask_window(app, generation);
        }
        ResetDelay::After(duration) => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(duration).await;
                let _ = dispose_if_still_hidden(&app, generation);
            });
        }
        ResetDelay::Never => {}
    }
}

fn dispose_if_still_hidden(app: &AppHandle, generation: u64) -> Result<(), String> {
    if !is_reset_generation_current(app, generation) {
        return Ok(());
    }

    let Some(win) = app.get_window(LABEL) else {
        return Ok(());
    };

    let visible = win.is_visible().unwrap_or(true);
    let focused = win.is_focused().unwrap_or(true);
    if !visible && !focused {
        dispose_quick_ask_window(app, generation)?;
    }

    Ok(())
}

fn dispose_quick_ask_window(app: &AppHandle, generation: u64) -> Result<(), String> {
    if !is_reset_generation_current(app, generation) {
        return Ok(());
    }

    if let Some(win) = app.get_window(LABEL) {
        win.close().map_err(|e| e.to_string())?;
    }

    if let Some(wv) = app.get_webview(AI_LABEL) {
        wv.close().map_err(|e| e.to_string())?;
    }

    cancel_pending_reset(app);
    Ok(())
}

fn hide_with_reset_policy(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_window(LABEL) {
        win.hide().map_err(|e| e.to_string())?;
        schedule_reset_after_hide(app, read_settings(app).quick_ask_reset_policy);
    }
    Ok(())
}
```

The disposal order is intentional. Do not close `quick-ask-ai` before `quick-ask`: if the child closes successfully but the parent window fails to close, the app would keep a hidden parent window whose AI child WebView no longer exists. Closing the parent first preserves a reusable parent+child pair on failure, and only closes a residual child WebView after the parent close succeeds.

- [ ] **Step 3: Integrate focus-aware toggle behavior**

In `toggle()`, replace the existing `if let Some(win) = app.get_window(LABEL) {` block that currently hides every visible quick-ask window with this block:

```rust
    if let Some(win) = app.get_window(LABEL) {
        match win.is_visible() {
            Ok(true) => match visible_toggle_action(win.is_focused().map_err(|_| ())) {
                VisibleToggleAction::Hide => {
                    let _ = hide_with_reset_policy(app);
                }
                VisibleToggleAction::Raise => {
                    cancel_pending_reset(app);
                    raise(&win, pinned);
                    if let Some(wv) = app.get_webview(AI_LABEL) {
                        let _ = wv.show();
                    }
                }
            },
            _ => {
                cancel_pending_reset(app);
                raise(&win, pinned);
                if let Some(wv) = app.get_webview(AI_LABEL) {
                    let _ = wv.show();
                }
            }
        }
        return;
    }
```

After a new quick-ask window is created successfully and before `center_bottom(&window);`, add:

```rust
    cancel_pending_reset(app);
```

Replace the current `hide()` implementation with:

```rust
pub fn hide(app: &AppHandle) -> Result<(), String> {
    hide_with_reset_policy(app)
}
```

- [ ] **Step 4: Cancel pending reset on native focus events**

In `src-tauri/src/lib.rs`, keep `use tauri::WindowEvent;` unless the compiler asks for `Manager`.

Extend the `on_window_event` closure:

```rust
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
                return;
            }

            if window.label() == "quick-ask" && matches!(event, WindowEvent::Focused(true)) {
                quick_ask::cancel_pending_reset(window.app_handle());
            }
        })
```

- [ ] **Step 5: Run Rust verification**

Run from `src-tauri`:

```bash
cargo test --lib
cargo check
```

Expected: PASS for Rust unit tests and successful type checking.

- [ ] **Step 6: Commit**

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/state.rs src-tauri/src/quick_ask.rs src-tauri/src/lib.rs
git -c safe.directory=D:/selfStudy/myprojects/anyask commit -m "feat: reset hidden quick ask windows"
```

---

### Task 6: Full Verification And Manual Native Checks

**Files:**
- No source changes unless verification exposes a defect.

- [ ] **Step 1: Run frontend tests**

Run:

```bash
pnpm test
```

Expected: PASS for all Vitest suites.

- [ ] **Step 2: Run Rust tests and checks**

Run from `src-tauri`:

```bash
cargo test --lib
cargo check
```

Expected: PASS for Rust unit tests and successful type checking.

- [ ] **Step 3: Run production build**

Run from the repository root:

```bash
pnpm build
```

Expected: PASS with TypeScript and Vite build completing.

- [ ] **Step 4: Start the Tauri app for manual verification**

Use a background process so the command does not block the agent session:

```powershell
$log = Join-Path $env:TEMP "anyask-tauri-dev.log"
$proc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "tauri", "dev" -WorkingDirectory "D:\selfStudy\myprojects\anyask" -RedirectStandardOutput $log -RedirectStandardError $log -WindowStyle Hidden -PassThru
```

Wait until the app window is visible or the log shows the Tauri dev app started. Keep `$proc.Id` for cleanup.

- [ ] **Step 5: Verify hotkey behavior manually**

Manual checks:

- With quick ask hidden, press the configured quick-ask hotkey. Expected: quick ask appears.
- With quick ask visible and focused, press the hotkey. Expected: quick ask hides.
- With quick ask visible, click another app so quick ask is covered or unfocused, then press the hotkey. Expected: quick ask moves to the top and remains visible.
- With quick ask visible but unfocused, click the quick ask window. Expected: it focuses and no pending reset later closes it while visible.

- [ ] **Step 6: Verify reset policy manually**

Manual checks:

- Set “快捷提问重置为新对话” to “重新打开时”. Hide quick ask, then press the hotkey again. Expected: a newly created quick-ask window appears.
- Set the policy back to “关闭后5分钟”. Hide quick ask, reopen it before 5 minutes, then keep using it. Expected: the old timer does not close the visible focused window.
- Hide quick ask for more than 5 minutes. Expected: the next hotkey press creates a fresh quick-ask window.
- After a reset disposal, use the AI selector and pin button. Expected: no stale `quick-ask` or `quick-ask-ai` handle is reused.

- [ ] **Step 7: Clean up the manual dev process**

Run:

```powershell
Stop-Process -Id $proc.Id
```

Expected: the Tauri dev process started in Step 4 exits.

- [ ] **Step 8: Inspect final git status**

Run:

```bash
git -c safe.directory=D:/selfStudy/myprojects/anyask status --short
```

Expected: no unexpected files. If `Cargo.lock` changed because of the direct Tokio dependency, it should already be included in the Task 5 commit.

---

## Self-Review Notes

- Spec coverage: hotkey hide versus raise behavior is covered by Task 4 pure tests and Task 5 integration; reset policy UI and persistence are covered by Tasks 1 and 2; Rust store parsing is covered by Task 3; native reset scheduling and disposal are covered by Task 5 plus Task 6 manual checks.
- Type consistency: frontend uses `quickAskResetPolicy`; Rust store reads `quickAskResetPolicy` into `quick_ask_reset_policy`; policy values match exactly: `reopen`, `after5m`, `after10m`, `after20m`, `after30m`, `never`.
- Native limitation: current codebase has no Tauri window test harness. The plan keeps policy mapping and focus decisions in pure tested helpers, then verifies the OS window behavior manually with the running app.

use std::{sync::atomic::Ordering, time::Duration};

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::settings_io::{quick_ask_url, read_settings, QuickAskResetPolicy};
use crate::state::AppState;

const LABEL: &str = "quick-ask";
const AI_LABEL: &str = "quick-ask-ai"; // 顶栏下方承载 AI 站点的子 webview
const WIDTH: f64 = 400.0;
const HEIGHT: f64 = 620.0;
const TOPBAR_HEIGHT: f64 = 40.0; // 必须与前端 QuickAskBar 高度一致
const WEBVIEW_LOOKUP_RETRY_MS: u64 = 50;
const WEBVIEW_LOOKUP_MAX_ATTEMPTS: u8 = 20;
const PROMPT_INJECTION_INTERVAL_MS: u64 = 500;
const PROMPT_INJECTION_TIMEOUT_MS: u64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ResetDelay {
    Immediate,
    After(Duration),
    Never,
}

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
        .replace(
            "__ANYASK_INTERVAL_MS__",
            &PROMPT_INJECTION_INTERVAL_MS.to_string(),
        )
        .replace(
            "__ANYASK_TIMEOUT_MS__",
            &PROMPT_INJECTION_TIMEOUT_MS.to_string(),
        )
}

fn prompt_cancel_script(generation: u64) -> String {
    let token_json = serde_json::to_string(&prompt_token(generation))
        .unwrap_or_else(|_| "\"anyask-prompt-invalid\"".to_string());
    format!("window.__ANYASK_QUICK_PROMPT_TOKEN__ = {token_json};")
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

fn visible_toggle_action(
    native_focused: Result<bool, ()>,
    tracked_focused: bool,
) -> VisibleToggleAction {
    match native_focused {
        Ok(true) => VisibleToggleAction::Hide,
        Ok(false) | Err(()) if tracked_focused => VisibleToggleAction::Hide,
        Ok(false) | Err(()) => VisibleToggleAction::Raise,
    }
}

fn target_url(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    if let Some(url) = state.quick_ask_url.lock().unwrap().clone() {
        return url;
    }
    quick_ask_url(&read_settings(app))
}

/// 把窗口抬到最前。默认不长期置顶（pinned=false），靠一次临时 always_on_top(true)
/// 越过其它前台窗口（Windows 上仅 set_focus 不可靠），随后按 pinned 决定是否恢复。
fn raise(win: &tauri::Window, pinned: bool) {
    let _ = win.set_always_on_top(true);
    let _ = win.show();
    let _ = win.set_focus();
    if !pinned {
        let _ = win.set_always_on_top(false);
    }
}

pub fn set_focused(app: &AppHandle, focused: bool) {
    app.state::<AppState>()
        .quick_ask_focused
        .store(focused, Ordering::SeqCst);
    println!("[quick-ask] focus changed: focused={focused}");
}

fn tracked_focused(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .quick_ask_focused
        .load(Ordering::SeqCst)
}

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
    let generation = next_reset_generation(app);
    println!("[quick-ask] reset cancelled: generation={generation}");
}

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

fn eval_script(
    app: &AppHandle,
    script: String,
    generation: u64,
    action: &str,
) -> Result<bool, String> {
    if !is_prompt_generation_current(app, generation) {
        println!("[quick-ask] prompt {action} skipped: generation={generation}, reason=stale");
        return Ok(true);
    }

    let Some(wv) = app.get_webview(AI_LABEL) else {
        return Ok(false);
    };

    wv.eval(&script).map_err(|e| e.to_string())?;
    println!("[quick-ask] prompt {action} scheduled: generation={generation}");
    Ok(true)
}

fn eval_prompt_script(app: &AppHandle, prompt: &str, generation: u64) -> Result<bool, String> {
    eval_script(
        app,
        prompt_injection_script(prompt, generation),
        generation,
        "injection",
    )
}

fn eval_cancel_script(app: &AppHandle, generation: u64) -> Result<bool, String> {
    eval_script(
        app,
        prompt_cancel_script(generation),
        generation,
        "cancellation",
    )
}

async fn inject_prompt_when_ready(app: AppHandle, prompt: String, generation: u64) {
    for attempt in 0..=WEBVIEW_LOOKUP_MAX_ATTEMPTS {
        if !is_prompt_generation_current(&app, generation) {
            println!(
                "[quick-ask] prompt injection cancelled: generation={generation}, reason=stale"
            );
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

async fn cancel_prompt_when_ready(app: AppHandle, generation: u64) {
    for attempt in 0..=WEBVIEW_LOOKUP_MAX_ATTEMPTS {
        if !is_prompt_generation_current(&app, generation) {
            println!(
                "[quick-ask] prompt cancellation skipped: generation={generation}, reason=stale"
            );
            return;
        }

        match eval_cancel_script(&app, generation) {
            Ok(true) => return,
            Ok(false) if attempt < WEBVIEW_LOOKUP_MAX_ATTEMPTS => {
                tokio::time::sleep(Duration::from_millis(WEBVIEW_LOOKUP_RETRY_MS)).await;
            }
            Ok(false) => {
                eprintln!(
                    "[quick-ask] prompt cancellation skipped: generation={generation}, reason=ai_webview_missing"
                );
                return;
            }
            Err(error) => {
                eprintln!(
                    "[quick-ask] prompt cancellation failed: generation={generation}, error={error}"
                );
                return;
            }
        }
    }
}

fn schedule_reset_after_hide(app: &AppHandle, policy: QuickAskResetPolicy) {
    let generation = next_reset_generation(app);
    match reset_delay(policy) {
        ResetDelay::Immediate => {
            println!("[quick-ask] reset immediate: policy={policy:?}, generation={generation}");
            let _ = dispose_quick_ask_window(app, generation);
        }
        ResetDelay::After(duration) => {
            println!(
                "[quick-ask] reset scheduled: policy={policy:?}, generation={generation}, delay_secs={}",
                duration.as_secs()
            );
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(duration).await;
                println!("[quick-ask] reset timer fired: generation={generation}");
                let _ = dispose_if_still_hidden(&app, generation);
            });
        }
        ResetDelay::Never => {
            println!("[quick-ask] reset skipped: policy={policy:?}, generation={generation}");
        }
    }
}

fn dispose_if_still_hidden(app: &AppHandle, generation: u64) -> Result<(), String> {
    if !is_reset_generation_current(app, generation) {
        println!("[quick-ask] reset stale: generation={generation}");
        return Ok(());
    }

    let Some(win) = app.get_window(LABEL) else {
        println!("[quick-ask] reset skipped: generation={generation}, reason=window_missing");
        return Ok(());
    };

    let visible = win.is_visible().unwrap_or(true);
    let native_focused = win.is_focused().unwrap_or(true);
    let tracked_focused = tracked_focused(app);
    let focused = native_focused || tracked_focused;
    println!(
        "[quick-ask] reset check: generation={generation}, visible={visible}, native_focused={native_focused}, tracked_focused={tracked_focused}, focused={focused}"
    );
    if !visible && !focused {
        dispose_quick_ask_window(app, generation)?;
    }

    Ok(())
}

fn dispose_quick_ask_window(app: &AppHandle, generation: u64) -> Result<(), String> {
    if !is_reset_generation_current(app, generation) {
        println!("[quick-ask] dispose skipped: generation={generation}, reason=stale");
        return Ok(());
    }

    println!("[quick-ask] dispose requested: generation={generation}");
    if let Some(win) = app.get_window(LABEL) {
        win.close().map_err(|e| e.to_string())?;
    }

    if let Some(wv) = app.get_webview(AI_LABEL) {
        wv.close().map_err(|e| e.to_string())?;
    }

    set_focused(app, false);
    cancel_pending_reset(app);
    println!("[quick-ask] dispose completed: generation={generation}");
    Ok(())
}

fn hide_with_reset_policy(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_window(LABEL) {
        let policy = read_settings(app).quick_ask_reset_policy;
        println!("[quick-ask] hide requested: policy={policy:?}");
        win.hide().map_err(|e| e.to_string())?;
        set_focused(app, false);
        schedule_reset_after_hide(app, policy);
    }
    Ok(())
}

/// 切换显隐；不存在则创建（本地 React 壳 + 顶栏下方的 AI 子 webview）
pub fn toggle(app: &AppHandle) {
    let pinned = *app.state::<AppState>().quick_ask_pinned.lock().unwrap();

    // 窗口含两个 webview（壳 + AI 子），必须用 get_window 取底层 Window；
    // get_webview_window 仅对单 webview 窗口返回 Some，此处会得到 None。
    if let Some(win) = app.get_window(LABEL) {
        match win.is_visible() {
            Ok(true) => {
                let native_focused = win.is_focused().map_err(|_| ());
                let tracked_focused = tracked_focused(app);
                let action = visible_toggle_action(native_focused, tracked_focused);
                println!(
                    "[quick-ask] toggle visible: native_focused={native_focused:?}, tracked_focused={tracked_focused}, action={action:?}"
                );
                match action {
                    VisibleToggleAction::Hide => {
                        let _ = hide_with_reset_policy(app);
                    }
                    VisibleToggleAction::Raise => {
                        cancel_pending_reset(app);
                        raise(&win, pinned);
                        set_focused(app, true);
                        if let Some(wv) = app.get_webview(AI_LABEL) {
                            let _ = wv.show();
                        }
                    }
                }
            }
            _ => {
                cancel_pending_reset(app);
                raise(&win, pinned);
                set_focused(app, true);
                // 兜底：无论 React 面板此前是否处于「隐藏 AI」状态，呼出即强制显示 AI，
                // 避免「面板开着时被隐藏 → 再呼出」卡在 AI 不可见。
                if let Some(wv) = app.get_webview(AI_LABEL) {
                    let _ = wv.show();
                }
            }
        }
        return;
    }

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

/// 从 WebView IPC 入口触发显示时，不能在当前 IPC 调用栈里直接创建另一个 WebView。
/// WebView 创建会通过运行时通道同步到事件循环；如果当前 WebView 的 IPC 仍未返回，
/// Windows/WebView2 上容易形成等待环，表现为划词按钮点击后整应用卡死。
pub fn show_deferred(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1)).await;
        show(&app);
    });
}

pub fn show_with_prompt_deferred(app: AppHandle, prompt: Option<String>) {
    let generation = next_prompt_generation(&app);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1)).await;
        show(&app);

        let Some(prompt) = prompt_for_injection(prompt) else {
            println!("[quick-ask] prompt injection skipped: generation={generation}, reason=empty");
            cancel_prompt_when_ready(app, generation).await;
            return;
        };

        inject_prompt_when_ready(app, prompt, generation).await;
    });
}

/// 设置 url：若 AI 子 webview 已存在则**先导航成功**，再写内存 override（供下次创建用）。
/// 反序避免「导航失败但默认 URL 已变、webview 仍停旧页」。
pub fn set_url(app: &AppHandle, url: String) -> Result<(), String> {
    let parsed = url.parse::<Url>().map_err(|_| "invalid url".to_string())?;
    if let Some(wv) = app.get_webview(AI_LABEL) {
        wv.navigate(parsed).map_err(|e| e.to_string())?; // 先导航
    }
    *app.state::<AppState>().quick_ask_url.lock().unwrap() = Some(url); // 成功后才写
    Ok(())
}

/// 显隐 AI 子 webview（打开 AI 选择面板时隐藏，让出 React 区域；关闭后恢复）
pub fn set_ai_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    if let Some(wv) = app.get_webview(AI_LABEL) {
        if visible {
            wv.show().map_err(|e| e.to_string())?;
        } else {
            wv.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 隐藏悬浮窗（顶栏「隐藏」按钮）
pub fn hide(app: &AppHandle) -> Result<(), String> {
    hide_with_reset_policy(app)
}

/// 设置置顶（顶栏「图钉」按钮）。先改窗口、成功后再写状态，
/// 失败时返回 Err，让前端按钮状态回滚，避免 UI 与真实窗口不一致。
pub fn set_pinned(app: &AppHandle, pinned: bool) -> Result<(), String> {
    let win = app.get_window(LABEL).ok_or("quick-ask window not found")?;
    win.set_always_on_top(pinned).map_err(|e| e.to_string())?;
    *app.state::<AppState>().quick_ask_pinned.lock().unwrap() = pinned;
    Ok(())
}

/// 新对话：把 AI 子 webview 导航回首页；已在首页则不操作（顶栏「新对话」按钮）
pub fn new_chat(app: &AppHandle) -> Result<(), String> {
    let wv = app
        .get_webview(AI_LABEL)
        .ok_or("quick-ask ai webview not found")?;
    let home: Url = target_url(app)
        .parse()
        .map_err(|_| "invalid home url".to_string())?;
    let cur = wv.url().map_err(|e| e.to_string())?;
    if same_page(&cur, &home) {
        return Ok(()); // 已在首页，不触发
    }
    wv.navigate(home).map_err(|e| e.to_string())
}

/// 规范化比较两个 URL 是否为「同一页」：比对 scheme/host/path（忽略末尾斜杠）/query，
/// 忽略 fragment。避免 `https://chatgpt.com` 与 `https://chatgpt.com/` 等被误判为不同页。
fn same_page(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.path().trim_end_matches('/') == b.path().trim_end_matches('/')
        && a.query() == b.query()
}

/// 定位到屏幕中下居中（仅首次创建时调用，之后保留用户拖动后的位置）
fn center_bottom(win: &tauri::Window) {
    // 新建窗口可能暂时拿不到 current_monitor，回退到 primary_monitor
    let monitor = match win.current_monitor() {
        Ok(Some(m)) => Some(m),
        _ => win.primary_monitor().ok().flatten(),
    };
    let Some(monitor) = monitor else { return };
    let screen = monitor.size();
    let scale = monitor.scale_factor();
    let w = (WIDTH * scale) as i32;
    let h = (HEIGHT * scale) as i32;
    let x = (screen.width as i32 - w) / 2;
    let y = (screen.height as i32 - h) - (screen.height as i32 / 12); // 偏下，留出底部边距
    let _ = win.set_position(tauri::PhysicalPosition::new(x.max(0), y.max(0)));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings_io::QuickAskResetPolicy;
    use std::time::Duration;

    #[test]
    fn reset_delay_maps_each_policy() {
        let cases = [
            (QuickAskResetPolicy::Reopen, ResetDelay::Immediate),
            (
                QuickAskResetPolicy::After5m,
                ResetDelay::After(Duration::from_secs(5 * 60)),
            ),
            (
                QuickAskResetPolicy::After10m,
                ResetDelay::After(Duration::from_secs(10 * 60)),
            ),
            (
                QuickAskResetPolicy::After20m,
                ResetDelay::After(Duration::from_secs(20 * 60)),
            ),
            (
                QuickAskResetPolicy::After30m,
                ResetDelay::After(Duration::from_secs(30 * 60)),
            ),
            (QuickAskResetPolicy::Never, ResetDelay::Never),
        ];

        for (policy, expected) in cases {
            assert_eq!(reset_delay(policy), expected);
        }
    }

    #[test]
    fn visible_focused_window_hides_on_hotkey() {
        assert_eq!(
            visible_toggle_action(Ok(true), false),
            VisibleToggleAction::Hide
        );
    }

    #[test]
    fn visible_unfocused_window_raises_on_hotkey() {
        assert_eq!(
            visible_toggle_action(Ok(false), false),
            VisibleToggleAction::Raise
        );
    }

    #[test]
    fn visible_tracked_focused_window_hides_when_native_focus_is_false() {
        assert_eq!(
            visible_toggle_action(Ok(false), true),
            VisibleToggleAction::Hide
        );
    }

    #[test]
    fn focus_lookup_failure_raises_instead_of_hiding() {
        assert_eq!(
            visible_toggle_action(Err(()), false),
            VisibleToggleAction::Raise
        );
    }

    #[test]
    fn focus_lookup_failure_hides_when_tracked_focused() {
        assert_eq!(
            visible_toggle_action(Err(()), true),
            VisibleToggleAction::Hide
        );
    }

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
    fn prompt_cancel_script_sets_only_the_current_token() {
        let script = prompt_cancel_script(9);

        assert!(script.contains("window.__ANYASK_QUICK_PROMPT_TOKEN__ = \"anyask-prompt-9\";"));
        assert!(!script.contains("const PROMPT"));
        assert!(!script.contains("setInterval"));
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
        assert!(script.contains("setTimeout(() => clearInterval(timer), 10000);"));
        assert!(script.contains("new InputEvent('input'"));
        assert!(script.contains("new Event('input'"));
    }

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
}

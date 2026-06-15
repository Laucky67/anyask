use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

use crate::state::AppState;

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
    // 串行化：并发调用（StrictMode 双触发、快速点击）逐个执行，
    // 保证 ensure() 的「检查存在 → 创建」不被另一调用穿插。
    let state = app.state::<AppState>();
    let _guard = state.webview_sync.lock().await;

    // url 变更：关闭旧 webview，后续 ensure 会按新 url 重建（短临界区，期间不 await）
    {
        let mut urls = state.ai_webview_urls.lock().unwrap();
        for p in &providers {
            if urls.get(&p.id).map(|u| u != &p.url).unwrap_or(false) {
                if let Some(wv) = app.get_webview(&label(&p.id)) {
                    let _ = wv.close();
                }
            }
            urls.insert(p.id.clone(), p.url.clone());
        }
        let ids: std::collections::HashSet<&String> = providers.iter().map(|p| &p.id).collect();
        urls.retain(|id, _| ids.contains(id));
    }

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

/// 内容区真实边界（前端 ContentArea.getBoundingClientRect 测得，逻辑像素）
#[derive(serde::Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 把 AI webview 重新摆放到真实内容区（前端在挂载/布局变化/ResizeObserver 时调用）。
/// 作为 auto_resize 的校正后备，使位置不再仅依赖硬编码 SIDEBAR_WIDTH。
#[tauri::command]
pub async fn reposition_ai_webviews(app: AppHandle, bounds: Bounds) -> Result<(), String> {
    for (lbl, wv) in app.webviews() {
        if lbl.starts_with(PREFIX) {
            let _ = wv.set_position(LogicalPosition::new(bounds.x, bounds.y));
            let _ = wv.set_size(LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)));
        }
    }
    Ok(())
}

/// 刷新指定 provider 的主窗口 AI webview：重新导航到 settings 中配置的 url。
/// 供 Sidebar 刷新按钮使用，传入当前激活的 provider id。
#[tauri::command]
pub async fn refresh_active_ai_webview(app: AppHandle, provider_id: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label(&provider_id))
        .ok_or("webview not found")?;
    let settings = crate::settings_io::read_settings(&app);
    let url = settings
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .map(|p| p.url.clone())
        .ok_or("provider not found")?;
    let parsed: tauri::Url = url.parse().map_err(|_| "invalid url".to_string())?;
    wv.navigate(parsed).map_err(|e| e.to_string())
}

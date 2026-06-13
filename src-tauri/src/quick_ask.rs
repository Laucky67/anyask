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
    let Ok(parsed) = url.parse() else { return };
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(parsed))
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

/// 设置 url（校验后保存；下次创建生效；若已存在则直接导航）
pub fn set_url(app: &AppHandle, url: String) {
    // 校验 URL，非法直接忽略（避免 panic / 坏地址）
    let Ok(parsed) = url.parse::<tauri::Url>() else { return };
    let state = app.state::<AppState>();
    *state.quick_ask_url.lock().unwrap() = Some(url);
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.navigate(parsed);
    }
}

/// 定位到屏幕中下居中
fn center_bottom(win: &tauri::WebviewWindow) {
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

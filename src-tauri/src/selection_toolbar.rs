use std::time::Duration;

use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::state::AppState;

const LABEL: &str = "selection-toolbar";
const SHOW_EVENT: &str = "selection-toolbar:show";
const INIT_W: f64 = 320.0;
const INIT_H: f64 = 44.0;

/// 显示器矩形（物理像素），用于纯函数钳制。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MonitorRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

/// 把锚点 + 尺寸钳制进显示器边界，返回工具条左上角坐标（物理像素）。
/// 防溢出：右/下越界则贴边，且不小于显示器左/上边界。
fn clamp_to_monitor(anchor_x: i32, anchor_y: i32, w: i32, h: i32, mon: MonitorRect) -> (i32, i32) {
    let max_x = (mon.x + mon.w - w).max(mon.x);
    let max_y = (mon.y + mon.h - h).max(mon.y);
    let x = anchor_x.clamp(mon.x, max_x);
    let y = anchor_y.clamp(mon.y, max_y);
    (x, y)
}

/// 全局快捷键入口(按键 Released 时调用):用缓存光标坐标作锚点,捕获选区并弹工具条。
pub fn trigger(app: &AppHandle) {
    let (x, y) = crate::mouse_hook::last_position().unwrap_or_else(|| fallback_anchor(app));
    trigger_at(app, x, y, false); // 热键路径:空选也弹,维持原行为
}

/// 在指定物理锚点弹工具条:捕获选中文本 + 写 pending + 确保窗口 + 通知前端。
/// 快捷键路径用缓存坐标;划词路径用左键抬起坐标(锚点精确,不受延迟期间移动影响)。
/// `require_text=true`(划词路径):取词为空(trim 后)直接返回不弹,挡住拖滚动条/窗口等
/// "非选字拖动";`false`(热键路径):始终弹。
pub fn trigger_at(app: &AppHandle, anchor_x: i32, anchor_y: i32, require_text: bool) {
    // 让按键状态沉降:划词热键含修饰键,get-selected-text 在 Windows 合成 Ctrl+C 取值,
    // 修饰键仍按住时取值会冲突。Released + settle 是 spike 验证过的可靠时机。
    std::thread::sleep(Duration::from_millis(20));

    let text = capture_selected_text();
    println!("[selection] captured: {text:?} @ ({anchor_x},{anchor_y})");
    if require_text && text.trim().is_empty() {
        return; // 划词路径没真正选到字 → 不弹
    }

    {
        let state = app.state::<AppState>();
        let mut pending = state.pending_selection.lock().unwrap();
        pending.text = text;
        pending.x = anchor_x;
        pending.y = anchor_y;
        pending.show = true;
    }

    if let Err(e) = ensure_window(app) {
        eprintln!("[selection] ensure_window failed: {e}");
        return;
    }
    // 窗口已存在:事件唤醒前端读 pending;首次创建:前端挂载走 get_pending 兜底
    let _ = app.emit_to(LABEL, SHOW_EVENT, ());
}

/// 缓存坐标不可用(冷启动,首个 MouseMove 之前)时的兜底锚点:主屏左上。
fn fallback_anchor(app: &AppHandle) -> (i32, i32) {
    if let Some(win) = app.get_window("main") {
        if let Ok(Some(m)) = win.primary_monitor() {
            let p = m.position();
            return (p.x, p.y);
        }
    }
    (0, 0)
}

/// 取选中文本，最多 3 次重试（镜像 spike）。全部失败返回空串。
fn capture_selected_text() -> String {
    for attempt in 1..=3 {
        match get_selected_text::get_selected_text() {
            Ok(text) => return text,
            Err(error) => {
                println!("[selection] get-selected-text error attempt {attempt}: {error:?}");
                std::thread::sleep(Duration::from_millis(120 * attempt));
            }
        }
    }
    String::new()
}

/// 确保工具条窗口存在；缺则隐身创建（透明无边框、置顶、跳过任务栏）。
fn ensure_window(app: &AppHandle) -> Result<(), String> {
    if app.get_window(LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("划词工具条")
        .inner_size(INIT_W, INIT_H)
        .decorations(false)
        .transparent(true)
        // 关掉窗口级 DWM 投影：透明窗口会按整窗圆角矩形投出一圈阴影，显示为药丸外那圈
        // 多余的淡色轮廓。阴影改由药丸自身的 CSS boxShadow 提供。
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .focused(false)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 按锚点 + 尺寸（逻辑像素）把工具条窗口定位到不溢出显示器的位置（不 show）。
/// trigger 用近似 INIT 尺寸抢焦点，place_and_show 用前端实测尺寸精修，二者共用。
fn position_window(
    win: &tauri::Window,
    anchor_x: i32,
    anchor_y: i32,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let monitor = monitor_for_point(win, anchor_x, anchor_y)
        .or_else(|| win.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let pos = monitor.position();
    let size = monitor.size();
    let mon = MonitorRect {
        x: pos.x,
        y: pos.y,
        w: size.width as i32,
        h: size.height as i32,
    };
    let phys_w = ((width * scale).round() as i32).max(1);
    let phys_h = ((height * scale).round() as i32).max(1);
    let (x, y) = clamp_to_monitor(anchor_x, anchor_y, phys_w, phys_h, mon);
    win.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 定位(防溢出)并显示。仅接收前端测得的逻辑尺寸;锚点从 pending 读。
pub fn place_and_show(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let win = app.get_window(LABEL).ok_or("toolbar window not found")?;
    let (anchor_x, anchor_y) = {
        let state = app.state::<AppState>();
        let pending = state.pending_selection.lock().unwrap();
        (pending.x, pending.y)
    };
    position_window(&win, anchor_x, anchor_y, width, height)?;
    win.show().map_err(|e| e.to_string())?;

    // 记录实际物理矩形,供 mouse_hook 做"点外部隐藏"命中检测。不抢焦点:划词工具条
    // 抢焦点会让源应用失活、清掉选区;隐藏改由全局点击检测驱动(去掉了 set_focus)。
    record_toolbar_rect(app, &win);

    // 唯一汇聚点:消费 show(保留 text/x/y 供按钮动作与下次定位)
    app.state::<AppState>().pending_selection.lock().unwrap().show = false;
    Ok(())
}

/// 读窗口实际物理位置 + 尺寸,写入 AppState.toolbar_rect(Some = 可见)。
fn record_toolbar_rect(app: &AppHandle, win: &tauri::Window) {
    let rect = match (win.outer_position(), win.outer_size()) {
        (Ok(p), Ok(s)) => Some((p.x, p.y, s.width as i32, s.height as i32)),
        _ => None,
    };
    *app.state::<AppState>().toolbar_rect.lock().unwrap() = rect;
}

/// 找到包含指定物理坐标点的显示器。
fn monitor_for_point(win: &tauri::Window, x: i32, y: i32) -> Option<tauri::Monitor> {
    let monitors = win.available_monitors().ok()?;
    monitors.into_iter().find(|m| {
        let p = m.position();
        let s = m.size();
        x >= p.x && x < p.x + s.width as i32 && y >= p.y && y < p.y + s.height as i32
    })
}

/// 隐藏工具条(点外部 / 点按钮后调用,不销毁,供复用)。
pub fn hide(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_window(LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    // 清矩形:隐藏后 mouse_hook 不再把它当命中目标。
    *app.state::<AppState>().toolbar_rect.lock().unwrap() = None;
    Ok(())
}

/// 把捕获到的文本写入剪贴板（复制按钮）。
pub fn copy_selection(app: &AppHandle) -> Result<(), String> {
    let text = app
        .state::<AppState>()
        .pending_selection
        .lock()
        .unwrap()
        .text
        .clone();
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// 读取待显示状态（首帧兜底 / 事件后读 text）。只读不清。
pub fn get_pending(app: &AppHandle) -> crate::state::PendingSelection {
    app.state::<AppState>().pending_selection.lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: MonitorRect = MonitorRect { x: 0, y: 0, w: 1920, h: 1080 };

    #[test]
    fn no_overflow_returns_anchor() {
        assert_eq!(clamp_to_monitor(100, 200, 300, 44, MON), (100, 200));
    }

    #[test]
    fn right_overflow_sticks_to_right() {
        assert_eq!(clamp_to_monitor(1900, 200, 300, 44, MON), (1620, 200));
    }

    #[test]
    fn bottom_overflow_sticks_to_bottom() {
        assert_eq!(clamp_to_monitor(100, 1070, 300, 44, MON), (100, 1036));
    }

    #[test]
    fn both_overflow_sticks_to_corner() {
        assert_eq!(clamp_to_monitor(1900, 1070, 300, 44, MON), (1620, 1036));
    }

    #[test]
    fn second_monitor_offset_is_respected() {
        let m = MonitorRect { x: 1920, y: 0, w: 1920, h: 1080 };
        assert_eq!(clamp_to_monitor(3800, 100, 300, 44, m), (3540, 100));
        assert_eq!(clamp_to_monitor(1950, 100, 300, 44, m), (1950, 100));
    }
}

//! 全局鼠标钩子(rdev):缓存光标坐标、把左键按下/抬起送入处理线程做划词门控。
//! 钩子回调必须极轻——只写原子 / 发 channel,绝不在回调里碰窗口或 get-selected-text。

use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// 坐标缓存哨兵:`last_position` 在首个 MouseMove 之前返回 None。
const UNSET: i32 = i32::MIN;

static LAST_X: AtomicI32 = AtomicI32::new(UNSET);
static LAST_Y: AtomicI32 = AtomicI32::new(UNSET);

/// 输入代号:每次左键按下自增,用于作废延迟取词任务(见 schedule_capture)。
static INPUT_GEN: AtomicU64 = AtomicU64::new(0);

/// 由缓存的 (x,y) 还原光标位置;任一轴为哨兵视作未知。纯函数,便于单测。
fn decode_position(x: i32, y: i32) -> Option<(i32, i32)> {
    if x == UNSET || y == UNSET {
        None
    } else {
        Some((x, y))
    }
}

/// 最近一次缓存的光标物理坐标;首个 MouseMove 之前为 None。
pub fn last_position() -> Option<(i32, i32)> {
    decode_position(LAST_X.load(Ordering::Relaxed), LAST_Y.load(Ordering::Relaxed))
}

/// 划词触发阈值(物理像素 / 毫秒)。手动验证时可微调。
const DRAG_DIST_PX: i32 = 6;
const DRAG_MIN_MS: u64 = 80;

/// 工具条物理矩形:(x, y, w, h),左上角 + 宽高。
type Rect = (i32, i32, i32, i32);

/// 点是否落在矩形内(含左/上边,不含右/下边,与显示器命中逻辑一致)。纯函数。
fn point_in_rect(x: i32, y: i32, rect: Rect) -> bool {
    let (rx, ry, rw, rh) = rect;
    x >= rx && x < rx + rw && y >= ry && y < ry + rh
}

/// 左键抬起后的判定结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReleaseAction {
    /// 有效拖选 → 延迟后取词弹窗。
    Trigger,
    /// 普通点击 / 工具条可见 / 开关关闭 / 无配对按下 → 不动作。
    Ignore,
}

/// 纯判定:左键抬起是否应触发划词。副作用(清 press)由调用方处理。
/// 「按下即关、抬起即弹」模型:可见态点外部关工具条时也记 press,故无需 suppress——
/// 普通点击位移不足自然落入 Ignore,有效拖选才 Trigger。
/// - `had_press`:存在配对的按下(隐藏态、或可见态点外部关闭时记录)
/// - `enabled`:划词自动弹出开关
/// - `visible`:工具条当前是否可见
/// - `dist`:按下到抬起的最大轴位移(物理像素)
/// - `dur_ms`:按下到抬起时长(毫秒)
fn classify_release(
    had_press: bool,
    enabled: bool,
    visible: bool,
    dist: i32,
    dur_ms: u64,
) -> ReleaseAction {
    if !had_press || !enabled || visible {
        return ReleaseAction::Ignore;
    }
    if dist >= DRAG_DIST_PX && dur_ms >= DRAG_MIN_MS {
        ReleaseAction::Trigger
    } else {
        ReleaseAction::Ignore
    }
}

/// 取词延迟:抬起后等选区/剪贴板沉降,再调 get-selected-text。
const DELAY_MS: u64 = 80;

/// 送往处理线程的左键事件(已带缓存坐标)。
enum MouseMsg {
    Press { x: i32, y: i32 },
    Release { x: i32, y: i32 },
}

/// 在 setup 中调用一次:起 rdev 钩子线程 + 处理线程。
pub fn start(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<MouseMsg>();

    // 钩子线程:rdev::listen 阻塞,独占一条线程;回调极轻(只写原子 / 发 channel)。
    std::thread::spawn(move || {
        let handler = move |event: rdev::Event| match event.event_type {
            rdev::EventType::MouseMove { x, y } => {
                LAST_X.store(x as i32, Ordering::Relaxed);
                LAST_Y.store(y as i32, Ordering::Relaxed);
            }
            rdev::EventType::ButtonPress(rdev::Button::Left) => {
                let x = LAST_X.load(Ordering::Relaxed);
                let y = LAST_Y.load(Ordering::Relaxed);
                INPUT_GEN.fetch_add(1, Ordering::SeqCst); // 作废延迟任务
                let _ = tx.send(MouseMsg::Press { x, y });
            }
            rdev::EventType::ButtonRelease(rdev::Button::Left) => {
                let x = LAST_X.load(Ordering::Relaxed);
                let y = LAST_Y.load(Ordering::Relaxed);
                let _ = tx.send(MouseMsg::Release { x, y });
            }
            _ => {}
        };
        if let Err(e) = rdev::listen(handler) {
            eprintln!("[mouse_hook] rdev::listen failed: {e:?}");
        }
    });

    // 处理线程:门控 + 命中检测;可放心阻塞(取词放更下游的短命线程)。
    std::thread::spawn(move || process_loop(app, rx));
}

/// 处理线程主循环:维护配对的按下状态,按门控判定动作。
fn process_loop(app: AppHandle, rx: mpsc::Receiver<MouseMsg>) {
    let mut press: Option<(i32, i32, Instant)> = None;
    for msg in rx {
        let state = app.state::<AppState>();
        match msg {
            MouseMsg::Press { x, y } => {
                let rect = *state.toolbar_rect.lock().unwrap();
                match rect {
                    Some(r) if point_in_rect(x, y, r) => {
                        press = None; // 点工具条内部 → 交给按钮,不算拖选起点
                    }
                    Some(_) => {
                        // 工具条可见且点在外 → 关掉它,但仍把这次按下当候选拖选起点:
                        // 「按下即关、抬起即弹」,使"选完一段紧接着划选下一段"能在新选区重弹。
                        let _ = crate::selection_toolbar::hide(&app);
                        press = Some((x, y, Instant::now()));
                    }
                    None => {
                        press = Some((x, y, Instant::now())); // 开始候选拖选
                    }
                }
            }
            MouseMsg::Release { x, y } => {
                let taken = press.take();
                let had_press = taken.is_some();
                let enabled = state.selection_autopopup_enabled.load(Ordering::SeqCst);
                let visible = state.toolbar_rect.lock().unwrap().is_some();
                let (dist, dur_ms) = match taken {
                    Some((px, py, t0)) => (
                        (x - px).abs().max((y - py).abs()),
                        t0.elapsed().as_millis() as u64,
                    ),
                    None => (0, 0),
                };
                if classify_release(had_press, enabled, visible, dist, dur_ms)
                    == ReleaseAction::Trigger
                {
                    schedule_capture(app.clone(), x, y);
                }
            }
        }
    }
}

/// 有效拖选 → 延迟 DELAY_MS,睡醒后二次校验(代号未变 / 仍开启 / 仍不可见)才取词弹窗。
fn schedule_capture(app: AppHandle, x: i32, y: i32) {
    let gen_at_schedule = INPUT_GEN.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(DELAY_MS));
        let state = app.state::<AppState>();
        let gen_now = INPUT_GEN.load(Ordering::SeqCst);
        let enabled = state.selection_autopopup_enabled.load(Ordering::SeqCst);
        let visible = state.toolbar_rect.lock().unwrap().is_some();
        if gen_now != gen_at_schedule || !enabled || visible {
            return; // 延迟窗口内发生新输入 / 关开关 / 已可见 → 丢弃
        }
        // 划词自动路径:只读无障碍,读不到就不弹,绝不合成 Ctrl+C(挡住拖窗口误触 SIGINT)。
        crate::selection_toolbar::trigger_at(
            &app,
            x,
            y,
            true,
            crate::selection_toolbar::CaptureMode::AccessibilityOnly,
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_unset_axis_is_none() {
        assert_eq!(decode_position(UNSET, 10), None);
        assert_eq!(decode_position(10, UNSET), None);
        assert_eq!(decode_position(UNSET, UNSET), None);
    }

    #[test]
    fn decode_real_coords_is_some() {
        assert_eq!(decode_position(0, 0), Some((0, 0)));
        assert_eq!(decode_position(-5, 1280), Some((-5, 1280)));
    }

    #[test]
    fn point_in_rect_edges() {
        let r = (100, 200, 300, 44); // x:100..400, y:200..244
        assert!(point_in_rect(100, 200, r)); // 左上角(含)
        assert!(point_in_rect(399, 243, r)); // 右下内侧
        assert!(!point_in_rect(400, 220, r)); // 右边界(不含)
        assert!(!point_in_rect(220, 244, r)); // 下边界(不含)
        assert!(!point_in_rect(99, 220, r)); // 左外
        assert!(!point_in_rect(220, 199, r)); // 上外
    }

    #[test]
    fn release_ignored_branches() {
        // 无 press / 关开关 / 工具条可见,任一成立即 Ignore
        assert_eq!(classify_release(false, true, false, 100, 500), ReleaseAction::Ignore); // 无配对按下
        assert_eq!(classify_release(true, false, false, 100, 500), ReleaseAction::Ignore); // 开关关
        assert_eq!(classify_release(true, true, true, 100, 500), ReleaseAction::Ignore); // 工具条可见
    }

    #[test]
    fn plain_click_below_thresholds_is_ignored() {
        assert_eq!(classify_release(true, true, false, 5, 500), ReleaseAction::Ignore); // 距离不足
        assert_eq!(classify_release(true, true, false, 100, 79), ReleaseAction::Ignore); // 时长不足
    }

    #[test]
    fn valid_drag_triggers() {
        assert_eq!(classify_release(true, true, false, 6, 80), ReleaseAction::Trigger); // 边界值
        assert_eq!(classify_release(true, true, false, 300, 1200), ReleaseAction::Trigger);
    }
}

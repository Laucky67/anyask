//! 全局鼠标钩子(rdev):缓存光标坐标、把左键按下/抬起送入处理线程做划词门控。
//! 钩子回调必须极轻——只写原子 / 发 channel,绝不在回调里碰窗口或 get-selected-text。

use std::sync::atomic::{AtomicI32, Ordering};

/// 坐标缓存哨兵:`last_position` 在首个 MouseMove 之前返回 None。
const UNSET: i32 = i32::MIN;

static LAST_X: AtomicI32 = AtomicI32::new(UNSET);
static LAST_Y: AtomicI32 = AtomicI32::new(UNSET);

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

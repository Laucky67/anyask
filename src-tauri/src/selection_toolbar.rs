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

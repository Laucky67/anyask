use super::{clamp_to_monitor, MonitorRect};
use crate::selection_capture::SelectionRect;

#[derive(Debug, PartialEq)]
pub(super) struct Placement {
    pub x: i32,
    pub y: i32,
    pub uses_selection: bool,
    pub side: &'static str,
}

/// 合并当前工作区内的可见选区；UIA 坐标已是物理像素。
pub(super) fn visible_bounds(rects: &[SelectionRect], area: MonitorRect) -> Option<SelectionRect> {
    let mut bounds: Option<SelectionRect> = None;
    for rect in rects {
        let right = rect.x + rect.width;
        let bottom = rect.y + rect.height;
        if ![rect.x, rect.y, rect.width, rect.height, right, bottom]
            .iter()
            .all(|n| n.is_finite())
            || rect.width <= 0.0
            || rect.height <= 0.0
        {
            continue;
        }
        let left = rect.x.max(f64::from(area.x));
        let top = rect.y.max(f64::from(area.y));
        let right = right.min(f64::from(area.x) + f64::from(area.w));
        let bottom = bottom.min(f64::from(area.y) + f64::from(area.h));
        if right <= left || bottom <= top {
            continue;
        }
        bounds = Some(match bounds {
            Some(old) => {
                let new_left = old.x.min(left);
                let new_top = old.y.min(top);
                SelectionRect {
                    x: new_left,
                    y: new_top,
                    width: (old.x + old.width).max(right) - new_left,
                    height: (old.y + old.height).max(bottom) - new_top,
                }
            }
            None => SelectionRect {
                x: left,
                y: top,
                width: right - left,
                height: bottom - top,
            },
        });
    }
    bounds
}

/// 鼠标所在屏有选区时优先使用该屏；快捷键时鼠标可能在另一屏。
pub(super) fn monitor_index(
    anchor: (i32, i32),
    rects: &[SelectionRect],
    screens: &[MonitorRect],
) -> Option<usize> {
    let mouse = screens.iter().position(|area| {
        anchor.0 >= area.x
            && anchor.1 >= area.y
            && i64::from(anchor.0) < i64::from(area.x) + i64::from(area.w)
            && i64::from(anchor.1) < i64::from(area.y) + i64::from(area.h)
    });
    if let Some(index) = mouse {
        if visible_bounds(rects, screens[index]).is_some() {
            return Some(index);
        }
    }
    screens
        .iter()
        .enumerate()
        .filter_map(|(index, area)| {
            let bounds = visible_bounds(rects, *area)?;
            let dx = bounds.x + bounds.width / 2.0 - f64::from(anchor.0);
            let dy = bounds.y + bounds.height / 2.0 - f64::from(anchor.1);
            Some((index, dx * dx + dy * dy))
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|item| item.0)
        .or(mouse)
}

pub(super) fn calculate(
    anchor: (i32, i32),
    size: (f64, f64),
    scale: f64,
    rects: &[SelectionRect],
    work_area: MonitorRect,
) -> Placement {
    let width = (size.0 * scale).ceil().max(1.0) as i32;
    let height = (size.1 * scale).ceil().max(1.0) as i32;
    let gap = (8.0 * scale).ceil().max(1.0) as i32;
    let top = work_area.y;
    let bottom = f64::from(work_area.y) + f64::from(work_area.h);
    if let Some(bounds) = visible_bounds(rects, work_area) {
        let x = (bounds.x + bounds.width / 2.0 - f64::from(width) / 2.0).round() as i32;
        let above = (bounds.y - f64::from(gap) - f64::from(height)).floor() as i32;
        let below = (bounds.y + bounds.height + f64::from(gap)).ceil() as i32;
        let candidate = if above >= top {
            Some((above, "above"))
        } else if f64::from(below) + f64::from(height) <= bottom {
            Some((below, "below"))
        } else {
            None
        };
        if let Some((y, side)) = candidate {
            let (x, y) = clamp_to_monitor(x, y, width, height, work_area);
            return Placement {
                x,
                y,
                uses_selection: true,
                side,
            };
        }
    }
    // 满屏选区和缺失矩形均回退到鼠标附近，避免药丸离操作位置过远。
    let x = anchor.0.saturating_sub(width / 2);
    let above = anchor.1.saturating_sub(gap).saturating_sub(height);
    let below = anchor.1.saturating_add(gap);
    let (y, side) = if above >= top && f64::from(above) + f64::from(height) <= bottom {
        (above, "above")
    } else if below >= top && f64::from(below) + f64::from(height) <= bottom {
        (below, "below")
    } else {
        (above, "edge")
    };
    let (x, y) = clamp_to_monitor(x, y, width, height, work_area);
    Placement {
        x,
        y,
        uses_selection: false,
        side,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const AREA: MonitorRect = MonitorRect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1080,
    };

    fn rect(x: f64, y: f64, width: f64, height: f64) -> SelectionRect {
        SelectionRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn single_line_is_centered_above_text_with_gap() {
        let result = calculate(
            (590, 315),
            (300.0, 44.0),
            1.0,
            &[rect(400.0, 300.0, 200.0, 20.0)],
            AREA,
        );
        assert_eq!((result.x, result.y), (350, 248));
        assert!(result.uses_selection);
        assert_eq!(result.side, "above");
    }

    #[test]
    fn insufficient_space_above_flips_below_text() {
        let result = calculate(
            (590, 35),
            (300.0, 44.0),
            1.0,
            &[rect(400.0, 20.0, 200.0, 20.0)],
            AREA,
        );
        assert_eq!((result.x, result.y), (350, 48));
        assert_eq!(result.side, "below");
    }

    #[test]
    fn multiline_union_is_independent_of_range_order_and_drag_direction() {
        let lines = [
            rect(400.0, 240.0, 200.0, 20.0),
            rect(400.0, 200.0, 100.0, 20.0),
        ];
        let forward = calculate((590, 255), (300.0, 44.0), 1.0, &lines, AREA);
        let reversed = calculate(
            (400, 200),
            (300.0, 44.0),
            1.0,
            &[lines[1].clone(), lines[0].clone()],
            AREA,
        );
        assert_eq!(forward, reversed);
        assert_eq!((forward.x, forward.y), (350, 148));
    }

    #[test]
    fn missing_geometry_uses_mouse_above_then_below() {
        let above = calculate((590, 315), (300.0, 44.0), 1.0, &[], AREA);
        assert_eq!((above.x, above.y), (440, 263));
        assert!(!above.uses_selection);
        let below = calculate((590, 20), (300.0, 44.0), 1.0, &[], AREA);
        assert_eq!((below.x, below.y), (440, 28));
        assert_eq!(below.side, "below");
    }

    #[test]
    fn invalid_and_other_monitor_rectangles_fall_back_to_mouse() {
        let lines = [
            rect(f64::NAN, 300.0, 200.0, 20.0),
            rect(400.0, 300.0, 0.0, 20.0),
            rect(-400.0, 300.0, 100.0, 20.0),
        ];
        let result = calculate((590, 315), (300.0, 44.0), 1.0, &lines, AREA);
        assert_eq!((result.x, result.y), (440, 263));
        assert!(!result.uses_selection);
    }

    #[test]
    fn geometry_is_clipped_to_work_area_before_placement() {
        let work = MonitorRect {
            x: 0,
            y: 40,
            w: 1920,
            h: 1000,
        };
        let result = calculate(
            (590, 50),
            (300.0, 44.0),
            1.0,
            &[rect(400.0, 20.0, 200.0, 40.0)],
            work,
        );
        assert_eq!((result.x, result.y), (350, 68));
        assert_eq!(result.side, "below");
    }

    #[test]
    fn scaling_applies_to_toolbar_and_gap_but_not_selection_coordinates() {
        let result = calculate(
            (590, 315),
            (300.0, 44.0),
            1.5,
            &[rect(400.0, 300.0, 200.0, 20.0)],
            AREA,
        );
        assert_eq!((result.x, result.y), (275, 222));
    }

    #[test]
    fn negative_monitor_coordinates_are_preserved() {
        let work = MonitorRect {
            x: -1920,
            y: -1080,
            w: 1920,
            h: 1080,
        };
        let result = calculate(
            (-1450, -885),
            (300.0, 44.0),
            1.0,
            &[rect(-1600.0, -900.0, 200.0, 20.0)],
            work,
        );
        assert_eq!((result.x, result.y), (-1650, -952));
    }

    #[test]
    fn horizontal_overflow_stays_inside_work_area() {
        let result = calculate(
            (1890, 215),
            (300.0, 44.0),
            1.0,
            &[rect(1850.0, 200.0, 50.0, 20.0)],
            AREA,
        );
        assert_eq!((result.x, result.y), (1620, 148));
    }

    #[test]
    fn full_height_selection_uses_mouse_when_both_sides_are_blocked() {
        let result = calculate(
            (590, 315),
            (300.0, 44.0),
            1.0,
            &[rect(400.0, 0.0, 200.0, 1080.0)],
            AREA,
        );
        assert_eq!((result.x, result.y), (440, 263));
        assert!(!result.uses_selection);
    }

    #[test]
    fn final_position_respects_taskbar_work_area() {
        let work = MonitorRect {
            x: 0,
            y: 0,
            w: 1920,
            h: 1000,
        };
        let result = calculate((1000, 1050), (300.0, 44.0), 1.0, &[], work);
        assert_eq!((result.x, result.y), (850, 956));
    }

    #[test]
    fn keyboard_selection_uses_text_monitor_when_mouse_is_elsewhere() {
        let screens = [
            AREA,
            MonitorRect {
                x: -1920,
                y: 0,
                w: 1920,
                h: 1080,
            },
        ];
        assert_eq!(
            monitor_index((100, 300), &[rect(-1600.0, 300.0, 200.0, 20.0)], &screens),
            Some(1)
        );
    }

    #[test]
    fn spanning_selection_prefers_mouse_monitor() {
        let screens = [
            AREA,
            MonitorRect {
                x: -1920,
                y: 0,
                w: 1920,
                h: 1080,
            },
        ];
        assert_eq!(
            monitor_index((-50, 300), &[rect(-100.0, 300.0, 200.0, 20.0)], &screens),
            Some(1)
        );
    }
}

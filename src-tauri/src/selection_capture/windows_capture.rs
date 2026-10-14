//! Windows UIA 查找：自动划词优先鼠标所在元素，快捷键优先焦点。
use super::{non_empty, CapturedSelection, SelectionRect, SelectionSource};
use uiautomation::{
    patterns::UITextPattern, patterns::UITextRange, types::Point, UIAutomation, UIElement,
    UITreeWalker,
};
use windows::Win32::{
    Foundation::{HWND, POINT},
    System::{
        Com::SAFEARRAY,
        Ole::{
            SafeArrayDestroy, SafeArrayGetDim, SafeArrayGetElement, SafeArrayGetElemsize,
            SafeArrayGetLBound, SafeArrayGetUBound,
        },
    },
    UI::{
        Accessibility::IUIAutomationTextRange,
        WindowsAndMessaging::{
            GetAncestor, GetForegroundWindow, GetWindowThreadProcessId, WindowFromPoint, GA_ROOT,
        },
    },
};

/// 最多检查起点及八层父级；不扫描子树，不越过提供者进程边界。
const MAX_PARENT_DEPTH: usize = 8;

trait SelectionTree {
    type Element: Clone;
    fn process_id(&self, element: &Self::Element) -> Option<u32>;
    fn parent(&self, element: &Self::Element) -> Option<Self::Element>;
    fn selection(&self, element: &Self::Element) -> Option<CapturedSelection>;
}

fn search<T: SelectionTree>(tree: &T, start: T::Element) -> Option<CapturedSelection> {
    let process_id = tree.process_id(&start)?;
    if process_id == 0 || process_id == std::process::id() {
        return None;
    }
    let mut element = start;
    for depth in 0..=MAX_PARENT_DEPTH {
        if tree.process_id(&element) != Some(process_id) {
            break;
        }
        if let Some(selection) = tree.selection(&element) {
            return Some(selection);
        }
        if depth == MAX_PARENT_DEPTH {
            break;
        }
        element = tree.parent(&element)?;
    }
    None
}

struct UiaTree {
    walker: UITreeWalker,
    window: HWND,
    window_process_id: u32,
}

impl UiaTree {
    /// 浏览器的 UIA 提供者与顶层窗口可能属于不同进程，以原生顶层窗口确认归属。
    fn belongs_to_source(&self, start: &UIElement) -> Option<bool> {
        let mut element = start.clone();
        for depth in 0..=MAX_PARENT_DEPTH {
            if let Ok(handle) = element.get_native_window_handle() {
                if !handle.is_invalid() {
                    let hwnd: HWND = handle.into();
                    return Some(unsafe { GetAncestor(hwnd, GA_ROOT) } == self.window);
                }
            }
            if depth == MAX_PARENT_DEPTH {
                break;
            }
            let Some(parent) = self.parent(&element) else {
                break;
            };
            element = parent;
        }
        None
    }
}

impl SelectionTree for UiaTree {
    type Element = UIElement;

    fn process_id(&self, element: &UIElement) -> Option<u32> {
        element.get_process_id().ok()
    }

    fn parent(&self, element: &UIElement) -> Option<UIElement> {
        self.walker.get_parent(element).ok()
    }

    fn selection(&self, element: &UIElement) -> Option<CapturedSelection> {
        let pattern = element.get_pattern::<UITextPattern>().ok()?;
        let ranges = pattern.get_selection().ok()?;
        let mut text = String::new();
        let mut rects = Vec::new();
        for range in ranges {
            // 不完整的多选区不返回部分文本，继续尝试其他候选控件。
            let part = range.get_text(-1).ok()?;
            if part.trim().is_empty() {
                continue;
            }
            text.push_str(&part);
            rects.extend(selection_rects(&range));
        }
        let text = non_empty(text)?;
        Some(CapturedSelection {
            text,
            source: Some(SelectionSource {
                process_id: self.process_id(element)?,
                window_process_id: self.window_process_id,
                window_handle: format!("0x{:X}", self.window.0 as usize),
                rects,
            }),
        })
    }
}

pub(super) fn capture(anchor: (i32, i32), prefer_point: bool) -> Option<CapturedSelection> {
    let window = unsafe { GetForegroundWindow() };
    if window.is_invalid() {
        return None;
    }
    let mut window_process_id = 0;
    unsafe { GetWindowThreadProcessId(window, Some(&mut window_process_id)) };
    if window_process_id == 0 || window_process_id == std::process::id() {
        return None;
    }
    let automation = UIAutomation::new().ok()?;
    let tree = UiaTree {
        walker: automation.get_control_view_walker().ok()?,
        window,
        window_process_id,
    };
    let at_point = unsafe {
        WindowFromPoint(POINT {
            x: anchor.0,
            y: anchor.1,
        })
    };
    let point = if !at_point.is_invalid() && unsafe { GetAncestor(at_point, GA_ROOT) } == window {
        automation
            .element_from_point(Point::new(anchor.0, anchor.1))
            .ok()
    } else {
        None
    };
    let focus = automation.get_focused_element().ok().filter(|element| {
        tree.belongs_to_source(element).unwrap_or_else(|| {
            point.as_ref().is_some_and(|point| {
                let pid = tree.process_id(element);
                pid.is_some() && pid == tree.process_id(point)
            })
        })
    });
    let candidates = if prefer_point {
        [point, focus]
    } else {
        [focus, point]
    };
    for candidate in candidates.into_iter().flatten() {
        if candidate.is_password().unwrap_or(true) {
            continue;
        }
        if let Some(selection) = search(&tree, candidate) {
            // 读取期间若切换了应用，丢弃这个来源的结果。
            return (unsafe { GetForegroundWindow() } == window).then_some(selection);
        }
    }
    None
}

struct OwnedArray(*mut SAFEARRAY);
impl Drop for OwnedArray {
    fn drop(&mut self) {
        // GetBoundingRectangles 的返回值由调用方释放，错误路径同样释放。
        unsafe {
            let _ = SafeArrayDestroy(self.0);
        }
    }
}

fn selection_rects(range: &UITextRange) -> Vec<SelectionRect> {
    // 0.25 的包装层未提供选区矩形，使用它公开的原生接口读取 SAFEARRAY。
    let raw: &IUIAutomationTextRange = range.as_ref();
    let Ok(array) = (unsafe { raw.GetBoundingRectangles() }) else {
        return Vec::new();
    };
    if array.is_null() {
        return Vec::new();
    }
    let array = OwnedArray(array);
    let values = (|| {
        if unsafe { SafeArrayGetDim(array.0) } != 1
            || unsafe { SafeArrayGetElemsize(array.0) } != std::mem::size_of::<f64>() as u32
        {
            return None;
        }
        let lower = unsafe { SafeArrayGetLBound(array.0, 1) }.ok()?;
        let upper = unsafe { SafeArrayGetUBound(array.0, 1) }.ok()?;
        let count = i64::from(upper) - i64::from(lower) + 1;
        if count < 0 || count % 4 != 0 || count > 65_536 {
            return None;
        }
        let mut values = Vec::with_capacity(count as usize);
        for index in lower..=upper {
            let mut value = 0.0_f64;
            unsafe { SafeArrayGetElement(array.0, &index, (&mut value as *mut f64).cast()) }
                .ok()?;
            values.push(value);
        }
        Some(values)
    })();
    rects_from_values(&values.unwrap_or_default())
}

fn rects_from_values(values: &[f64]) -> Vec<SelectionRect> {
    values
        .chunks_exact(4)
        .filter_map(|rect| {
            (rect.iter().all(|value| value.is_finite()) && rect[2] > 0.0 && rect[3] > 0.0)
                .then_some(SelectionRect {
                    x: rect[0],
                    y: rect[1],
                    width: rect[2],
                    height: rect[3],
                })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct FakeTree {
        pids: Vec<Option<u32>>,
        selected: usize,
        reads: RefCell<Vec<usize>>,
    }

    impl SelectionTree for FakeTree {
        type Element = usize;
        fn process_id(&self, element: &usize) -> Option<u32> {
            self.pids.get(*element).copied().flatten()
        }
        fn parent(&self, element: &usize) -> Option<usize> {
            (*element + 1 < self.pids.len()).then_some(*element + 1)
        }
        fn selection(&self, element: &usize) -> Option<CapturedSelection> {
            self.reads.borrow_mut().push(*element);
            (*element == self.selected).then(|| CapturedSelection {
                text: "selected".into(),
                source: None,
            })
        }
    }

    fn tree(pids: Vec<Option<u32>>, selected: usize) -> FakeTree {
        FakeTree {
            pids,
            selected,
            reads: RefCell::new(Vec::new()),
        }
    }

    #[test]
    fn unsupported_leaf_falls_back_to_text_parent() {
        let tree = tree(vec![Some(10); 4], 2);
        assert_eq!(search(&tree, 0).unwrap().text, "selected");
        assert_eq!(*tree.reads.borrow(), vec![0, 1, 2]);
    }

    #[test]
    fn another_process_or_unknown_parent_is_never_read() {
        for pid in [Some(20), None] {
            let tree = tree(vec![Some(10), pid], 1);
            assert!(search(&tree, 0).is_none());
            assert_eq!(*tree.reads.borrow(), vec![0]);
        }
    }

    #[test]
    fn parent_search_has_a_hard_depth_limit() {
        let tree = tree(vec![Some(10); 20], 9);
        assert!(search(&tree, 0).is_none());
        assert_eq!(tree.reads.borrow().len(), MAX_PARENT_DEPTH + 1);
    }

    #[test]
    fn own_process_is_not_read() {
        let tree = tree(vec![Some(std::process::id())], 0);
        assert!(search(&tree, 0).is_none());
        assert!(tree.reads.borrow().is_empty());
    }

    #[test]
    fn geometry_keeps_multiple_lines_and_negative_monitor_coordinates() {
        let rects = rects_from_values(&[-100.5, 20.0, 80.0, 16.0, -100.5, 36.0, 40.0, 16.0]);
        assert_eq!(rects.len(), 2);
        assert_eq!(rects[0].x, -100.5);
        assert_eq!(rects[1].width, 40.0);
        assert!(rects_from_values(&[0.0, 0.0, 0.0, 10.0, f64::NAN, 0.0, 10.0, 10.0]).is_empty());
    }
}

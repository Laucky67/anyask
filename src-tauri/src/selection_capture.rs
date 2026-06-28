//! 无障碍取词:用 OS 无障碍 API 读「焦点元素的当前选区」,零副作用——
//! 不碰剪贴板、不合成按键(对比 get-selected-text 在 Windows/Linux 合成 Ctrl+C 的做法)。
//!
//! 这是划词自动路径能甩掉 Ctrl+C 副作用的核心:拖窗口/拖滚动条时焦点元素没有选区,
//! 直接返回 None,不会朝终端发 SIGINT。快捷键路径(用户主动按键)才保留 Ctrl+C 兜底。
//!
//! 平台:Windows = UI Automation;macOS = AX API;Linux = X11 PRIMARY selection。

/// 读「焦点元素的当前选区」,零副作用。
/// 仅当确有非空选区时返回 `Some`;无选区 / 不支持无障碍 / 出错 → `None`。
#[cfg(windows)]
pub fn focused_selection() -> Option<String> {
    // UIAutomation 走 COM。主线程(快捷键回调)可能是 STA apartment,与 crate 期望的
    // MTA 冲突;放到新起的短命线程上跑,apartment 干净,自动路径与快捷键路径都安全。
    // 所有 COM 对象只在子线程内创建/析构,跨线程回传的只有 Option<String>(Send)。
    std::thread::spawn(focused_selection_windows)
        .join()
        .ok()
        .flatten()
}

#[cfg(windows)]
fn focused_selection_windows() -> Option<String> {
    use uiautomation::patterns::UITextPattern;
    use uiautomation::UIAutomation;

    let automation = UIAutomation::new().ok()?;
    let element = automation.get_focused_element().ok()?;
    // 焦点元素不支持 TextPattern(如终端、部分自绘控件)→ Err → None。
    let text_pattern = element.get_pattern::<UITextPattern>().ok()?;
    let ranges = text_pattern.get_selection().ok()?;
    let first = ranges.into_iter().next()?;
    let text = first.get_text(-1).ok()?; // -1 = 取整段
    non_empty(text)
}

/// macOS:systemwide → kAXFocusedUIElement → kAXSelectedText。
/// 每步 `AXError != kAXErrorSuccess` 必须提前返回 None(传无效 AXUIElementRef 会 SIGSEGV)。
/// CoreFoundation 内存用 `CFType` 的 create-rule 包装自动 `CFRelease`。
/// 需「辅助功能」权限——与 rdev 同一道门。
#[cfg(target_os = "macos")]
pub fn focused_selection() -> Option<String> {
    use accessibility_sys::{
        kAXErrorSuccess, kAXFocusedUIElementAttribute, kAXSelectedTextAttribute,
        AXUIElementCopyAttributeValue, AXUIElementCreateSystemWide, AXUIElementRef,
    };
    use core_foundation::base::{CFType, CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};

    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return None;
        }
        // +1 引用,包起来在作用域结束时 CFRelease。
        let _system_wide_guard = CFType::wrap_under_create_rule(system_wide as CFTypeRef);

        // 焦点元素
        let focused_attr = CFString::from_static_string(kAXFocusedUIElementAttribute);
        let mut focused_ref: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(
            system_wide,
            focused_attr.as_concrete_TypeRef(),
            &mut focused_ref,
        ) != kAXErrorSuccess
            || focused_ref.is_null()
        {
            return None;
        }
        let focused = CFType::wrap_under_create_rule(focused_ref);

        // 选中文本
        let selected_attr = CFString::from_static_string(kAXSelectedTextAttribute);
        let mut selected_ref: CFTypeRef = std::ptr::null();
        if AXUIElementCopyAttributeValue(
            focused.as_concrete_TypeRef() as AXUIElementRef,
            selected_attr.as_concrete_TypeRef(),
            &mut selected_ref,
        ) != kAXErrorSuccess
            || selected_ref.is_null()
        {
            return None;
        }
        let text = CFString::wrap_under_create_rule(selected_ref as CFStringRef).to_string();
        non_empty(text)
    }
}

/// Linux:读 X11 PRIMARY selection(选中即入 PRIMARY,读取被动、零副作用)。
///
/// 已知权衡:PRIMARY 会保留「上一次选中」的文本,拖窗口不会改变它 —— 朴素读取在 X11 上
/// 可能用旧选区误弹一次(但**绝不会 SIGINT**,核心痛点已解)。后续可加「按下时快照 PRIMARY、
/// 抬起时对比是否变化」消除旧选区误弹,或上 AT-SPI 走真正的焦点元素选区。
/// Wayland 下 PRIMARY 访问受限,是已知短板。
#[cfg(target_os = "linux")]
pub fn focused_selection() -> Option<String> {
    use arboard::{Clipboard, GetExtLinux, LinuxClipboardKind};

    let mut clipboard = Clipboard::new().ok()?;
    let text = clipboard
        .get()
        .clipboard(LinuxClipboardKind::Primary)
        .text()
        .ok()?;
    non_empty(text)
}

/// 其它平台:暂不支持无障碍取词。
#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn focused_selection() -> Option<String> {
    None
}

/// trim 后为空 → None,否则原样返回(保留首尾空白,镜像 get-selected-text 行为)。纯函数。
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
fn non_empty(text: String) -> Option<String> {
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_empty_filters_blank() {
        assert_eq!(non_empty(String::new()), None);
        assert_eq!(non_empty("   \t\n".into()), None);
    }

    #[test]
    fn non_empty_keeps_text_verbatim() {
        assert_eq!(non_empty("hi".into()), Some("hi".into()));
        // 非空则保留首尾空白
        assert_eq!(non_empty("  hi  ".into()), Some("  hi  ".into()));
    }
}

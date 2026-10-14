//! 无障碍取词:用 OS 无障碍 API 读「焦点元素的当前选区」,零副作用——
//! 不碰剪贴板、不合成按键(对比 get-selected-text 在 Windows/Linux 合成 Ctrl+C 的做法)。
//!
//! 自动路径只读选区，不模拟复制。源应用可能保留旧选区；这里不判断滚动条手势。
//!
//! 平台:Windows = UI Automation;macOS = AX API;Linux = X11 PRIMARY selection。

#[cfg(windows)]
mod windows_capture;

/// 选区矩形使用屏幕物理坐标；多行选区保留各行矩形，不以控件矩形代替。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SelectionRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SelectionSource {
    /// UIA 提供者进程可能与浏览器顶层窗口进程不同，分别记录。
    pub process_id: u32,
    pub window_process_id: u32,
    /// 使用字符串避免 JavaScript 对窗口句柄的整数精度损失。
    pub window_handle: String,
    pub rects: Vec<SelectionRect>,
}

#[derive(Debug, Clone)]
pub struct CapturedSelection {
    pub text: String,
    pub source: Option<SelectionSource>,
}

/// 自动路径优先鼠标位置；快捷键优先焦点，鼠标不必停在所选文字上。
pub fn capture_selection(anchor: (i32, i32), prefer_point: bool) -> Option<CapturedSelection> {
    #[cfg(windows)]
    {
        // COM 对象在独立线程内创建和析构，只传回文本和普通来源数据。
        std::thread::spawn(move || windows_capture::capture(anchor, prefer_point))
            .join()
            .ok()
            .flatten()
    }
    #[cfg(not(windows))]
    {
        let _ = (anchor, prefer_point);
        focused_selection().map(|text| CapturedSelection { text, source: None })
    }
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

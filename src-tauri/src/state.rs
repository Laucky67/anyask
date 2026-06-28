use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64},
    Mutex,
};

/// 快捷提问窗当前应加载的 url（运行时可被设置覆盖）
#[derive(Default)]
pub struct AppState {
    pub quick_ask_url: Mutex<Option<String>>,
    /// 快捷提问窗是否「置顶」。单一来源：呼出时的临时 raise 据此决定是否在
    /// 抬到最前后恢复非置顶（默认 false = 不长期置顶，仅呼出瞬间抬前）。
    pub quick_ask_pinned: Mutex<bool>,
    /// 单调递增 token，用于让隐藏后注销任务失效。
    pub quick_ask_reset_generation: AtomicU64,
    /// 单调递增 token，用于让后一次 prompt 注入取消前一次尚未完成的注入。
    pub quick_ask_prompt_generation: AtomicU64,
    /// 记录快捷提问窗口整体焦点。AI 子 WebView 获取输入焦点时，父窗口
    /// is_focused() 可能不稳定，因此快捷键隐藏逻辑不能只依赖父窗口查询。
    pub quick_ask_focused: AtomicBool,
    /// 串行化 AI webview 同步，避免并发 sync_ai_webviews 在 ensure() 里
    /// 「检查存在 → 创建」之间竞态导致重复 add_child（"already exists"）。
    pub webview_sync: tauri::async_runtime::Mutex<()>,
    /// 记录每个 AI webview 创建时所用的 url，用于检测 url 变更后重建 webview
    pub ai_webview_urls: Mutex<HashMap<String, String>>,
    /// 划词工具条待显示状态：trigger 写入，前端 get_pending / place_and_show 读消费。
    pub pending_selection: Mutex<PendingSelection>,
    /// 划词工具条当前物理矩形:可见时 Some(x,y,w,h),隐藏时 None。
    /// place_and_show 写入,hide 清空;mouse_hook 处理线程据此做"点外部隐藏"命中检测。
    pub toolbar_rect: Mutex<Option<(i32, i32, i32, i32)>>,
    /// 划词自动弹出开关(运行态镜像 StoredSettings.selection_auto_popup)。
    /// 注意:AtomicBool::default() 为 false;真值由 setup 读设置后写入(见 lib.rs)。
    pub selection_autopopup_enabled: AtomicBool,
}

/// 划词捕获的待显示状态（运行时，不持久化）。
/// `x`/`y` 为鼠标物理像素锚点；`show` 由 trigger 置真、由 place_and_show 消费。
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct PendingSelection {
    pub text: String,
    pub x: i32,
    pub y: i32,
    pub show: bool,
}

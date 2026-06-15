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
    /// 记录快捷提问窗口整体焦点。AI 子 WebView 获取输入焦点时，父窗口
    /// is_focused() 可能不稳定，因此快捷键隐藏逻辑不能只依赖父窗口查询。
    pub quick_ask_focused: AtomicBool,
    /// 串行化 AI webview 同步，避免并发 sync_ai_webviews 在 ensure() 里
    /// 「检查存在 → 创建」之间竞态导致重复 add_child（"already exists"）。
    pub webview_sync: tauri::async_runtime::Mutex<()>,
}

use std::sync::Mutex;

/// 快捷提问窗当前应加载的 url（运行时可被设置覆盖）
#[derive(Default)]
pub struct AppState {
    pub quick_ask_url: Mutex<Option<String>>,
    /// 串行化 AI webview 同步，避免并发 sync_ai_webviews 在 ensure() 里
    /// 「检查存在 → 创建」之间竞态导致重复 add_child（"already exists"）。
    pub webview_sync: tauri::async_runtime::Mutex<()>,
}

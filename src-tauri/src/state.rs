use std::sync::Mutex;

/// 快捷提问窗当前应加载的 url（运行时可被设置覆盖）
#[derive(Default)]
pub struct AppState {
    pub quick_ask_url: Mutex<Option<String>>,
}

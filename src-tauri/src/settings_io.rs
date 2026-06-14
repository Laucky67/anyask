use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const DEFAULT_QUICK_ASK: &str = "CommandOrControl+Space";
const DEFAULT_SHOW_MAIN: &str = "CommandOrControl+Shift+Space";
const DEFAULT_QUICK_ASK_PROVIDER: &str = "chatgpt";

fn default_quick_ask() -> String { DEFAULT_QUICK_ASK.into() }
fn default_show_main() -> String { DEFAULT_SHOW_MAIN.into() }
fn default_quick_ask_provider() -> String { DEFAULT_QUICK_ASK_PROVIDER.into() }

#[derive(Debug, Clone, Deserialize)]
pub struct Hotkeys {
    #[serde(rename = "quickAsk", default = "default_quick_ask")]
    pub quick_ask: String,
    #[serde(rename = "showMain", default = "default_show_main")]
    pub show_main: String,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self { quick_ask: default_quick_ask(), show_main: default_show_main() }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderLite {
    pub id: String,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StoredSettings {
    #[serde(default)]
    pub hotkeys: Hotkeys,
    #[serde(rename = "quickAskProviderId", default = "default_quick_ask_provider")]
    pub quick_ask_provider_id: String,
    #[serde(default)]
    pub providers: Vec<ProviderLite>,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            hotkeys: Hotkeys::default(),
            quick_ask_provider_id: default_quick_ask_provider(),
            providers: Vec::new(),
        }
    }
}

/// 读取设置；逐字段容错：`#[serde(default)]` 保证缺字段用默认而非整体失败，
/// 仅在 store 不存在或 JSON 完全无法解析时才整体回退默认。
pub fn read_settings(app: &AppHandle) -> StoredSettings {
    let Ok(store) = app.store("settings.json") else { return StoredSettings::default() };
    let Some(value) = store.get("settings") else { return StoredSettings::default() };
    serde_json::from_value::<StoredSettings>(value).unwrap_or_default()
}

/// 取快捷提问窗要加载的 url（找不到则用 chatgpt 兜底）
pub fn quick_ask_url(s: &StoredSettings) -> String {
    s.providers
        .iter()
        .find(|p| p.id == s.quick_ask_provider_id)
        .map(|p| p.url.clone())
        .unwrap_or_else(|| "https://chatgpt.com".into())
}

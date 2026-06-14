use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::quick_ask;
use crate::settings_io::read_settings;

/// 每个快捷键的注册结果，回传前端用于显示冲突/失败
#[derive(Debug, Clone, Serialize)]
pub struct HotkeyRegistration {
    #[serde(rename = "quickAsk")]
    pub quick_ask: bool,
    #[serde(rename = "showMain")]
    pub show_main: bool,
}

/// 注销全部并按当前设置重新注册；返回每个键是否注册成功
pub fn register_from_settings(app: &AppHandle) -> HotkeyRegistration {
    let _ = app.global_shortcut().unregister_all();
    let s = read_settings(app);
    HotkeyRegistration {
        quick_ask: register_one(app, &s.hotkeys.quick_ask, quick_ask::toggle),
        show_main: register_one(app, &s.hotkeys.show_main, crate::tray::show_main),
    }
}

/// 解析并注册单个快捷键；解析失败或注册失败（如与系统/输入法冲突）返回 false
fn register_one(app: &AppHandle, accelerator: &str, action: fn(&AppHandle)) -> bool {
    let Ok(shortcut) = accelerator.parse::<Shortcut>() else { return false };
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                action(app);
            }
        })
        .is_ok()
}

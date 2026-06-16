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
    #[serde(rename = "selectionToolbar")]
    pub selection_toolbar: bool,
}

/// 注销全部并按当前设置重新注册；返回每个键是否注册成功
pub fn register_from_settings(app: &AppHandle) -> HotkeyRegistration {
    let _ = app.global_shortcut().unregister_all();
    let s = read_settings(app);
    HotkeyRegistration {
        quick_ask: register_one(app, &s.hotkeys.quick_ask, quick_ask::toggle),
        show_main: register_one(app, &s.hotkeys.show_main, crate::tray::show_main),
        // 划词键走 Released：含修饰键时 Released + settle 取选区才可靠（见模块注释）
        selection_toolbar: register_state(
            app,
            &s.hotkeys.selection_toolbar,
            ShortcutState::Released,
            crate::selection_toolbar::trigger,
        ),
    }
}

/// 注册单个快捷键（Pressed 触发）；解析失败或注册失败返回 false
fn register_one(app: &AppHandle, accelerator: &str, action: fn(&AppHandle)) -> bool {
    register_state(app, accelerator, ShortcutState::Pressed, action)
}

/// 注册单个快捷键，可指定在 Pressed 还是 Released 时触发动作。
fn register_state(
    app: &AppHandle,
    accelerator: &str,
    state: ShortcutState,
    action: fn(&AppHandle),
) -> bool {
    let Ok(shortcut) = accelerator.parse::<Shortcut>() else {
        return false;
    };
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _sc, event| {
            if event.state == state {
                action(app);
            }
        })
        .is_ok()
}

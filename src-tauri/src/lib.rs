// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod mouse_hook;
mod provider_utils;
mod quick_ask;
mod selection_capture;
mod selection_toolbar;
mod settings_io;
mod shortcuts;
mod state;
mod tray;
mod webviews;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(state::AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            tray::build_tray(app.handle())?;
            shortcuts::register_from_settings(app.handle());
            // 划词自动弹出开关:先读设置写入运行态原子,再启动全局鼠标钩子,
            // 保证处理线程不会读到 AtomicBool 默认的 false(见 state.rs 注释)。
            let enabled = settings_io::read_settings(app.handle()).selection_auto_popup;
            app.state::<state::AppState>()
                .selection_autopopup_enabled
                .store(enabled, std::sync::atomic::Ordering::SeqCst);
            mouse_hook::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
                return;
            }

            if window.label() == "quick-ask" {
                if let WindowEvent::Focused(focused) = event {
                    quick_ask::set_focused(window.app_handle(), *focused);
                    if *focused {
                        quick_ask::cancel_pending_reset(window.app_handle());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::apply_hotkeys,
            commands::show_main_window,
            commands::toggle_quick_ask,
            commands::set_quick_ask_provider,
            commands::set_quick_ask_ai_visible,
            commands::hide_quick_ask,
            commands::set_quick_ask_pinned,
            commands::quick_ask_new_chat,
            commands::place_and_show_selection_toolbar,
            commands::hide_selection_toolbar,
            commands::get_pending_selection_show,
            commands::copy_selection,
            commands::set_selection_auto_popup,
            commands::show_quick_ask,
            commands::add_provider,
            commands::validate_and_save_provider,
            commands::delete_provider,
            webviews::sync_ai_webviews,
            webviews::hide_ai_webviews,
            webviews::reposition_ai_webviews,
            webviews::refresh_active_ai_webview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

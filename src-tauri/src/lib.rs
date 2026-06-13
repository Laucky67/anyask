// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod commands;
mod quick_ask;
mod settings_io;
mod shortcuts;
mod state;
mod tray;
mod webviews;

use tauri::WindowEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            tray::build_tray(app.handle())?;
            shortcuts::register_from_settings(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::apply_hotkeys,
            commands::show_main_window,
            commands::toggle_quick_ask,
            commands::set_quick_ask_provider,
            webviews::sync_ai_webviews,
            webviews::hide_ai_webviews,
            webviews::reposition_ai_webviews
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

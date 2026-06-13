// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod tray;
mod webviews;

use tauri::WindowEvent;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            tray::build_tray(app.handle())?;
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
            greet,
            webviews::sync_ai_webviews,
            webviews::hide_ai_webviews,
            webviews::reposition_ai_webviews
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

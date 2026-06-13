use tauri::AppHandle;

use crate::quick_ask;
use crate::shortcuts;
use crate::tray;

#[tauri::command]
pub fn apply_hotkeys(app: AppHandle) -> shortcuts::HotkeyRegistration {
    shortcuts::register_from_settings(&app)
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    tray::show_main(&app);
}

#[tauri::command]
pub fn toggle_quick_ask(app: AppHandle) {
    quick_ask::toggle(&app);
}

#[tauri::command]
pub fn set_quick_ask_provider(app: AppHandle, url: String) {
    quick_ask::set_url(&app, url);
}

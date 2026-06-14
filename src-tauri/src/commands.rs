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
pub fn set_quick_ask_provider(app: AppHandle, url: String) -> Result<(), String> {
    quick_ask::set_url(&app, url)
}

#[tauri::command]
pub fn set_quick_ask_ai_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    quick_ask::set_ai_visible(&app, visible)
}

#[tauri::command]
pub fn hide_quick_ask(app: AppHandle) -> Result<(), String> {
    quick_ask::hide(&app)
}

#[tauri::command]
pub fn set_quick_ask_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    quick_ask::set_pinned(&app, pinned)
}

#[tauri::command]
pub fn quick_ask_new_chat(app: AppHandle) -> Result<(), String> {
    quick_ask::new_chat(&app)
}

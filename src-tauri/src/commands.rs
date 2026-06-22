use tauri::AppHandle;

use std::path::PathBuf;
use tauri::Manager;

use crate::provider_utils::{
    decode_png_data_url, hash_color_from_name, validate_provider_name, validate_provider_url,
    LogoAction, LogoResult,
};
use crate::quick_ask;
use crate::selection_toolbar;
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

#[tauri::command]
pub fn place_and_show_selection_toolbar(
    app: AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    selection_toolbar::place_and_show(&app, width, height)
}

#[tauri::command]
pub fn hide_selection_toolbar(app: AppHandle) -> Result<(), String> {
    selection_toolbar::hide(&app)
}

#[tauri::command]
pub fn get_pending_selection_show(app: AppHandle) -> crate::state::PendingSelection {
    selection_toolbar::get_pending(&app)
}

#[tauri::command]
pub fn copy_selection(app: AppHandle) -> Result<(), String> {
    selection_toolbar::copy_selection(&app)
}

#[tauri::command]
pub fn show_quick_ask(app: AppHandle) {
    quick_ask::show_deferred(app);
}

/// 确保 logo 目录存在并返回它
fn logo_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("provider-logos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn logo_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(logo_dir(app)?.join(format!("{id}.png")))
}

/// 处理 Logo 操作：keep 返回现有文件路径，upload 解码落盘，generate 删旧文件并返回字母色。
/// allow_keep=false 用于新增场景（不应出现 keep）。
fn apply_logo_action(
    app: &AppHandle,
    id: &str,
    action: LogoAction,
    allow_keep: bool,
) -> Result<LogoResult, String> {
    match action {
        LogoAction::Keep => {
            if !allow_keep {
                return Err("logoInvalidFormat".into());
            }
            let path = logo_path(app, id)?;
            Ok(LogoResult::Image {
                path: path.to_string_lossy().into_owned(),
            })
        }
        LogoAction::Upload { data_url } => {
            let bytes = decode_png_data_url(&data_url)?;
            let path = logo_path(app, id)?;
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            Ok(LogoResult::Image {
                path: path.to_string_lossy().into_owned(),
            })
        }
        LogoAction::Generate { name } => {
            // 切回字母 Logo 时清掉可能存在的旧图片文件
            let _ = std::fs::remove_file(logo_path(app, id)?);
            Ok(LogoResult::Letter {
                color: hash_color_from_name(&name),
            })
        }
    }
}

#[tauri::command]
pub fn add_provider(
    app: AppHandle,
    name: String,
    url: String,
    enabled: bool,
    logo_action: LogoAction,
) -> Result<(String, LogoResult), String> {
    validate_provider_name(&name)?;
    validate_provider_url(&url)?;
    let _ = enabled; // 启用状态由前端写入 settings，这里仅作为参数占位
    let id: String = uuid::Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(8)
        .collect();
    let logo = apply_logo_action(&app, &id, logo_action, false)?;
    Ok((id, logo))
}

#[tauri::command]
pub fn validate_and_save_provider(
    app: AppHandle,
    id: String,
    name: String,
    url: String,
    enabled: bool,
    logo_action: LogoAction,
) -> Result<LogoResult, String> {
    validate_provider_name(&name)?;
    validate_provider_url(&url)?;
    // 防御性：停用时确保仍有其它启用项（前端 UI 已先拦截，此处兜底）
    if !enabled {
        let settings = crate::settings_io::read_settings(&app);
        if !crate::settings_io::other_enabled_exists(&settings.providers, &id) {
            return Err("atLeastOneEnabled".into());
        }
    }
    apply_logo_action(&app, &id, logo_action, true)
}

#[tauri::command]
pub fn delete_provider(app: AppHandle, id: String) -> Result<(), String> {
    // 防御性：删除前从 settings.json 校验删除后仍有其它启用项（前端 UI 已先禁用按钮，此处兜底）。
    // 依赖删除「前」的 settings——前端必须先调本命令、再 updateSettings，不可反序。
    let settings = crate::settings_io::read_settings(&app);
    if !crate::settings_io::other_enabled_exists(&settings.providers, &id) {
        return Err("atLeastOneEnabled".into());
    }
    // 文件可能不存在（字母 Logo），忽略 NotFound
    let _ = std::fs::remove_file(logo_path(&app, &id)?);
    Ok(())
}

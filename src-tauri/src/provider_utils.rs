use serde::{Deserialize, Serialize};
use tauri::Url;

/// 前端发来的 Logo 操作意图
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogoAction {
    Keep,
    Upload {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    Generate {
        name: String,
    },
}

/// 命令返回给前端的 Logo 结果（image.path 为文件绝对路径，前端用 convertFileSrc 转 URL）
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LogoResult {
    Letter { color: String },
    Image { path: String },
}

const PALETTE: [&str; 8] = [
    "#10A37F", "#D97757", "#4285F4", "#E94235", "#34A853", "#FBBC04", "#9333EA", "#EC4899",
];

/// 由名称稳定哈希出一个固定调色板颜色
pub fn hash_color_from_name(name: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    let index = (hasher.finish() as usize) % PALETTE.len();
    PALETTE[index].to_string()
}

const MAX_NAME_CHARS: usize = 20;

/// 校验名称：非空、去首尾空格、码点数 ≤ 20；成功返回 trim 后的名称
pub fn validate_provider_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("nameRequired".into());
    }
    if trimmed.chars().count() > MAX_NAME_CHARS {
        return Err("nameTooLong".into());
    }
    Ok(trimmed.to_string())
}

/// 校验 URL：非空、可解析、scheme 为 http/https；成功返回 trim 后的 URL
pub fn validate_provider_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("urlRequired".into());
    }
    let parsed = Url::parse(trimmed).map_err(|_| "urlInvalid".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("urlInvalid".into());
    }
    Ok(trimmed.to_string())
}

const PNG_MAGIC: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/// 从 data URL（data:image/png;base64,XXXX）解码出字节，校验声明类型与 PNG 魔数
pub fn decode_png_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let comma = data_url.find(',').ok_or("logoInvalidFormat")?;
    let (header, rest) = data_url.split_at(comma);
    if !header.contains("image/png") {
        return Err("logoInvalidFormat".into());
    }
    let bytes = STANDARD
        .decode(&rest[1..])
        .map_err(|_| "logoInvalidFormat".to_string())?;
    if bytes.len() < 8 || bytes[..8] != PNG_MAGIC {
        return Err("logoInvalidFormat".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_color_is_stable_and_in_palette() {
        let c = hash_color_from_name("ChatGPT");
        assert_eq!(c, hash_color_from_name("ChatGPT"));
        assert!(PALETTE.contains(&c.as_str()));
    }

    #[test]
    fn name_validation() {
        assert_eq!(validate_provider_name(""), Err("nameRequired".into()));
        assert_eq!(validate_provider_name("   "), Err("nameRequired".into()));
        assert_eq!(
            validate_provider_name(&"a".repeat(21)),
            Err("nameTooLong".into())
        );
        assert_eq!(
            validate_provider_name("  ChatGPT  "),
            Ok("ChatGPT".to_string())
        );
        assert_eq!(
            validate_provider_name(&"😀".repeat(20)),
            Ok("😀".repeat(20))
        );
    }

    #[test]
    fn url_validation() {
        assert_eq!(validate_provider_url(""), Err("urlRequired".into()));
        assert_eq!(validate_provider_url("notaurl"), Err("urlInvalid".into()));
        assert_eq!(
            validate_provider_url("ftp://x.com"),
            Err("urlInvalid".into())
        );
        assert_eq!(
            validate_provider_url("  https://chatgpt.com  "),
            Ok("https://chatgpt.com".to_string())
        );
    }

    #[test]
    fn png_data_url_decode() {
        // "iVBORw0KGgo=" 解码即 PNG 8 字节魔数
        assert!(decode_png_data_url("data:image/png;base64,iVBORw0KGgo=").is_ok());
        // 声明非 png
        assert_eq!(
            decode_png_data_url("data:image/jpeg;base64,iVBORw0KGgo="),
            Err("logoInvalidFormat".into())
        );
        // 魔数不符
        assert_eq!(
            decode_png_data_url("data:image/png;base64,AAAA"),
            Err("logoInvalidFormat".into())
        );
        // 无逗号
        assert_eq!(
            decode_png_data_url("notadataurl"),
            Err("logoInvalidFormat".into())
        );
    }
}

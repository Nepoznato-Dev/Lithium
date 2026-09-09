//! Agent modes and AI block parsing.
//! Ported from coreNative.js lines 388-447.

use serde::Serialize;

#[derive(Serialize)]
pub struct ApiCall {
    pub api: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Serialize)]
pub struct WidgetBlock {
    pub name: String,
    pub code: String,
}

pub fn extract_api_calls(text: &str) -> Vec<ApiCall> {
    let mut calls = Vec::new();
    let mut rest = text;
    while let Some(pos) = rest.find("```api") {
        let after = &rest[pos + 6..];
        let trimmed = after.trim_start();
        if let Some(end) = trimmed.find("```") {
            let block = trimmed[..end].trim();
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(block) {
                match parsed {
                    serde_json::Value::Array(items) => {
                        for item in items {
                            if let Some(api) = item.get("api").and_then(|v| v.as_str()) {
                                calls.push(ApiCall {
                                    api: api.to_string(),
                                    params: item.get("params").cloned().unwrap_or(serde_json::json!({})),
                                });
                            }
                        }
                    }
                    serde_json::Value::Object(_) => {
                        if let Some(api) = parsed.get("api").and_then(|v| v.as_str()) {
                            calls.push(ApiCall {
                                api: api.to_string(),
                                params: parsed.get("params").cloned().unwrap_or(serde_json::json!({})),
                            });
                        }
                    }
                    _ => {}
                }
            }
            rest = &trimmed[end + 3..];
        } else { break; }
    }
    calls
}

fn extract_widget_name(code: &str, index: usize) -> String {
    for line in code.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") {
            let comment = trimmed[2..].trim();
            if comment.to_lowercase().starts_with("widget:") {
                let name = comment[7..].trim();
                let sanitized: String = name.chars()
                    .filter(|c| !"\\/:*?\"<>|".contains(*c))
                    .take(48)
                    .collect();
                if !sanitized.is_empty() { return sanitized; }
            }
        }
    }
    format!("AI Widget {}", index + 1)
}

pub fn extract_widget_blocks(text: &str) -> Vec<WidgetBlock> {
    let mut blocks = Vec::new();
    let mut rest = text;
    while let Some(pos) = rest.find("```widget") {
        let after = &rest[pos + 9..];
        let trimmed = after.trim_start();
        if let Some(end) = trimmed.find("```") {
            let code = trimmed[..end].trim().to_string();
            let name = extract_widget_name(&code, blocks.len());
            blocks.push(WidgetBlock { name, code });
            rest = &trimmed[end + 3..];
        } else { break; }
    }
    blocks
}

pub fn strip_tool_blocks(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    while !rest.is_empty() {
        if let Some(pos) = rest.find("```") {
            let after = &rest[pos + 3..];
            let is_api = after.starts_with("api");
            let is_widget = after.starts_with("widget");
            if is_api || is_widget {
                result.push_str(&rest[..pos]);
                let skip = if is_api { 3 } else { 6 };
                let after_tag = &after[skip..];
                if let Some(end) = after_tag.find("```") {
                    rest = &after_tag[end + 3..];
                } else { break; }
            } else {
                result.push_str(&rest[..pos + 3]);
                rest = after;
            }
        } else {
            result.push_str(rest);
            break;
        }
    }
    result.trim().to_string()
}

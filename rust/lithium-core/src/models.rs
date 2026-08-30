//! Model registry — catalog data, URL parsing, search/filter, slug generation.

use crate::{get, write_json, json_escape, Parser, Value};

/// Slugify a model name: lowercase, replace non-alphanumeric with hyphens.
pub fn slugify(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let text = get(&obj, "text")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("model");

    let slug = slugify_str(text);
    Some(format!("\"{}\"", slug))
}

pub fn slugify_str(text: &str) -> String {
    let clean: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse consecutive hyphens and trim
    let mut result = String::with_capacity(clean.len());
    let mut prev_dash = true; // start true to trim leading dashes
    for c in clean.chars() {
        if c == '-' {
            if !prev_dash {
                result.push('-');
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    // Trim trailing dash
    if result.ends_with('-') {
        result.pop();
    }
    result.truncate(48);
    if result.is_empty() { "model".to_string() } else { result }
}

/// Parse a Hugging Face URL into { repoId, path } or null.
/// Input: `{"url": "https://huggingface.co/user/repo/tree/main/path"}`
pub fn parse_hf_url(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let url = get(&obj, "url")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    match parse_hf_url_str(url) {
        Some((repo_id, path)) => {
            Some(format!("{{\"repoId\":\"{}\",\"path\":\"{}\"}}", json_escape(&repo_id), json_escape(&path)))
        }
        None => Some("null".to_string()),
    }
}

fn parse_hf_url_str(url: &str) -> Option<(String, String)> {
    // Simple URL parsing without std::net::Url (not available in no_std wasm)
    let trimmed = url.trim();

    // Check for huggingface.co domain
    let after_scheme = if trimmed.starts_with("https://") {
        &trimmed[8..]
    } else if trimmed.starts_with("http://") {
        &trimmed[7..]
    } else {
        return None;
    };

    let host_end = after_scheme.find('/').unwrap_or(after_scheme.len());
    let host = &after_scheme[..host_end];
    if !host.ends_with("huggingface.co") && !host.ends_with("huggingface.co.") {
        return None;
    }

    let path = if host_end < after_scheme.len() {
        &after_scheme[host_end + 1..]
    } else {
        return None;
    };

    let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if parts.len() < 2 {
        return None;
    }

    let repo_id = format!("{}/{}", parts[0], parts[1]);

    if parts.len() < 3 {
        return Some((repo_id, String::new()));
    }

    match parts[2] {
        "resolve" => None, // direct file link
        "tree" => Some((repo_id, parts[3..].join("/"))),
        "blob" => {
            let sub_path = if parts.len() > 4 {
                parts[3..parts.len() - 1].join("/")
            } else {
                String::new()
            };
            Some((repo_id, sub_path))
        }
        _ => None, // discussions, commits, etc.
    }
}

/// Build a direct download URL for a HF repo file.
/// Input: `{"repoId": "user/repo", "file": "model.gguf"}`
pub fn hf_resolve_url(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let repo_id = get(&obj, "repoId")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    let file = get(&obj, "file")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let url = format!("https://huggingface.co/{}/resolve/main/{}", repo_id, file);
    Some(format!("\"{}\"", url))
}

/// Search/filter models by query string.
/// Input: `{"models": [...], "query": "qwen", "tier": "efficient"}`
/// Output: filtered array of models.
pub fn search_models(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };

    let models = get(&root_obj, "models")?;
    let query = get(&root_obj, "query")
        .and_then(|v| match v { Value::Str(s) => Some(s.to_lowercase()), _ => None })
        .unwrap_or_default();
    let tier_filter = get(&root_obj, "tier")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None });

    let Value::Arr(models_arr) = models else { return None };

    let filtered: Vec<&Value> = models_arr.iter().filter(|m| {
        if let Value::Obj(obj) = m {
            // Tier filter
            if let Some(tier) = tier_filter {
                let model_tier = get(obj, "tier")
                    .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                    .unwrap_or("");
                if model_tier != tier {
                    return false;
                }
            }
            // Text search
            if !query.is_empty() {
                let name = get(obj, "name")
                    .and_then(|v| match v { Value::Str(s) => Some(s.to_lowercase()), _ => None })
                    .unwrap_or_default();
                let blurb = get(obj, "blurb")
                    .and_then(|v| match v { Value::Str(s) => Some(s.to_lowercase()), _ => None })
                    .unwrap_or_default();
                let params = get(obj, "params")
                    .and_then(|v| match v { Value::Str(s) => Some(s.to_lowercase()), _ => None })
                    .unwrap_or_default();
                if !name.contains(&query) && !blurb.contains(&query) && !params.contains(&query) {
                    return false;
                }
            }
            true
        } else {
            false
        }
    }).collect();

    let mut out = String::new();
    out.push('[');
    for (idx, item) in filtered.iter().enumerate() {
        if idx > 0 { out.push(','); }
        write_json(item, &mut out);
    }
    out.push(']');
    Some(out)
}

/// Generate a download slug from a file name.
/// Input: `{"name": "My Model v2.0"}` → Output: `"my-model-v20"`
pub fn download_slug(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let name = get(&obj, "name")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();

    // Collapse consecutive hyphens, trim, limit to 60 chars
    let mut result = String::with_capacity(slug.len());
    let mut prev_dash = true;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash { result.push('-'); }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    if result.ends_with('-') { result.pop(); }
    result.truncate(60);

    Some(format!("\"{}\"", result))
}

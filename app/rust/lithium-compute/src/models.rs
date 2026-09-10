//! Model registry helpers — slugify, HF URL parsing, search/filter.
//! Ported from coreNative.js lines 473-540.

use serde::{Deserialize, Serialize};

fn slugify(text: &str, max_len: usize) -> String {
    let clean = text.to_lowercase();
    let mut result = String::new();
    let mut prev_dash = true;
    for c in clean.chars() {
        if c.is_ascii_alphanumeric() { result.push(c); prev_dash = false; }
        else if !prev_dash { result.push('-'); prev_dash = true; }
    }
    if result.ends_with('-') { result.pop(); }
    if result.len() > max_len { result.truncate(max_len); }
    if result.is_empty() { "model".to_string() } else { result }
}

pub fn model_slugify(text: &str) -> String { slugify(text, 48) }
pub fn model_download_slug(name: &str) -> String { slugify(name, 60) }

#[derive(Serialize)]
pub struct HfRepo {
    pub repo_id: String,
    pub path: String,
}

pub fn model_parse_hf_url(url: &str) -> Option<HfRepo> {
    let trimmed = url.trim();
    let after_scheme = if trimmed.starts_with("https://") { &trimmed[8..] }
        else if trimmed.starts_with("http://") { &trimmed[7..] }
        else { return None };
    let host_end = after_scheme.find('/').unwrap_or(after_scheme.len());
    let host = &after_scheme[..host_end];
    if !host.ends_with("huggingface.co") { return None; }
    if host_end == after_scheme.len() { return None; }
    let parts: Vec<&str> = after_scheme[host_end + 1..].split('/').filter(|s| !s.is_empty()).collect();
    if parts.len() < 2 { return None; }
    let repo_id = format!("{}/{}", parts[0], parts[1]);
    if parts.len() < 3 { return Some(HfRepo { repo_id, path: String::new() }); }
    match parts[2] {
        "resolve" => None,
        "tree" => Some(HfRepo { repo_id, path: parts[3..].join("/") }),
        "blob" => {
            let p = if parts.len() > 4 { parts[3..parts.len() - 1].join("/") } else { String::new() };
            Some(HfRepo { repo_id, path: p })
        }
        _ => None,
    }
}

pub fn model_hf_resolve_url(repo_id: &str, file: &str) -> String {
    format!("https://huggingface.co/{}/resolve/main/{}", repo_id, file)
}

#[derive(Deserialize, Serialize)]
pub struct Model {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub blurb: String,
    #[serde(default)]
    pub params: String,
    #[serde(default)]
    pub tier: Option<String>,
}

pub fn model_search<'a>(models: &'a [Model], query: &str, tier: &str) -> Vec<&'a Model> {
    let q = query.to_lowercase();
    models.iter().filter(|m| {
        if !tier.is_empty() && m.tier.as_deref() != Some(tier) { return false; }
        if !q.is_empty() {
            let name = m.name.to_lowercase();
            let blurb = m.blurb.to_lowercase();
            let params = m.params.to_lowercase();
            if !name.contains(&q) && !blurb.contains(&q) && !params.contains(&q) { return false; }
        }
        true
    }).collect()
}

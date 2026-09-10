//! AI inference runtime — message preparation, token estimation, context trimming, model resolution.
//! Ported from coreNative.js lines 570-645.

use serde::{Deserialize, Serialize};

fn estimate_tokens(text: &str) -> usize {
    if text.is_empty() { return 0; }
    (text.len() + 3) / 4  // ceil(len/4)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Serialize)]
pub struct TokenEstimate {
    pub tokens: usize,
}

pub fn estimate_tokens_for_text(text: &str) -> TokenEstimate {
    TokenEstimate { tokens: estimate_tokens(text) }
}

pub fn estimate_messages_tokens(messages: &[Message]) -> TokenEstimate {
    let total = messages.iter().map(|m| estimate_tokens(&m.content) + 4).sum();
    TokenEstimate { tokens: total }
}

pub fn trim_messages_to_context(messages: &[Message], max_tokens: usize) -> Vec<Message> {
    if messages.is_empty() { return vec![]; }
    let msg_tokens: Vec<(usize, usize)> = messages.iter().enumerate()
        .map(|(i, m)| (i, estimate_tokens(&m.content) + 4)).collect();
    let system_idx = msg_tokens.iter().find(|(i, _)| messages[*i].role == "system").map(|(i, _)| *i);
    let system_tokens = system_idx.map(|i| msg_tokens[i].1).unwrap_or(0);
    let budget = max_tokens.saturating_sub(system_tokens);
    let mut selected = vec![];
    let mut used = 0;
    for j in (0..msg_tokens.len()).rev() {
        if Some(j) == system_idx { continue; }
        if used + msg_tokens[j].1 <= budget {
            selected.push(j);
            used += msg_tokens[j].1;
        } else { break; }
    }
    selected.sort();
    let mut result = vec![];
    if let Some(idx) = system_idx { result.push(messages[idx].clone()); }
    for idx in selected { result.push(messages[idx].clone()); }
    result
}

pub fn prepare_messages(messages: &[Message], model_id: &str, no_think: bool, thinking: bool) -> Vec<Message> {
    let is_qwen3 = model_id.starts_with("qwen3");
    let inject = no_think && is_qwen3 && !thinking;
    let mut last_user_idx = None;
    if inject {
        for j in (0..messages.len()).rev() {
            if messages[j].role == "user" { last_user_idx = Some(j); break; }
        }
    }
    messages.iter().enumerate().map(|(i, msg)| {
        if inject && Some(i) == last_user_idx {
            Message { role: msg.role.clone(), content: format!("{}\n/no_think", msg.content) }
        } else {
            msg.clone()
        }
    }).collect()
}

#[derive(Deserialize)]
pub struct Tier {
    pub id: String,
    #[serde(default, rename = "modelId")]
    pub model_id: Option<String>,
    #[serde(default)]
    pub alt: Option<String>,
}

pub fn resolve_model(tier_or_model_id: &str, tiers: &[Tier], downloaded: &serde_json::Value) -> Option<String> {
    if tier_or_model_id.is_empty() { return None; }
    if let Some(obj) = downloaded.as_object() {
        if obj.contains_key(tier_or_model_id) { return Some(tier_or_model_id.to_string()); }
    }
    for tier in tiers {
        if tier.id == tier_or_model_id {
            if let Some(ref mid) = tier.model_id {
                if let Some(obj) = downloaded.as_object() {
                    if obj.contains_key(mid.as_str()) { return Some(mid.clone()); }
                }
            }
            if let Some(ref alt) = tier.alt {
                if let Some(obj) = downloaded.as_object() {
                    if obj.contains_key(alt.as_str()) { return Some(alt.clone()); }
                }
            }
            return None;
        }
    }
    None
}

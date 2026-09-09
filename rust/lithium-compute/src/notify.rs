//! Notification history management.
//! Ported from coreNative.js lines 132-180.

use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone)]
pub struct Notification {
    pub id: String,
    #[serde(default)]
    pub ts: f64,
    #[serde(default)]
    pub read: bool,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

pub fn filter(json_str: &str, cutoff_ms: f64) -> Option<Vec<serde_json::Value>> {
    let arr: Vec<serde_json::Value> = serde_json::from_str(json_str).ok()?;
    Some(arr.into_iter().filter(|e| {
        e.get("id").is_some() && e.get("ts").and_then(|v| v.as_f64()).unwrap_or(0.0) >= cutoff_ms
    }).collect())
}

pub fn mark_all_read(json_str: &str) -> Option<Vec<serde_json::Value>> {
    let mut arr: Vec<serde_json::Value> = serde_json::from_str(json_str).ok()?;
    for e in &mut arr {
        if let Some(obj) = e.as_object_mut() { obj.insert("read".to_string(), serde_json::json!(true)); }
    }
    Some(arr)
}

pub fn mark_read(json_str: &str, id: &str) -> Option<Vec<serde_json::Value>> {
    let mut arr: Vec<serde_json::Value> = serde_json::from_str(json_str).ok()?;
    let mut changed = false;
    for e in &mut arr {
        if e.get("id").and_then(|v| v.as_str()) == Some(id) && e.get("read").and_then(|v| v.as_bool()) != Some(true) {
            if let Some(obj) = e.as_object_mut() { obj.insert("read".to_string(), serde_json::json!(true)); }
            changed = true;
        }
    }
    if changed { Some(arr) } else { None }
}

pub fn dismiss(json_str: &str, id: &str) -> Option<Vec<serde_json::Value>> {
    let arr: Vec<serde_json::Value> = serde_json::from_str(json_str).ok()?;
    let filtered: Vec<_> = arr.iter().filter(|e| e.get("id").and_then(|v| v.as_str()) != Some(id)).cloned().collect();
    if filtered.len() == arr.len() { None } else { Some(filtered) }
}

pub fn unread_count(json_str: &str) -> usize {
    let arr: Vec<serde_json::Value> = match serde_json::from_str(json_str) {
        Ok(a) => a,
        Err(_) => return 0,
    };
    arr.iter().filter(|e| e.get("read").and_then(|v| v.as_bool()) != Some(true)).count()
}

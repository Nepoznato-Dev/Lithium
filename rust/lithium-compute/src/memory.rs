//! Memory (LRU key-value store) management.
//! Ported from coreNative.js lines 252-281.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const MEM_CAP: usize = 200;
const MEM_VALUE_CAP: usize = 2000;

#[derive(Serialize, Deserialize, Clone)]
pub struct MemoryEntry {
    pub value: String,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: f64,
}

pub type Memory = HashMap<String, MemoryEntry>;

#[derive(Serialize)]
pub struct WriteResult {
    pub memory: Memory,
    #[serde(rename = "cleanKey")]
    pub clean_key: String,
}

pub fn write(memory: &Memory, key: &str, value: &str, now: f64) -> Option<WriteResult> {
    let clean_key = key.trim().chars().take(64).collect::<String>();
    if clean_key.is_empty() { return None; }
    let clean_value = value.chars().take(MEM_VALUE_CAP).collect::<String>();
    let mut updated = memory.clone();
    updated.remove(&clean_key);
    updated.insert(clean_key.clone(), MemoryEntry { value: clean_value, updated_at: now });
    if updated.len() > MEM_CAP {
        let mut entries: Vec<_> = updated.iter().collect();
        entries.sort_by(|a, b| a.1.updated_at.partial_cmp(&b.1.updated_at).unwrap_or(std::cmp::Ordering::Equal));
        let to_remove = entries.len() - MEM_CAP;
        let keys_to_remove: Vec<String> = entries[..to_remove].iter().map(|(k, _)| (*k).clone()).collect();
        for k in keys_to_remove {
            updated.remove(&k);
        }
    }
    Some(WriteResult { memory: updated, clean_key })
}

pub fn dump(memory: &Memory, max_entries: usize) -> String {
    if memory.is_empty() { return "(empty)".to_string(); }
    let mut entries: Vec<_> = memory.iter().collect();
    entries.sort_by(|a, b| b.1.updated_at.partial_cmp(&a.1.updated_at).unwrap_or(std::cmp::Ordering::Equal));
    entries.iter().take(max_entries)
        .map(|(k, v)| format!("- {}: {}", k, v.value))
        .collect::<Vec<_>>()
        .join("\n")
}

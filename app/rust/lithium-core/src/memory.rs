//! Memory slot management — persistent key/value store with LRU eviction.

use crate::{get, write_json, Parser, Value};

/// Maximum number of memory entries.
const CAP: usize = 200;
/// Maximum characters per value.
const VALUE_CAP: usize = 2000;

/// Write a memory entry with LRU eviction.
/// Input: `{"memory": {...}, "key": "foo", "value": "bar", "now": 1234567890}`
/// Output: `{"memory": {...updated...}, "cleanKey": "foo"}`
pub fn write_entry(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let memory = get(&root_obj, "memory")?;
    let key = get(&root_obj, "key")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    let value = get(&root_obj, "value")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    let now = get(&root_obj, "now")
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(0.0);
    
    // Clean the key (trim, limit to 64 chars)
    let clean_key: String = key.trim().chars().take(64).collect();
    if clean_key.is_empty() {
        return None;
    }
    
    // Truncate value
    let clean_value: String = value.chars().take(VALUE_CAP).collect();
    
    // Clone memory and update/add entry
    let mut updated_memory = memory.clone();
    if let Value::Obj(ref mut obj) = updated_memory {
        // Remove existing entry if present
        obj.retain(|(k, _)| k != &clean_key);
        
        // Add new entry
        let mut entry = Vec::new();
        entry.push(("value".to_string(), Value::Str(clean_value)));
        entry.push(("updatedAt".to_string(), Value::Num(now)));
        obj.push((clean_key.clone(), Value::Obj(entry)));
        
        // Evict oldest if over capacity
        if obj.len() > CAP {
            // Sort by updatedAt to find oldest
            let mut with_ts: Vec<(String, f64)> = obj
                .iter()
                .map(|(k, v)| {
                    let ts = if let Value::Obj(fields) = v {
                        get(fields, "updatedAt")
                            .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
                            .unwrap_or(0.0)
                    } else {
                        0.0
                    };
                    (k.clone(), ts)
                })
                .collect();
            
            with_ts.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            
            // Remove oldest entries
            let to_remove = obj.len() - CAP;
            for i in 0..to_remove {
                obj.retain(|(k, _)| k != &with_ts[i].0);
            }
        }
    }
    
    // Build output
    let mut out = String::new();
    out.push('{');
    out.push_str("\"memory\":");
    write_json(&updated_memory, &mut out);
    out.push_str(&format!(",\"cleanKey\":\"{}\"", crate::json_escape(&clean_key)));
    out.push('}');
    Some(out)
}

/// Generate a compact dump of memory entries for prompts.
/// Input: `{"memory": {...}, "maxEntries": 40}`
/// Output: string like "- key1: value1\n- key2: value2" or "(empty)"
pub fn dump(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let memory = get(&root_obj, "memory")?;
    let max_entries = get(&root_obj, "maxEntries")
        .and_then(|v| match v { Value::Num(n) => Some(*n as usize), _ => None })
        .unwrap_or(40);
    
    let Value::Obj(obj) = memory else { return None };
    
    if obj.is_empty() {
        return Some("\"(empty)\"".to_string());
    }
    
    // Sort by updatedAt descending (most recent first)
    let mut with_ts: Vec<(String, String, f64)> = obj
        .iter()
        .map(|(k, v)| {
            let (value, ts) = if let Value::Obj(fields) = v {
                let val = get(fields, "value")
                    .and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
                    .unwrap_or_default();
                let ts = get(fields, "updatedAt")
                    .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
                    .unwrap_or(0.0);
                (val, ts)
            } else {
                (String::new(), 0.0)
            };
            (k.clone(), value, ts)
        })
        .collect();
    
    with_ts.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    
    // Take top N and format
    let lines: Vec<String> = with_ts
        .iter()
        .take(max_entries)
        .map(|(k, v, _)| format!("- {}: {}", k, v))
        .collect();
    
    let result = lines.join("\\n");
    Some(format!("\"{}\"", crate::json_escape(&result)))
}

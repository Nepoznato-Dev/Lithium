//! Notification history management — JSON array filtering and manipulation.
//! All ops take/return JSON strings through separate entry points.

use crate::{get, write_json, Parser, Value};

/// Helper to extract entry id
fn entry_id(v: &Value) -> String {
    match v {
        Value::Obj(obj) => get(obj, "id")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

/// Helper to extract entry timestamp
fn entry_ts(v: &Value) -> f64 {
    match v {
        Value::Obj(obj) => get(obj, "ts")
            .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
            .unwrap_or(0.0),
        _ => 0.0,
    }
}

/// Helper to check if entry is read
fn entry_read(v: &Value) -> bool {
    match v {
        Value::Obj(obj) => get(obj, "read")
            .and_then(|v| match v { Value::Bool(b) => Some(*b), _ => None })
            .unwrap_or(false),
        _ => false,
    }
}

/// Set the "read" field on an entry
fn set_read(v: &mut Value, read: bool) {
    if let Value::Obj(obj) = v {
        if let Some(pair) = obj.iter_mut().find(|(k, _)| k == "read") {
            pair.1 = Value::Bool(read);
        } else {
            obj.push(("read".to_string(), Value::Bool(read)));
        }
    }
}

/// Serialize a list of values to JSON array string
fn serialize_list(items: &[&Value]) -> String {
    let mut out = String::from("[");
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        write_json(item, &mut out);
    }
    out.push(']');
    out
}

/// Filter notifications by age (ts >= cutoff) and return JSON array.
pub fn filter_by_age(input: &[u8], cutoff_ms: f64) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Arr(items) = root else { return None };
    
    let filtered: Vec<&Value> = items
        .iter()
        .filter(|e| {
            let id = entry_id(e);
            let ts = entry_ts(e);
            !id.is_empty() && ts >= cutoff_ms
        })
        .collect();
    
    Some(serialize_list(&filtered))
}

/// Mark all notifications as read.
pub fn mark_all_read(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Arr(items) = root else { return None };
    
    let mut out = String::from("[");
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        let mut cloned = item.clone();
        set_read(&mut cloned, true);
        write_json(&cloned, &mut out);
    }
    out.push(']');
    Some(out)
}

/// Mark single notification as read by id.
pub fn mark_read(input: &[u8], id: &str) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Arr(items) = root else { return None };
    
    let mut changed = false;
    let mut out = String::from("[");
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            out.push(',');
        }
        let mut cloned = item.clone();
        if entry_id(&cloned) == id && !entry_read(&cloned) {
            set_read(&mut cloned, true);
            changed = true;
        }
        write_json(&cloned, &mut out);
    }
    out.push(']');
    
    if !changed {
        return None; // No change needed
    }
    Some(out)
}

/// Dismiss notification by id (filter out).
pub fn dismiss(input: &[u8], id: &str) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Arr(items) = root else { return None };
    
    let filtered: Vec<&Value> = items
        .iter()
        .filter(|e| entry_id(e) != id)
        .collect();
    
    if filtered.len() == items.len() {
        return None; // No change
    }
    
    Some(serialize_list(&filtered))
}

/// Count unread notifications.
pub fn unread_count(input: &[u8]) -> Option<u32> {
    let root = Parser::new(input).value()?;
    let Value::Arr(items) = root else { return None };
    
    let count = items.iter().filter(|e| !entry_read(e)).count();
    Some(count as u32)
}

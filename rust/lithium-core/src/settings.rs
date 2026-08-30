//! Settings management — defaults, merging, and immutable path updates.

use crate::{get, write_json, Parser, Value};

/// Default settings as a JSON object string.
pub fn defaults() -> String {
    r##"{"profile":{"username":"Player"},"theme":{"accent":"#22d3ee","contrast":"normal","appTint":true,"transparency":true},"layout":{"density":"compact"},"motion":{"animations":"full"},"background":{"enabled":true,"intensity":0.7},"performance":{"lowEndMode":false},"games":{"fullscreenOnLaunch":false,"escToClose":true},"browser":{"searchEngine":"duckduckgo"}}"##.to_string()
}

/// Deep-merge stored settings over defaults.
/// Input: `{"stored": {...}}` → Output: merged settings object.
pub fn merge(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let stored = get(&root_obj, "stored")?;
    let Value::Obj(stored_obj) = stored else { return None };
    
    // Parse defaults
    let defaults_str = defaults();
    let defaults_bytes = defaults_str.as_bytes();
    let defaults_val = Parser::new(defaults_bytes).value()?;
    let Value::Obj(defaults_obj) = defaults_val else { return None };
    
    // Merge: for each key in defaults, merge with stored
    let mut merged = defaults_obj.clone();
    for (key, default_val) in defaults_obj.iter() {
        if let Value::Obj(default_fields) = default_val {
            if let Some(stored_val) = get(stored_obj, key) {
                if let Value::Obj(stored_fields) = stored_val {
                    // Merge fields
                    let mut merged_fields = default_fields.clone();
                    for (field_key, field_val) in stored_fields.iter() {
                        if let Some(pair) = merged_fields.iter_mut().find(|(k, _)| k == field_key) {
                            pair.1 = field_val.clone();
                        } else {
                            merged_fields.push((field_key.clone(), field_val.clone()));
                        }
                    }
                    if let Some(pair) = merged.iter_mut().find(|(k, _)| k == key) {
                        pair.1 = Value::Obj(merged_fields);
                    }
                }
            }
        }
    }
    
    let mut out = String::new();
    write_json(&Value::Obj(merged), &mut out);
    Some(out)
}

/// Immutable set at a dotted path.
/// Input: `{"settings": {...}, "path": "theme.accent", "value": "#fff"}` → Output: updated settings.
pub fn set_at_path(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(root_obj) = root else { return None };
    
    let settings = get(&root_obj, "settings")?;
    let path = get(&root_obj, "path")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })?;
    let value = get(&root_obj, "value")?;
    
    let keys: Vec<&str> = path.split('.').collect();
    if keys.is_empty() {
        return None;
    }
    
    let mut updated = settings.clone();
    let mut current = &mut updated;
    
    for (i, key) in keys.iter().enumerate() {
        if i == keys.len() - 1 {
            // Set the value
            if let Value::Obj(obj) = current {
                if let Some(pair) = obj.iter_mut().find(|(k, _)| k == *key) {
                    pair.1 = value.clone();
                } else {
                    obj.push((key.to_string(), value.clone()));
                }
            }
        } else {
            // Navigate deeper (clone the nested object)
            if let Value::Obj(obj) = current {
                if let Some(nested) = obj.iter_mut().find(|(k, _)| k == *key) {
                    nested.1 = nested.1.clone();
                    current = &mut nested.1;
                } else {
                    return None;
                }
            }
        }
    }
    
    let mut out = String::new();
    write_json(&updated, &mut out);
    Some(out)
}

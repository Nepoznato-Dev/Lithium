//! KV tier — overflow threshold decision and size calculations.

use crate::{get, Parser, Value};

/// Overflow threshold: values >= this many chars move to IndexedDB.
const OVERFLOW_THRESHOLD: usize = 32 * 1024; // 32 KB

/// Decide whether a value should overflow to IndexedDB.
/// Input: `{"jsonLength": 40000}` → Output: `{"overflow": true, "threshold": 32768}`
pub fn should_overflow(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let json_length = get(&obj, "jsonLength")
        .and_then(|v| match v { Value::Num(n) => Some(*n as usize), _ => None })
        .unwrap_or(0);

    let overflow = json_length >= OVERFLOW_THRESHOLD;
    Some(format!(
        "{{\"overflow\":{},\"threshold\":{}}}",
        overflow, OVERFLOW_THRESHOLD
    ))
}

/// Calculate approximate bytes held in overflow entries.
/// Input: `{"entries": [{"key": "a", "jsonLen": 40000}, ...]}`
/// Output: `{"bytes": 80000}` (UTF-16 estimate: chars * 2)
pub fn overflow_bytes(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let entries = get(&obj, "entries")?;
    let Value::Arr(arr) = entries else { return None };

    let mut total_chars: usize = 0;
    for entry in arr.iter() {
        if let Value::Obj(e) = entry {
            let json_len = get(e, "jsonLen")
                .and_then(|v| match v { Value::Num(n) => Some(*n as usize), _ => None })
                .unwrap_or(0);
            total_chars += json_len;
        }
    }

    let bytes = total_chars * 2; // UTF-16
    Some(format!("{{\"bytes\":{}}}", bytes))
}

/// Categorize localStorage keys into candidates for overflow migration.
/// Input: `{"entries": [{"key": "lithium:chats", "jsonLen": 50000}, ...]}`
/// Output: array of keys that should be migrated (jsonLen >= threshold)
pub fn migration_candidates(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let entries = get(&obj, "entries")?;
    let Value::Arr(arr) = entries else { return None };

    let mut candidates = Vec::new();
    for entry in arr.iter() {
        if let Value::Obj(e) = entry {
            let key = get(e, "key")
                .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                .unwrap_or("");
            let json_len = get(e, "jsonLen")
                .and_then(|v| match v { Value::Num(n) => Some(*n as usize), _ => None })
                .unwrap_or(0);

            if json_len >= OVERFLOW_THRESHOLD {
                candidates.push(key.to_string());
            }
        }
    }

    let mut out = String::new();
    out.push('[');
    for (idx, key) in candidates.iter().enumerate() {
        if idx > 0 { out.push(','); }
        out.push('"');
        out.push_str(&crate::json_escape(key));
        out.push('"');
    }
    out.push(']');
    Some(out)
}

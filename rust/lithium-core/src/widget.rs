use crate::{get, json_escape, Parser, Value};

/* ---------- Widget runtime helpers ---------- */

/// Filter tree entries to find *.widget.js files under a given folder.
/// Input: {"tree": [...], "folderId": "..."} → [{id, name}, ...]
pub fn filter_entries(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let tree = match get(&req, "tree") {
        Some(Value::Arr(t)) => t,
        _ => return None,
    };

    let folder_id = get(&req, "folderId")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let suffix = ".widget.js";
    let mut out = String::from("[");
    let mut first = true;

    for entry in tree {
        let Value::Obj(obj) = entry else { continue };

        // Check parentId matches folderId
        let parent = get(obj, "parentId")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None });
        if parent != Some(folder_id) { continue; }

        // Check type is "text"
        let etype = get(obj, "type")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("");
        if etype != "text" { continue; }

        // Check name ends with .widget.js
        let name = get(obj, "name")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("");
        if !name.ends_with(suffix) { continue; }

        let id = get(obj, "id")
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("");

        if !first { out.push(','); }
        first = false;
        out.push_str("{\"id\":\"");
        out.push_str(&json_escape(id));
        out.push_str("\",\"name\":\"");
        out.push_str(&json_escape(name));
        out.push_str("\"}");
    }

    out.push(']');
    Some(out)
}

/// Toggle an id in the enabled set.
/// Input: {"enabled": ["id1", ...], "id": "...", "value": true} → updated array.
pub fn toggle_enabled(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let id = get(&req, "id")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");

    let value = get(&req, "value")
        .map(|v| matches!(v, Value::Bool(true)))
        .unwrap_or(false);

    let existing = match get(&req, "enabled") {
        Some(Value::Arr(items)) => items,
        _ => &Vec::new(),
    };

    let mut out = String::from("[");
    let mut first = true;
    let mut found = false;

    if value {
        // Add: copy existing + append id if not present
        for item in existing {
            if let Value::Str(s) = item {
                if s == id { found = true; }
                if !first { out.push(','); }
                first = false;
                out.push('"');
                out.push_str(&json_escape(s));
                out.push('"');
            }
        }
        if !found {
            if !first { out.push(','); }
            out.push('"');
            out.push_str(&json_escape(id));
            out.push('"');
        }
    } else {
        // Remove: copy all except id
        for item in existing {
            if let Value::Str(s) = item {
                if s == id { continue; }
                if !first { out.push(','); }
                first = false;
                out.push('"');
                out.push_str(&json_escape(s));
                out.push('"');
            }
        }
    }

    out.push(']');
    Some(out)
}

/// Find running widget ids that are no longer in the valid entries set.
/// Input: {"running": ["id1", ...], "valid": ["id2", ...]} → ["id1"] (stale ids).
pub fn stale_running_ids(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let running = match get(&req, "running") {
        Some(Value::Arr(items)) => items,
        _ => return Some("[]".into()),
    };

    let valid = match get(&req, "valid") {
        Some(Value::Arr(items)) => items,
        _ => return Some("[]".into()),
    };

    // Build a set of valid ids
    let valid_set: Vec<&str> = valid.iter().filter_map(|v| match v {
        Value::Str(s) => Some(s.as_str()),
        _ => None,
    }).collect();

    let mut out = String::from("[");
    let mut first = true;

    for item in running {
        if let Value::Str(s) = item {
            if !valid_set.contains(&s.as_str()) {
                if !first { out.push(','); }
                first = false;
                out.push('"');
                out.push_str(&json_escape(s));
                out.push('"');
            }
        }
    }

    out.push(']');
    Some(out)
}

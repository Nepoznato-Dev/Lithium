//! Download sync — slug generation, state machine, progress tracking.

use crate::{get, Parser, Value};

/// Generate a download slug from a name.
/// Input: `{"name": "My File (v2)"}` → Output: `"my-file-v2"`
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

/// Compute download progress percentage and ETA.
/// Input: `{"received": 5000000, "total": 10000000, "startedAt": 1234567890}`
/// Output: `{"percent": 50, "receivedFmt": "4.8 MB", "totalFmt": "9.5 MB"}`
pub fn download_progress(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let received = get(&obj, "received")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    let total = get(&obj, "total")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);

    let percent = if total > 0 { (received as f64 / total as f64 * 100.0).round() as u32 } else { 0 };

    let mut out = String::new();
    out.push('{');
    out.push_str(&format!("\"percent\":{},\"received\":{},\"total\":{}", percent, received, total));
    out.push_str(&format!(",\"receivedFmt\":\"{}\",\"totalFmt\":\"{}\"",
        crate::storage_calc::format_bytes_str(received),
        crate::storage_calc::format_bytes_str(total)));
    out.push('}');
    Some(out)
}

/// Determine download state from progress.
/// Input: `{"received": 10000000, "total": 10000000, "error": null}`
/// Output: `{"state": "complete"}` or `{"state": "downloading"}` or `{"state": "error"}`
pub fn download_state(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let received = get(&obj, "received")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    let total = get(&obj, "total")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    let error = get(&obj, "error")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None });

    let state = if error.is_some() {
        "error"
    } else if total > 0 && received >= total {
        "complete"
    } else if received > 0 {
        "downloading"
    } else {
        "pending"
    };

    Some(format!("{{\"state\":\"{}\"}}", state))
}

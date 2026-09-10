//! Lock state machine — PIN verification logic and lockout timing.

use crate::{get, Parser, Value};

/// Validate PIN format and compute lockout state.
/// Input: `{"pin": "1234", "storedHash": "abc...", "failCount": 0, "lockedUntil": 0, "now": 1234567890}`
/// Output: `{"ok": true}` or `{"ok": false, "reason": "wrong"|"locked"|"invalid", "retryIn": 0}`
pub fn verify(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let pin = get(&obj, "pin")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("");
    let _fail_count = get(&obj, "failCount")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u32), _ => None })
        .unwrap_or(0);
    let locked_until = get(&obj, "lockedUntil")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    let now = get(&obj, "now")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    
    // Check if currently locked
    if locked_until > now {
        let retry_in = ((locked_until - now) as f64 / 1000.0).ceil() as u32;
        return Some(format!("{{\"ok\":false,\"reason\":\"locked\",\"retryIn\":{}}}", retry_in));
    }
    
    // Validate PIN format (4-12 digits)
    if !is_valid_pin(pin) {
        return Some("{\"ok\":false,\"reason\":\"invalid\"}".to_string());
    }
    
    // Note: actual hash comparison happens in JS (needs wasmHash)
    // This function validates format and computes lockout state
    // Return placeholder for JS to complete
    Some("{\"ok\":false,\"reason\":\"needs_hash_check\"}".to_string())
}

/// Compute new failure state after a wrong PIN attempt.
/// Input: `{"failCount": 2}`
/// Output: `{"failCount": 3, "lockedUntil": 1234567890, "retryIn": 30}`
pub fn record_failure(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let fail_count = get(&obj, "failCount")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u32), _ => None })
        .unwrap_or(0);
    let now = get(&obj, "now")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    
    let new_count = fail_count + 1;
    let lock_for = if new_count >= 5 { 30_000 } else { 0 };
    let locked_until = if lock_for > 0 { now + lock_for } else { 0 };
    let retry_in = if lock_for > 0 { (lock_for as f64 / 1000.0).ceil() as u32 } else { 0 };
    
    Some(format!(
        "{{\"failCount\":{},\"lockedUntil\":{},\"retryIn\":{}}}",
        new_count, locked_until, retry_in
    ))
}

/// Validate PIN format: 4-12 digits.
fn is_valid_pin(pin: &str) -> bool {
    let len = pin.len();
    if len < 4 || len > 12 {
        return false;
    }
    pin.chars().all(|c| c.is_ascii_digit())
}

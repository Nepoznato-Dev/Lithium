//! Storage calculations — byte formatting, disk estimation, usage aggregation.

use crate::{get, Parser, Value};

/// Format bytes into a human-readable string.
/// Input: `{"bytes": 1234567}` → Output: `"1.2 MB"`
pub fn format_bytes(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let bytes = get(&obj, "bytes")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    
    Some(format!("\"{}\"", format_bytes_str(bytes)))
}

/// Format bytes into a human-readable string (direct).
pub fn format_bytes_str(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    let units = ["B", "KB", "MB", "GB", "TB"];
    let i = (units.len() - 1).min((bytes as f64).log(1024.0).floor() as usize);
    let value = bytes as f64 / 1024.0_f64.powi(i as i32);
    if value >= 100.0 || i == 0 {
        format!("{} {}", value.round(), units[i])
    } else {
        format!("{:.1} {}", value, units[i])
    }
}

/// Chromium grants ~60% of disk — invert to guess total capacity.
/// Input: `{"quota": 1234567890}` → Output: `{"estimatedDisk": 2057613150}`
pub fn guess_total_disk(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let quota = get(&obj, "quota")
        .and_then(|v| match v { Value::Num(n) => Some(*n as u64), _ => None })
        .unwrap_or(0);
    
    let estimated = if quota > 0 { (quota as f64 / 0.6).round() as u64 } else { 0 };
    
    Some(format!("{{\"estimatedDisk\":{}}}", estimated))
}

/// Compute a storage snapshot summary from raw tier sizes.
/// Input: `{"local": 1234, "idb": 5678, "cache": 9012, "cachedAssets": 42, "kvOverflow": 3456, "quota": 12345678, "browserUsage": 9876543}`
/// Output: formatted summary JSON with human-readable sizes and percentages.
pub fn storage_summary(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let local = get_num(&obj, "local");
    let idb = get_num(&obj, "idb");
    let cache = get_num(&obj, "cache");
    let cached_assets = get_num(&obj, "cachedAssets") as u32;
    let kv_overflow = get_num(&obj, "kvOverflow");
    let quota = get_num(&obj, "quota");
    let browser_usage = get_num(&obj, "browserUsage");
    
    let estimated_disk = if quota > 0.0 { (quota / 0.6).round() as u64 } else { 0 };
    let total_used = local as u64 + idb as u64 + cache as u64;
    
    let mut out = String::new();
    out.push('{');
    out.push_str(&format!("\"local\":{},\"idb\":{},\"cache\":{},", local as u64, idb as u64, cache as u64));
    out.push_str(&format!("\"cachedAssets\":{},\"kvOverflow\":{},", cached_assets, kv_overflow as u64));
    out.push_str(&format!("\"quota\":{},\"browserUsage\":{},", quota as u64, browser_usage as u64));
    out.push_str(&format!("\"estimatedDisk\":{},\"totalUsed\":{},", estimated_disk, total_used));
    out.push_str(&format!("\"localFmt\":\"{}\",\"idbFmt\":\"{}\",\"cacheFmt\":\"{}\",",
        format_bytes_str(local as u64), format_bytes_str(idb as u64), format_bytes_str(cache as u64)));
    out.push_str(&format!("\"totalUsedFmt\":\"{}\",\"estimatedDiskFmt\":\"{}\"",
        format_bytes_str(total_used), format_bytes_str(estimated_disk)));
    out.push('}');
    Some(out)
}

fn get_num(obj: &[(String, Value)], key: &str) -> f64 {
    get(obj, key)
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(0.0)
}

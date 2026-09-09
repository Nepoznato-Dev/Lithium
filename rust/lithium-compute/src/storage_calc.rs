//! Storage calculations — byte formatting, disk estimation, download tracking.
//! Ported from coreNative.js lines 874-929.

use serde::{Deserialize, Serialize};

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 { return "0 B".to_string(); }
    let units = ["B", "KB", "MB", "GB", "TB"];
    let i = units.len().saturating_sub(1).min((bytes as f64).log(1024.0) as usize);
    let value = bytes as f64 / 1024.0f64.powi(i as i32);
    if value >= 100.0 || i == 0 { format!("{} {}", value.round(), units[i]) }
    else { format!("{:.1} {}", value, units[i]) }
}

pub fn format_bytes_str(bytes: u64) -> String { format_bytes(bytes) }

pub fn guess_disk(quota: u64) -> u64 {
    if quota > 0 { (quota as f64 / 0.6).round() as u64 } else { 0 }
}

#[derive(Deserialize)]
pub struct Snapshot {
    #[serde(default)] pub local: u64,
    #[serde(default)] pub idb: u64,
    #[serde(default)] pub cache: u64,
    #[serde(default)] pub cached_assets: u64,
    #[serde(default)] pub kv_overflow: u64,
    #[serde(default)] pub quota: u64,
    #[serde(default)] pub browser_usage: u64,
}

#[derive(Serialize)]
pub struct StorageSummary {
    pub local: u64, pub idb: u64, pub cache: u64,
    pub cached_assets: u64, pub kv_overflow: u64,
    pub quota: u64, pub browser_usage: u64,
    pub estimated_disk: u64, pub total_used: u64,
    pub local_fmt: String, pub idb_fmt: String, pub cache_fmt: String,
    pub total_used_fmt: String, pub estimated_disk_fmt: String,
}

pub fn summary(s: &Snapshot) -> StorageSummary {
    let estimated_disk = guess_disk(s.quota);
    let total_used = s.local + s.idb + s.cache;
    StorageSummary {
        local: s.local, idb: s.idb, cache: s.cache,
        cached_assets: s.cached_assets, kv_overflow: s.kv_overflow,
        quota: s.quota, browser_usage: s.browser_usage,
        estimated_disk, total_used,
        local_fmt: format_bytes(s.local), idb_fmt: format_bytes(s.idb),
        cache_fmt: format_bytes(s.cache), total_used_fmt: format_bytes(total_used),
        estimated_disk_fmt: format_bytes(estimated_disk),
    }
}

pub fn dl_slug(name: &str) -> String {
    let clean = name.to_lowercase();
    let mut result = String::new();
    let mut prev_dash = true;
    for c in clean.chars() {
        if c.is_ascii_alphanumeric() { result.push(c); prev_dash = false; }
        else if !prev_dash { result.push('-'); prev_dash = true; }
    }
    if result.ends_with('-') { result.pop(); }
    if result.len() > 60 { result.truncate(60); }
    result
}

#[derive(Serialize)]
pub struct DlProgress {
    pub percent: u32, pub received: u64, pub total: u64,
    pub received_fmt: String, pub total_fmt: String,
}

pub fn dl_progress(received: u64, total: u64) -> DlProgress {
    let pct = if total > 0 { (received as f64 / total as f64 * 100.0).round() as u32 } else { 0 };
    DlProgress { percent: pct, received, total, received_fmt: format_bytes(received), total_fmt: format_bytes(total) }
}

#[derive(Serialize)]
pub struct DlState { pub state: &'static str }

pub fn dl_state(received: u64, total: u64, error: &str) -> DlState {
    let state = if !error.is_empty() { "error" }
        else if total > 0 && received >= total { "complete" }
        else if received > 0 { "downloading" }
        else { "pending" };
    DlState { state }
}

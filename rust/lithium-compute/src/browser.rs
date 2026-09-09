//! Browser compute helpers — URL parsing, stats, bookmarks, history, omnibox, sanitize, slug.
//! Ported from rust/lithium-core/src/browser.rs using serde_json.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/* ---------- URL helpers ---------- */

pub fn resolve_input(input: &str, search_url: &str) -> (String, String) {
    let trimmed = input.trim();
    if trimmed.is_empty() { return (String::new(), String::new()); }
    if trimmed.starts_with("lithium://") { return ("url".into(), trimmed.into()); }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return ("url".into(), trimmed.into());
    }
    let host = trimmed.split(|c: char| c == '/' || c == ':' || c == '?').next().unwrap_or("");
    let dots: Vec<&str> = host.split('.').collect();
    if dots.len() >= 2 && dots.iter().all(|s| !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c == '-')) && host.len() >= 4 {
        return ("url".into(), format!("https://{}", trimmed));
    }
    ("search".into(), format!("{}{}", search_url, trimmed))
}

pub fn hostname(url: &str) -> String {
    if url.is_empty() { return String::new(); }
    let after_scheme = if let Some(pos) = url.find("://") { &url[pos + 3..] } else { url };
    let host = after_scheme.split(|c| c == '/' || c == '?' || c == '#').next().unwrap_or(url);
    let host = if host.starts_with("www.") { &host[4..] } else { host };
    let host = host.split(':').next().unwrap_or(host);
    host.to_string()
}

fn encode_url_param(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' | b'/' | b'@' | b',' | b';' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

pub fn to_proxy_url(url: &str, proxy_origin: &str, backend_url: &str) -> String {
    if url.is_empty() { return String::new(); }
    let base = if !proxy_origin.is_empty() { proxy_origin } else if !backend_url.is_empty() { backend_url } else { return url.to_string(); };
    format!("{}/api/web/proxy?url={}", base, encode_url_param(url))
}

/* ---------- Shields stats ---------- */

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ShieldsStats {
    #[serde(default)]
    pub ads_blocked: u64,
    #[serde(default)]
    pub trackers_blocked: u64,
    #[serde(default)]
    pub https_upgrades: u64,
    #[serde(default)]
    pub scripts_blocked: u64,
    #[serde(default)]
    pub data_saved: u64,
    #[serde(default)]
    pub time_saved: u64,
    #[serde(default)]
    pub last_reset: f64,
}

pub fn stats_increment(stats: &ShieldsStats, ads: u32, trackers: u32, https: u32, scripts: u32, data: u64) -> ShieldsStats {
    ShieldsStats {
        ads_blocked: stats.ads_blocked + ads as u64,
        trackers_blocked: stats.trackers_blocked + trackers as u64,
        https_upgrades: stats.https_upgrades + https as u64,
        scripts_blocked: stats.scripts_blocked + scripts as u64,
        data_saved: stats.data_saved + data,
        time_saved: stats.time_saved + ((ads + trackers + scripts) as u64) * 50,
        last_reset: stats.last_reset,
    }
}

pub fn stats_daily_reset(stats: &ShieldsStats, now_ms: f64) -> ShieldsStats {
    let ms_per_day = 86_400_000.0;
    let last_day = (stats.last_reset / ms_per_day).floor() as i64;
    let now_day = (now_ms / ms_per_day).floor() as i64;
    if last_day < now_day {
        ShieldsStats { last_reset: now_ms, ..Default::default() }
    } else {
        stats.clone()
    }
}

pub fn format_stat_number(n: f64) -> String {
    if n < 1_000.0 { return format!("{}", n as u64); }
    if n < 1_000_000.0 {
        let k = n / 1_000.0;
        if k.fract() < 0.05 || k.fract() > 0.95 { return format!("{}K", k.round() as u64); }
        return format!("{:.1}K", k);
    }
    let m = n / 1_000_000.0;
    if m.fract() < 0.05 || m.fract() > 0.95 { return format!("{}M", m.round() as u64); }
    format!("{:.1}M", m)
}

pub fn format_time_saved(seconds: f64) -> String {
    let s = seconds as u64;
    if s < 60 { return format!("{}s", s); }
    if s < 3600 { return format!("{}m {}", s / 60, s % 60); }
    format!("{}h {}m", s / 3600, (s % 3600) / 60)
}

/* ---------- Bookmarks ---------- */

#[derive(Deserialize)]
pub struct Bookmark {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Serialize)]
pub struct BookmarkItem {
    pub title: String,
    pub url: String,
}

#[derive(Serialize)]
pub struct BookmarkFolder {
    pub name: String,
    pub children: Vec<Value>,
    pub items: Vec<BookmarkItem>,
}

pub fn bookmark_tree(bookmarks: &[Bookmark]) -> Vec<BookmarkFolder> {
    use std::collections::HashMap;
    let mut folders: HashMap<String, Vec<BookmarkItem>> = HashMap::new();
    let mut unfiled: Vec<BookmarkItem> = Vec::new();
    for b in bookmarks {
        let item = BookmarkItem { title: b.title.clone(), url: b.url.clone() };
        match &b.folder {
            Some(f) if !f.is_empty() => folders.entry(f.clone()).or_default().push(item),
            _ => unfiled.push(item),
        }
    }
    let mut result = vec![BookmarkFolder { name: "Bookmarks Bar".into(), children: vec![], items: unfiled }];
    for (name, items) in folders {
        result.push(BookmarkFolder { name, children: vec![], items });
    }
    result
}

pub fn bookmark_search(bookmarks: &[Bookmark], query: &str) -> Vec<BookmarkItem> {
    let q = query.to_lowercase();
    bookmarks.iter()
        .filter(|b| q.is_empty() || b.title.to_lowercase().contains(&q) || b.url.to_lowercase().contains(&q))
        .map(|b| BookmarkItem { title: b.title.clone(), url: b.url.clone() })
        .collect()
}

/* ---------- History ---------- */

#[derive(Deserialize, Serialize, Clone)]
pub struct HistoryEntry {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub timestamp: f64,
}

#[derive(Serialize)]
pub struct HistoryGroup {
    pub label: String,
    pub entries: Vec<HistoryEntry>,
}

pub fn history_group(entries: &[HistoryEntry], now_ms: f64) -> Vec<HistoryGroup> {
    let ms_per_day = 86_400_000.0;
    let now_day = (now_ms / ms_per_day).floor() as i64;
    let mut today = vec![]; let mut yesterday = vec![]; let mut week = vec![]; let mut month = vec![]; let mut older = vec![];
    for e in entries {
        let entry_day = (e.timestamp / ms_per_day).floor() as i64;
        let diff = now_day - entry_day;
        match diff {
            0 => today.push(e.clone()),
            1 => yesterday.push(e.clone()),
            2..=7 => week.push(e.clone()),
            8..=30 => month.push(e.clone()),
            _ => older.push(e.clone()),
        }
    }
    let mut groups = vec![];
    if !today.is_empty() { groups.push(HistoryGroup { label: "Today".into(), entries: today }); }
    if !yesterday.is_empty() { groups.push(HistoryGroup { label: "Yesterday".into(), entries: yesterday }); }
    if !week.is_empty() { groups.push(HistoryGroup { label: "Last 7 days".into(), entries: week }); }
    if !month.is_empty() { groups.push(HistoryGroup { label: "Last 30 days".into(), entries: month }); }
    if !older.is_empty() { groups.push(HistoryGroup { label: "Older".into(), entries: older }); }
    if groups.is_empty() { groups.push(HistoryGroup { label: "Today".into(), entries: vec![] }); }
    groups
}

pub fn history_search(entries: &[HistoryEntry], query: &str) -> Vec<HistoryEntry> {
    let q = query.to_lowercase();
    entries.iter()
        .filter(|e| q.is_empty() || e.title.to_lowercase().contains(&q) || e.url.to_lowercase().contains(&q))
        .cloned()
        .collect()
}

/* ---------- Omnibox ranking ---------- */

#[derive(Serialize)]
pub struct OmniboxResult {
    pub title: String,
    pub url: String,
    pub r#type: String,
    pub score: f64,
}

fn rank_item(title: &str, url: &str, query: &str, weight: f64) -> f64 {
    if query.is_empty() { return weight * 0.5; }
    let tl = title.to_lowercase(); let ul = url.to_lowercase();
    if tl.starts_with(query) { return weight * 3.0; }
    if ul.starts_with(query) { return weight * 2.5; }
    if tl.contains(query) { return weight * 2.0; }
    if ul.contains(query) { return weight * 1.5; }
    for w in tl.split_whitespace() { if w.starts_with(query) { return weight * 1.8; } }
    0.0
}

pub fn omnibox_rank(query: &str, history: &[HistoryEntry], bookmarks: &[Bookmark], top_sites: &[Bookmark]) -> Vec<OmniboxResult> {
    let q = query.to_lowercase();
    let mut scored: Vec<OmniboxResult> = Vec::new();
    for b in bookmarks {
        let s = rank_item(&b.title, &b.url, &q, 1.5);
        if s > 0.0 { scored.push(OmniboxResult { title: b.title.clone(), url: b.url.clone(), r#type: "bookmark".into(), score: s }); }
    }
    for h in history {
        let recency = 1.0 + (h.timestamp / 86_400_000.0).max(0.0).min(30.0) / 30.0;
        let s = rank_item(&h.title, &h.url, &q, 1.2) * recency;
        if s > 0.0 { scored.push(OmniboxResult { title: h.title.clone(), url: h.url.clone(), r#type: "history".into(), score: s }); }
    }
    for t in top_sites {
        let s = rank_item(&t.title, &t.url, &q, 2.0);
        if s > 0.0 { scored.push(OmniboxResult { title: t.title.clone(), url: t.url.clone(), r#type: "topsite".into(), score: s }); }
    }
    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(8);
    scored
}

/* ---------- HTML sanitization ---------- */

pub fn sanitize_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut i = 0;
    let bytes = html.as_bytes();
    let dangerous = ["script", "iframe", "object", "embed", "form", "link", "meta"];
    while i < bytes.len() {
        if bytes[i] == b'<' {
            let is_closing = i + 1 < bytes.len() && bytes[i + 1] == b'/';
            let tag_start = if is_closing { i + 2 } else { i + 1 };
            let mut tag_end = tag_start;
            while tag_end < bytes.len() && bytes[tag_end].is_ascii_alphanumeric() { tag_end += 1; }
            let tag_name = html[tag_start..tag_end].to_lowercase();
            if dangerous.iter().any(|d| tag_name == *d) {
                while i < bytes.len() && bytes[i] != b'>' { i += 1; }
                if i < bytes.len() { i += 1; }
            } else {
                result.push('<');
                if is_closing { result.push('/'); }
                i = tag_start;
                while i < bytes.len() {
                    if bytes[i] == b'>' { result.push('>'); i += 1; break; }
                    if bytes[i] == b' ' || bytes[i] == b'\t' {
                        while i < bytes.len() && (bytes[i] == b' ' || bytes[i] == b'\t') { result.push(bytes[i] as char); i += 1; }
                        let attr_start = i;
                        while i < bytes.len() && bytes[i] != b'=' && bytes[i] != b'>' && bytes[i] != b' ' && bytes[i] != b'\t' { i += 1; }
                        let attr_name = html[attr_start..i].to_lowercase();
                        if attr_name.starts_with("on") && attr_name.len() >= 3 {
                            while i < bytes.len() && bytes[i] != b'>' && bytes[i] != b' ' && bytes[i] != b'\t' { i += 1; }
                            while i < bytes.len() && bytes[i] != b'>' {
                                if bytes[i] == b'"' { i += 1; while i < bytes.len() && bytes[i] != b'"' { i += 1; } if i < bytes.len() { i += 1; } break; }
                                if bytes[i] == b'\'' { i += 1; while i < bytes.len() && bytes[i] != b'\'' { i += 1; } if i < bytes.len() { i += 1; } break; }
                                i += 1;
                            }
                        } else {
                            for b in &bytes[attr_start..i] { result.push(*b as char); }
                        }
                    } else { result.push(bytes[i] as char); i += 1; }
                }
            }
        } else { result.push(bytes[i] as char); i += 1; }
    }
    result
}

pub fn slug(text: &str) -> String {
    let mut s = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            'a'..='z' | '0'..='9' => s.push(c),
            'A'..='Z' => s.push(c.to_ascii_lowercase()),
            ' ' | '-' | '_' => { if !s.ends_with('-') { s.push('-'); } }
            _ => {}
        }
    }
    let s = s.trim_matches('-');
    if s.len() > 80 { s[..80].to_string() } else { s.to_string() }
}

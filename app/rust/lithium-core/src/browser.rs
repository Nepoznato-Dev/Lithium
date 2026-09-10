//! Browser compute helpers — URL parsing, stats accumulation, bookmark tree
//! building, history grouping, omnibox ranking, HTML sanitisation.
//!
//! All functions are pure (no I/O).  The JS layer handles networking,
//! IndexedDB persistence, and iframe management.

use crate::{as_num, get, json_escape, num_json as fmt_num, Value, Parser};

/* ---------- URL helpers ---------- */

/// Detect whether input looks like a URL (vs a search query).
/// Returns "url" + resolved URL, or "search" + query string.
pub fn resolve_input(input: &str, search_url: &str) -> (String, String) {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return (String::new(), String::new());
    }
    // Already has scheme
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return ("url".into(), trimmed.into());
    }
    // Looks like domain.tld[...]\
    let domain_re_like = |s: &str| -> bool {
        let mut dot_count = 0;
        let parts: Vec<&str> = s.splitn(2, |c: char| c == '/' || c == ':' || c == '?').collect();
        let host = parts[0];
        for segment in host.split('.') {
            if segment.is_empty() { return false; }
            if !segment.chars().all(|c| c.is_alphanumeric() || c == '-') { return false; }
        }
        for c in host.chars() {
            if c == '.' { dot_count += 1; }
        }
        dot_count >= 1 && host.len() >= 4
    };
    if domain_re_like(trimmed) {
        return ("url".into(), format!("https://{}", trimmed));
    }
    ("search".into(), format!("{}{}", search_url, trimmed))
}

/// Extract hostname from a URL, stripping `www.` prefix.
pub fn hostname(url: &str) -> String {
    // Find scheme separator
    let after_scheme = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };
    // Take until first /, ?, or #
    let host = after_scheme
        .split(|c| c == '/' || c == '?' || c == '#')
        .next()
        .unwrap_or(url);
    // Strip www.
    let host = if host.starts_with("www.") { &host[4..] } else { host };
    // Strip port
    let host = host.split(':').next().unwrap_or(host);
    host.to_string()
}

/// Percent-encode a URL for use as a query parameter value.
/// Encodes all characters except unreserved ones (alphanumeric, - _ . ~)
/// plus : / @ and a few others that are safe inside a URL parameter value.
fn encode_url_param(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~'
            | b':' | b'/' | b'@' | b',' | b';' => {
                out.push(b as char);
            }
            // Must encode: & = # + % ? and space
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

/// Build proxy URL using the backend /api/web/proxy endpoint.
pub fn to_proxy_url(url: &str, proxy_origin: &str, backend_url: &str) -> String {
    if url.is_empty() {
        return String::new();
    }
    // Prefer proxy_origin (frontend's settings.browser.proxyUrl) when available,
    // fall back to backend_url (Rust knows the backend address directly).
    let base = if !proxy_origin.is_empty() {
        proxy_origin
    } else if !backend_url.is_empty() {
        backend_url
    } else {
        return url.to_string();
    };
    format!("{}/api/web/proxy?url={}", base, encode_url_param(url))
}

/* ---------- Shields stats ---------- */

/// Accumulate shields stats: increment fields by given amounts.
/// Returns updated stats object as JSON string.
pub fn stats_increment(stats_json: &str, ads: u32, trackers: u32, https: u32, scripts: u32, data: u64) -> String {
    let obj = match Parser::new(stats_json.as_bytes()).value() {
        Some(Value::Obj(pairs)) => pairs,
        _ => vec![],
    };
    let mut ads_blocked = as_num(get(&obj, "adsBlocked").unwrap_or(&Value::Num(0.0))) as u64;
    let mut trackers_blocked = as_num(get(&obj, "trackersBlocked").unwrap_or(&Value::Num(0.0))) as u64;
    let mut https_upgrades = as_num(get(&obj, "httpsUpgrades").unwrap_or(&Value::Num(0.0))) as u64;
    let mut scripts_blocked = as_num(get(&obj, "scriptsBlocked").unwrap_or(&Value::Num(0.0))) as u64;
    let mut data_saved = as_num(get(&obj, "dataSaved").unwrap_or(&Value::Num(0.0))) as u64;
    let mut time_saved = as_num(get(&obj, "timeSaved").unwrap_or(&Value::Num(0.0))) as u64;

    ads_blocked += ads as u64;
    trackers_blocked += trackers as u64;
    https_upgrades += https as u64;
    scripts_blocked += scripts as u64;
    data_saved += data;
    // Rough estimate: each blocked item saves ~50ms
    time_saved += ((ads + trackers + scripts) as u64) * 50;

    format!(
        r#"{{"adsBlocked":{},"trackersBlocked":{},"httpsUpgrades":{},"scriptsBlocked":{},"dataSaved":{},"timeSaved":{}}}"#,
        ads_blocked, trackers_blocked, https_upgrades, scripts_blocked, data_saved, time_saved
    )
}

/// Check if stats need daily reset. Returns "reset" with zeroed stats if the
/// timestamp is from a previous day, otherwise returns "keep" with original.
pub fn stats_daily_reset(stats_json: &str, now_ms: f64) -> String {
    let obj = match Parser::new(stats_json.as_bytes()).value() {
        Some(Value::Obj(pairs)) => pairs,
        _ => return format!(r#"{{"adsBlocked":0,"trackersBlocked":0,"httpsUpgrades":0,"scriptsBlocked":0,"dataSaved":0,"timeSaved":0,"lastReset":{}}}"#, now_ms),
    };
    let last_reset = as_num(get(&obj, "lastReset").unwrap_or(&Value::Num(0.0)));
    let ms_per_day = 86_400_000.0;
    let last_day = (last_reset / ms_per_day).floor() as u64;
    let now_day = (now_ms / ms_per_day).floor() as u64;

    if last_day < now_day {
        format!(
            r#"{{"adsBlocked":0,"trackersBlocked":0,"httpsUpgrades":0,"scriptsBlocked":0,"dataSaved":0,"timeSaved":0,"lastReset":{}}}"#,
            now_ms
        )
    } else {
        let mut parts = Vec::new();
        for (k, v) in &obj {
            parts.push(format!(r#""{}":{}"#, json_escape(k), write_value(v)));
        }
        format!("{{{}}}", parts.join(","))
    }
}

/// Format large numbers for display: 1234 -> "1.2K", 1000000 -> "1M".
pub fn format_stat_number(n: f64) -> String {
    if n < 1_000.0 {
        return format!("{}", n as u64);
    }
    if n < 1_000_000.0 {
        let k = n / 1_000.0;
        if k.fract() < 0.05 || k.fract() > 0.95 {
            return format!("{}K", k.round() as u64);
        }
        return format!("{:.1}K", k);
    }
    let m = n / 1_000_000.0;
    if m.fract() < 0.05 || m.fract() > 0.95 {
        return format!("{}M", m.round() as u64);
    }
    format!("{:.1}M", m)
}

/// Format seconds into human-readable time: "2h 15m", "45m", "30s".
pub fn format_time_saved(seconds: f64) -> String {
    let s = seconds as u64;
    if s < 60 {
        return format!("{}s", s);
    }
    if s < 3600 {
        return format!("{}m {}", s / 60, s % 60);
    }
    format!("{}h {}m", s / 3600, (s % 3600) / 60)
}

/* ---------- Bookmarks ---------- */

/// Build a folder tree from a flat bookmark array.
/// Input: {"bookmarks": [{title, url, folder?}...]}
/// Output: JSON array of tree nodes {name, children: [...], items: [...]}
pub fn bookmark_tree(bookmarks_json: &str) -> String {
    let root = match Parser::new(bookmarks_json.as_bytes()).value() {
        Some(Value::Arr(items)) => items,
        _ => return "[]".into(),
    };

    // Collect folders and items
    let mut folders: Vec<(String, Vec<usize>)> = Vec::new(); // (name, item_indices)
    let mut folder_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut unfiled: Vec<usize> = Vec::new();

    for (idx, item) in root.iter().enumerate() {
        if let Value::Obj(ref obj) = item {
            let folder = get(obj, "folder")
                .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
                .unwrap_or("");
            if folder.is_empty() {
                unfiled.push(idx);
            } else {
                let fidx = folder_map.entry(folder.to_string()).or_insert_with(|| {
                    folders.push((folder.to_string(), Vec::new()));
                    folders.len() - 1
                });
                folders[*fidx].1.push(idx);
            }
        }
    }

    let mut result = String::from("[");
    // "Bar" folder first
    let bar_items: Vec<String> = unfiled.iter().map(|&i| {
        let Value::Obj(ref obj) = root[i] else { return String::new() };
        bookmark_item_json(obj)
    }).filter(|s| !s.is_empty()).collect();

    result.push_str(&format!(
        r#"{{"name":"Bookmarks Bar","children":[],"items":[{}]}}"#,
        bar_items.join(",")
    ));

    for (name, indices) in &folders {
        let items: Vec<String> = indices.iter().map(|&i| {
            let Value::Obj(ref obj) = root[i] else { return String::new() };
            bookmark_item_json(obj)
        }).filter(|s| !s.is_empty()).collect();
        result.push_str(&format!(
            r#",{{"name":"{}","children":[],"items":[{}]}}"#,
            json_escape(name),
            items.join(",")
        ));
    }
    result.push(']');
    result
}

fn bookmark_item_json(obj: &[(String, Value)]) -> String {
    let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    format!(r#"{{"title":"{}","url":"{}"}}"#, json_escape(title), json_escape(url))
}

/// Search bookmarks by query (case-insensitive match on title and URL).
pub fn bookmark_search(bookmarks_json: &str, query: &str) -> String {
    let root = match Parser::new(bookmarks_json.as_bytes()).value() {
        Some(Value::Arr(items)) => items,
        _ => return "[]".into(),
    };
    let q = query.to_lowercase();
    let mut results = Vec::new();
    for item in &root {
        if let Value::Obj(ref obj) = item {
            let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
            let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
            if q.is_empty() || title.to_lowercase().contains(&q) || url.to_lowercase().contains(&q) {
                results.push(bookmark_item_json(obj));
            }
        }
    }
    format!("[{}]", results.join(","))
}

/* ---------- History ---------- */

/// Group history entries by date bucket: "Today", "Yesterday", "Last 7 days", "Last 30 days", "Older".
/// Input: {"entries": [{title, url, timestamp}...], "now": 1234567890000}
/// Output: JSON array of {label, entries: [...]}
pub fn history_group(entries_json: &str, now_ms: f64) -> String {
    let root = match Parser::new(entries_json.as_bytes()).value() {
        Some(Value::Obj(ref obj)) => get(obj, "entries").cloned(),
        _ => None,
    };
    let entries = match root {
        Some(Value::Arr(items)) => items,
        _ => return r#"[{"label":"Today","entries":[]}]"#.into(),
    };

    let ms_per_day = 86_400_000.0;
    let now_day = (now_ms / ms_per_day).floor() as i64;

    let mut today: Vec<String> = Vec::new();
    let mut yesterday: Vec<String> = Vec::new();
    let mut week: Vec<String> = Vec::new();
    let mut month: Vec<String> = Vec::new();
    let mut older: Vec<String> = Vec::new();

    for item in &entries {
        if let Value::Obj(ref obj) = item {
            let ts = as_num(get(obj, "timestamp").unwrap_or(&Value::Num(0.0)));
            let entry_day = (ts / ms_per_day).floor() as i64;
            let diff = now_day - entry_day;
            let entry_json = history_entry_json(obj);
            match diff {
                0 => today.push(entry_json),
                1 => yesterday.push(entry_json),
                2..=7 => week.push(entry_json),
                8..=30 => month.push(entry_json),
                _ => older.push(entry_json),
            }
        }
    }

    let mut groups = Vec::new();
    if !today.is_empty() { groups.push(format!(r#"{{"label":"Today","entries":[{}]}}"#, today.join(","))); }
    if !yesterday.is_empty() { groups.push(format!(r#"{{"label":"Yesterday","entries":[{}]}}"#, yesterday.join(","))); }
    if !week.is_empty() { groups.push(format!(r#"{{"label":"Last 7 days","entries":[{}]}}"#, week.join(","))); }
    if !month.is_empty() { groups.push(format!(r#"{{"label":"Last 30 days","entries":[{}]}}"#, month.join(","))); }
    if !older.is_empty() { groups.push(format!(r#"{{"label":"Older","entries":[{}]}}"#, older.join(","))); }

    if groups.is_empty() {
        r#"[{"label":"Today","entries":[]}]"#.into()
    } else {
        format!("[{}]", groups.join(","))
    }
}

fn history_entry_json(obj: &[(String, Value)]) -> String {
    let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let ts = as_num(get(obj, "timestamp").unwrap_or(&Value::Num(0.0)));
    format!(r#"{{"title":"{}","url":"{}","timestamp":{}}}"#, json_escape(title), json_escape(url), fmt_num(ts))
}

/// Search history entries by title/URL (case-insensitive).
pub fn history_search(entries_json: &str, query: &str) -> String {
    let entries = match Parser::new(entries_json.as_bytes()).value() {
        Some(Value::Arr(items)) => items,
        _ => return "[]".into(),
    };
    let q = query.to_lowercase();
    let mut results = Vec::new();
    for item in &entries {
        if let Value::Obj(ref obj) = item {
            let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
            let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
            if q.is_empty() || title.to_lowercase().contains(&q) || url.to_lowercase().contains(&q) {
                results.push(history_entry_json(obj));
            }
        }
    }
    format!("[{}]", results.join(","))
}

/* ---------- Omnibox ranking ---------- */

/// Rank suggestions from history + bookmarks + top sites.
/// Input: {"query":"...", "history":[...], "bookmarks":[...], "topSites":[...]}
/// Output: JSON array of {title, url, type, score} sorted by score desc.
pub fn omnibox_rank(input_json: &str) -> String {
    let root = match Parser::new(input_json.as_bytes()).value() {
        Some(Value::Obj(obj)) => obj,
        _ => return "[]".into(),
    };
    let query = get(&root, "query")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("")
        .to_lowercase();

    let mut scored: Vec<(String, String, String, f64)> = Vec::new(); // (title, url, type, score)

    // Score bookmarks (weight 1.5)
    if let Some(Value::Arr(items)) = get(&root, "bookmarks") {
        for item in items {
            if let Value::Obj(ref obj) = item {
                let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let score = rank_item(title, url, &query, 1.5);
                if score > 0.0 {
                    scored.push((title.into(), url.into(), "bookmark".into(), score));
                }
            }
        }
    }

    // Score history (weight 1.2)
    if let Some(Value::Arr(items)) = get(&root, "history") {
        for item in items {
            if let Value::Obj(ref obj) = item {
                let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let ts = as_num(get(obj, "timestamp").unwrap_or(&Value::Num(0.0)));
                let recency = 1.0 + (ts / 86_400_000.0).max(0.0).min(30.0) / 30.0;
                let score = rank_item(title, url, &query, 1.2) * recency;
                if score > 0.0 {
                    scored.push((title.into(), url.into(), "history".into(), score));
                }
            }
        }
    }

    // Score top sites (weight 2.0)
    if let Some(Value::Arr(items)) = get(&root, "topSites") {
        for item in items {
            if let Value::Obj(ref obj) = item {
                let title = get(obj, "title").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let url = get(obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
                let score = rank_item(title, url, &query, 2.0);
                if score > 0.0 {
                    scored.push((title.into(), url.into(), "topsite".into(), score));
                }
            }
        }
    }

    scored.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(8);

    let parts: Vec<String> = scored.iter().map(|(title, url, typ, score)| {
        format!(
            r#"{{"title":"{}","url":"{}","type":"{}","score":{}}}"#,
            json_escape(title), json_escape(url), json_escape(typ), fmt_num(*score)
        )
    }).collect();
    format!("[{}]", parts.join(","))
}

fn rank_item(title: &str, url: &str, query: &str, weight: f64) -> f64 {
    if query.is_empty() {
        return weight * 0.5;
    }
    let title_lower = title.to_lowercase();
    let url_lower = url.to_lowercase();
    if title_lower.starts_with(query) {
        return weight * 3.0;
    }
    if url_lower.starts_with(query) {
        return weight * 2.5;
    }
    if title_lower.contains(query) {
        return weight * 2.0;
    }
    if url_lower.contains(query) {
        return weight * 1.5;
    }
    // Word prefix match
    for word in title_lower.split_whitespace() {
        if word.starts_with(query) {
            return weight * 1.8;
        }
    }
    0.0
}

/* ---------- HTML sanitization ---------- */

/// Strip dangerous HTML tags and attributes. Returns cleaned HTML string.
pub fn sanitize_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut i = 0;
    let bytes = html.as_bytes();
    let dangerous_tags = ["script", "iframe", "object", "embed", "form", "link", "meta"];

    while i < bytes.len() {
        if bytes[i] == b'<' {
            // Check for closing tag
            let is_closing = i + 1 < bytes.len() && bytes[i + 1] == b'/';
            let tag_start = if is_closing { i + 2 } else { i + 1 };

            // Extract tag name
            let mut tag_end = tag_start;
            while tag_end < bytes.len() && bytes[tag_end].is_ascii_alphanumeric() {
                tag_end += 1;
            }
            let tag_name = html[tag_start..tag_end].to_lowercase();

            // Check if dangerous
            let is_dangerous = dangerous_tags.iter().any(|&dt| tag_name == dt);

            if is_dangerous {
                // Skip entire tag
                while i < bytes.len() && bytes[i] != b'>' {
                    i += 1;
                }
                if i < bytes.len() { i += 1; } // skip '>'
            } else {
                result.push('<');
                if is_closing { result.push('/'); }
                i = tag_start;
                // Copy until '>' but strip on* event handlers
                let mut in_tag = true;
                while i < bytes.len() && in_tag {
                    if bytes[i] == b'>' {
                        result.push('>');
                        i += 1;
                        in_tag = false;
                    } else if bytes[i] == b' ' || bytes[i] == b'\t' || bytes[i] == b'\n' {
                        // Check for on* attribute
                        let _ws = i;
                        while i < bytes.len() && (bytes[i] == b' ' || bytes[i] == b'\t' || bytes[i] == b'\n' || bytes[i] == b'\r') {
                            result.push(bytes[i] as char);
                            i += 1;
                        }
                        // Peek at attribute name
                        let attr_start = i;
                        while i < bytes.len() && bytes[i] != b'=' && bytes[i] != b'>' && bytes[i] != b' ' && bytes[i] != b'\t' {
                            i += 1;
                        }
                        let attr_name = html[attr_start..i].to_lowercase();
                        if attr_name.starts_with("on") && attr_name.len() >= 3 {
                            // Skip this attribute entirely
                            while i < bytes.len() && bytes[i] != b'>' && bytes[i] != b' ' && bytes[i] != b'\t' {
                                i += 1;
                            }
                            // Skip value if present
                            while i < bytes.len() && bytes[i] != b'>' {
                                if bytes[i] == b'"' {
                                    i += 1;
                                    while i < bytes.len() && bytes[i] != b'"' { i += 1; }
                                    if i < bytes.len() { i += 1; }
                                    break;
                                }
                                if bytes[i] == b'\'' {
                                    i += 1;
                                    while i < bytes.len() && bytes[i] != b'\'' { i += 1; }
                                    if i < bytes.len() { i += 1; }
                                    break;
                                }
                                i += 1;
                            }
                        } else {
                            // Copy the attribute name
                            for b in &bytes[attr_start..i] {
                                result.push(*b as char);
                            }
                        }
                    } else {
                        result.push(bytes[i] as char);
                        i += 1;
                    }
                }
            }
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }
    result
}

/* ---------- Slug ---------- */

/// URL-safe slug from a page title.
pub fn slug(text: &str) -> String {
    let mut slug = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            'a'..='z' | '0'..='9' => slug.push(c),
            'A'..='Z' => slug.push(c.to_ascii_lowercase()),
            ' ' | '-' | '_' => {
                if !slug.ends_with('-') {
                    slug.push('-');
                }
            }
            _ => {}
        }
    }
    // Trim leading/trailing hyphens
    let s = slug.trim_matches('-');
    if s.len() > 80 {
        s[..80].to_string()
    } else {
        s.to_string()
    }
}

/* ---------- Value serializer helper ---------- */

fn write_value(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(b) => if *b { "true" } else { "false" }.into(),
        Value::Num(n) => fmt_num(*n),
        Value::Str(s) => format!("\"{}\"", json_escape(s)),
        Value::Arr(items) => {
            let parts: Vec<String> = items.iter().map(|i| write_value(i)).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Obj(pairs) => {
            let parts: Vec<String> = pairs.iter().map(|(k, v)| {
                format!("\"{}\":{}", json_escape(k), write_value(v))
            }).collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

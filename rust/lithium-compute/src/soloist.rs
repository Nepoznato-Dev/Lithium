//! Soloist — entity extraction, playback position.
//! Ported from coreNative.js lines 542-568.

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct Item {
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub decorations: Option<serde_json::Value>,
}

#[derive(Serialize)]
pub struct EntityInfo {
    pub uri: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub cover: Option<String>,
    pub duration_ms: u64,
}

pub fn entity_info(item: Option<&Item>) -> EntityInfo {
    let item = match item {
        Some(i) if !i.uri.is_empty() => i,
        _ => return EntityInfo { uri: String::new(), name: "Unknown".into(), artist: String::new(), album: String::new(), cover: None, duration_ms: 0 },
    };
    let decor = match &item.decorations {
        Some(d) => d,
        None => return EntityInfo { uri: item.uri.clone(), name: "Unknown".into(), artist: String::new(), album: String::new(), cover: None, duration_ms: 0 },
    };
    let name = decor.pointer("/identity/name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
    let mut artist = String::new();
    if let Some(arr) = decor.get("creators").and_then(|v| v.as_array()) {
        let names: Vec<&str> = arr.iter()
            .filter_map(|c| c.pointer("/entity/decorations/identity/name").and_then(|v| v.as_str()))
            .collect();
        artist = names.join(", ");
    }
    let album = decor.pointer("/parent/entity/decorations/identity/name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let cover = decor.pointer("/visual_identity/cover/0/url").and_then(|v| v.as_str()).map(|s| s.to_string());
    let duration_ms = decor.pointer("/playback/duration_ms").and_then(|v| v.as_u64()).unwrap_or(0);
    EntityInfo { uri: item.uri.clone(), name, artist, album, cover, duration_ms }
}

#[derive(Deserialize)]
pub struct Anchor {
    #[serde(default)]
    pub position_ms: u64,
    #[serde(default)]
    pub timestamp_ms: u64,
    #[serde(default)]
    pub speed: f64,
}

pub fn position(anchor: Option<&Anchor>, status: &str, now: Option<u64>) -> f64 {
    let anchor = match anchor {
        Some(a) => a,
        None => return 0.0,
    };
    if status != "playing" || anchor.speed == 0.0 || now.is_none() {
        return anchor.position_ms as f64 / 1000.0;
    }
    let now = now.unwrap();
    (anchor.position_ms as f64 + (now as f64 - anchor.timestamp_ms as f64) * anchor.speed) / 1000.0
}

//! Persistent model memory + context-window builder.

use axum::Json;
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use serde::Deserialize;
use rusqlite::params;

use crate::db;

const VALUE_CAP: usize = 2000;
const KEY_CAP: usize = 64;
const ENTRY_CAP: usize = 200;

#[derive(Deserialize)]
pub struct MemoryIn { pub key: String, pub value: String }

#[derive(Deserialize)]
pub struct SyncIn { pub entries: std::collections::HashMap<String, serde_json::Value> }

#[derive(Deserialize)]
pub struct ContextIn {
    pub messages: Vec<serde_json::Value>,
    pub max_tokens: Option<i64>,
    pub model_id: Option<String>,
    #[serde(default = "default_true")]
    pub include_memory: bool,
}
fn default_true() -> bool { true }

#[derive(Deserialize)]
pub struct SearchQ { #[serde(default)] pub q: String }

pub async fn list_memory() -> serde_json::Value {
    db::with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT key, value, updated_at FROM memories ORDER BY updated_at DESC").unwrap();
        let mut map = serde_json::Map::new();
        for row in stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?))
        }).unwrap() {
            if let Ok((k, v, t)) = row {
                map.insert(k, serde_json::json!({"value": v, "updatedAt": t}));
            }
        }
        serde_json::Value::Object(map)
    }).await
}

pub async fn list_memory_handler() -> Json<serde_json::Value> {
    Json(list_memory().await)
}

pub async fn write_memory(Json(body): Json<MemoryIn>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let key = body.key.trim().chars().take(KEY_CAP).collect::<String>();
    if key.is_empty() { return Err((StatusCode::BAD_REQUEST, "memory key must not be empty".into())); }
    let value = body.value.chars().take(VALUE_CAP).collect::<String>();
    let now = db::chrono_millis();
    let k = key.clone();
    db::with_conn(move |conn| {
        conn.execute(
            "INSERT INTO memories (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![k, value, now],
        ).unwrap();
        conn.execute(
            "DELETE FROM memories WHERE key IN (SELECT key FROM memories ORDER BY updated_at DESC LIMIT -1 OFFSET ?1)",
            params![ENTRY_CAP as i64],
        ).unwrap();
    }).await;
    Ok(Json(serde_json::json!({"ok": true, "key": key})))
}

pub async fn delete_memory(Path(key): Path<String>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let k = key.clone();
    let deleted = db::with_conn(move |conn| {
        conn.execute("DELETE FROM memories WHERE key = ?1", params![k]).unwrap()
    }).await;
    if deleted == 0 { return Err((StatusCode::NOT_FOUND, format!("no memory entry '{}'", key))); }
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn search_memory(Query(params): Query<SearchQ>) -> Json<serde_json::Value> {
    let needle = params.q.trim().to_lowercase();
    let memory = list_memory().await;
    if needle.is_empty() { return Json(memory); }
    let hits: serde_json::Map<String, serde_json::Value> = memory.as_object().unwrap().iter()
        .filter(|(k, v)| {
            k.to_lowercase().contains(&needle) ||
            v.get("value").and_then(|v| v.as_str()).map(|s| s.to_lowercase().contains(&needle)).unwrap_or(false)
        })
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    Json(serde_json::Value::Object(hits))
}

pub async fn sync_memory(Json(body): Json<SyncIn>) -> Json<serde_json::Value> {
    let stored = list_memory().await;
    let now = db::chrono_millis();
    let entries = body.entries;
    db::with_conn({
        let stored = stored.clone();
        move |conn| {
            for (key, entry) in &entries {
                let clean_key = key.trim().chars().take(KEY_CAP).collect::<String>();
                if clean_key.is_empty() { continue; }
                let incoming_at = entry.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(now);
                if let Some(current) = stored.get(&clean_key) {
                    if current.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0) >= incoming_at { continue; }
                }
                let value = entry.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let value = value.chars().take(VALUE_CAP).collect::<String>();
                conn.execute(
                    "INSERT INTO memories (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                    params![clean_key, value, incoming_at],
                ).unwrap();
            }
        }
    }).await;
    Json(stored)
}

async fn memory_block(max_entries: usize) -> String {
    let memory = list_memory().await;
    let keys: Vec<&String> = memory.as_object().map(|m| m.keys().take(max_entries).collect()).unwrap_or_default();
    if keys.is_empty() { return String::new(); }
    let lines: Vec<String> = keys.iter().filter_map(|k| {
        memory.get(k.as_str()).and_then(|v| v.get("value").and_then(|val| val.as_str()))
            .map(|val| format!("- {}: {}", k, val))
    }).collect();
    format!("Things you remember about the user:\n{}", lines.join("\n"))
}

pub async fn build_context(Json(body): Json<ContextIn>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if body.messages.is_empty() { return Err((StatusCode::BAD_REQUEST, "messages must not be empty".into())); }

    let mut budget = if let Some(max) = body.max_tokens {
        max
    } else if let Some(ref mid) = body.model_id {
        let mid = mid.clone();
        db::with_conn(move |conn| {
            conn.query_row("SELECT context_window FROM models WHERE id = ?1", [&mid], |r| r.get::<_, i64>(0)).ok()
        }).await.unwrap_or(8192)
    } else {
        8192
    };
    budget = budget.max(1024);
    let reserve = 1024i64;

    let mut messages = body.messages.clone();
    let memory_text = if body.include_memory { memory_block(40).await } else { String::new() };

    if !memory_text.is_empty() {
        let sys_idx = messages.iter().position(|m| m["role"] == "system");
        if let Some(idx) = sys_idx {
            if let Some(content) = messages[idx].get("content").and_then(|v| v.as_str()) {
                messages[idx]["content"] = serde_json::json!(format!("{}\n\n{}", content, memory_text));
            }
        } else {
            messages.insert(0, serde_json::json!({"role": "system", "content": memory_text}));
        }
    }

    let est_tokens = |text: &str| text.len().max(4) / 4;
    let mut total: i64 = messages.iter().map(|m| m["content"].as_str().map(|s| est_tokens(s) as i64).unwrap_or(0)).sum();
    let mut dropped = 0i64;

    while total > budget - reserve && messages.len() > 2 {
        if let Some(idx) = messages.iter().position(|m| m["role"] != "system") {
            let content_len = messages[idx]["content"].as_str().map(|s| est_tokens(s) as i64).unwrap_or(0);
            total -= content_len;
            messages.remove(idx);
            dropped += 1;
        } else { break; }
    }

    Ok(Json(serde_json::json!({
        "messages": messages, "tokens": total, "budget": budget, "dropped": dropped,
        "memoryInjected": !memory_text.is_empty(),
    })))
}

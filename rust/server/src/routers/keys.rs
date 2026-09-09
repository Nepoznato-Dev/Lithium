//! API key management — stored encrypted server-side.

use axum::Json;
use serde::Deserialize;
use rusqlite::params;

use crate::db;
use crate::encryption;

#[derive(Deserialize)]
pub struct KeyIn {
    pub provider: String,
    pub key: String,
}

pub async fn list_keys() -> Json<Vec<serde_json::Value>> {
    let rows = db::with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT provider, updated_at FROM keys ORDER BY provider").unwrap();
        stmt.query_map([], |r| {
            Ok(serde_json::json!({
                "provider": r.get::<_, String>(0)?,
                "updatedAt": r.get::<_, i64>(1)?,
            }))
        }).unwrap().filter_map(|r| r.ok()).collect::<Vec<_>>()
    });
    Json(rows)
}

pub async fn save_key(Json(body): Json<KeyIn>) -> Json<serde_json::Value> {
    let encrypted = encryption::encrypt_value(&body.key);
    let now = db::chrono_millis();
    db::with_conn(|conn| {
        conn.execute(
            "INSERT INTO keys (provider, key, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(provider) DO UPDATE SET key = excluded.key, updated_at = excluded.updated_at",
            params![body.provider, encrypted, now],
        ).unwrap();
    });
    Json(serde_json::json!({"ok": true}))
}

pub async fn delete_key(axum::extract::Path(provider): axum::extract::Path<String>) -> Json<serde_json::Value> {
    db::with_conn(|conn| {
        conn.execute("DELETE FROM keys WHERE provider = ?1", params![provider]).unwrap();
    });
    Json(serde_json::json!({"ok": true}))
}

pub fn stored_key(provider: &str) -> Option<String> {
    db::with_conn(|conn| {
        conn.query_row("SELECT key FROM keys WHERE provider = ?1", [provider], |r| r.get::<_, String>(0)).ok()
    }).map(|ciphertext| encryption::decrypt_value(&ciphertext))
}

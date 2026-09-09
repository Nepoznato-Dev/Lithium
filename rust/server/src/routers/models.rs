//! Model registry — CRUD for registered AI models.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use serde::Deserialize;
use rusqlite::params;

use crate::db;

#[derive(Deserialize)]
pub struct ModelIn {
    pub id: Option<String>,
    pub name: String,
    pub provider: String,
    pub model_name: String,
    #[serde(default = "default_cw")]
    pub context_window: i64,
    #[serde(default = "default_temp")]
    pub temperature: f64,
    #[serde(default)]
    pub is_default: bool,
}

fn default_cw() -> i64 { 8192 }
fn default_temp() -> f64 { 0.7 }

fn model_to_json(id: String, name: String, provider: String, model_name: String, cw: i64, temp: f64, is_def: i64, created: i64) -> serde_json::Value {
    serde_json::json!({
        "id": id, "name": name, "provider": provider, "model_name": model_name,
        "context_window": cw, "temperature": temp, "is_default": is_def != 0, "created_at": created,
    })
}

fn fetch_model(conn: &rusqlite::Connection, model_id: &str) -> Option<serde_json::Value> {
    conn.query_row("SELECT * FROM models WHERE id = ?1", [model_id], |r| {
        Ok(model_to_json(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?))
    }).ok()
}

pub async fn list_models() -> Json<Vec<serde_json::Value>> {
    let rows = db::with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT * FROM models ORDER BY is_default DESC, created_at").unwrap();
        stmt.query_map([], |r| {
            Ok(model_to_json(r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?))
        }).unwrap().filter_map(|r| r.ok()).collect::<Vec<_>>()
    });
    Json(rows)
}

pub async fn get_model(Path(model_id): Path<String>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let row = db::with_conn(|conn| fetch_model(conn, &model_id))
        .ok_or((StatusCode::NOT_FOUND, format!("model '{}' not found", model_id)))?;
    Ok(Json(row))
}

pub async fn create_model(Json(body): Json<ModelIn>) -> Json<serde_json::Value> {
    let model_id = body.id.unwrap_or_else(|| {
        format!("{}-{}", body.provider, body.model_name).replace('/', "-").replace('.', "-")
    });
    let now = db::chrono_millis();
    db::with_conn(|conn| {
        if body.is_default { conn.execute("UPDATE models SET is_default = 0", []).unwrap(); }
        conn.execute(
            "INSERT INTO models (id, name, provider, model_name, context_window, temperature, is_default, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![model_id, body.name, body.provider, body.model_name, body.context_window, body.temperature, body.is_default as i64, now],
        ).unwrap();
    });
    let row = db::with_conn(|conn| fetch_model(conn, &model_id)).unwrap();
    Json(row)
}

pub async fn update_model(Path(model_id): Path<String>, Json(body): Json<ModelIn>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    db::with_conn(|conn| {
        if fetch_model(conn, &model_id).is_none() {
            return Err((StatusCode::NOT_FOUND, format!("model '{}' not found", model_id)));
        }
        if body.is_default { conn.execute("UPDATE models SET is_default = 0", []).unwrap(); }
        conn.execute(
            "UPDATE models SET name = ?1, provider = ?2, model_name = ?3, context_window = ?4, temperature = ?5, is_default = ?6 WHERE id = ?7",
            params![body.name, body.provider, body.model_name, body.context_window, body.temperature, body.is_default as i64, model_id],
        ).unwrap();
        Ok(())
    })?;
    let row = db::with_conn(|conn| fetch_model(conn, &model_id)).unwrap();
    Ok(Json(row))
}

pub async fn delete_model(Path(model_id): Path<String>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let deleted = db::with_conn(|conn| {
        conn.execute("DELETE FROM models WHERE id = ?1", params![model_id]).unwrap()
    });
    if deleted == 0 {
        return Err((StatusCode::NOT_FOUND, format!("model '{}' not found", model_id)));
    }
    Ok(Json(serde_json::json!({"ok": true})))
}

//! Chat completions — resolve a registered model, then dispatch to the provider.

use axum::Json;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db;
use crate::providers;
use super::keys::stored_key;

static PROVIDER_DEFAULTS: &[(&str, &str)] = &[
    ("openai", "gpt-4o-mini"),
    ("groq", "llama-3.3-70b-versatile"),
    ("anthropic", "claude-3-5-haiku-latest"),
    ("google", "gemini-2.0-flash"),
    ("xai", "grok-3-mini"),
    ("ollama", "qwen3:0.6b"),
];

#[derive(Deserialize)]
pub struct ChatIn {
    pub messages: Value,
    pub model_id: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub keys: Option<std::collections::HashMap<String, String>>,
    #[serde(default = "default_temp")]
    pub temperature: f64,
}

fn default_temp() -> f64 { 0.7 }

#[derive(Serialize)]
pub struct ChatOut {
    pub content: String,
    pub provider: String,
    pub model: String,
    #[serde(rename = "modelId")]
    pub model_id: Option<String>,
}

pub async fn chat(Json(body): Json<ChatIn>) -> Result<Json<ChatOut>, (StatusCode, String)> {
    if body.messages.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        return Err((StatusCode::BAD_REQUEST, "messages must not be empty".into()));
    }

    let mut provider = body.provider.clone();
    let mut model_name = body.model.clone();
    let mut resolved_model: Option<(String, String, String, String, i64, f64, i64, i64)> = None;

    if let Some(ref mid) = body.model_id {
        let mid_owned = mid.clone();
        let row = db::with_conn(move |conn| {
            conn.query_row("SELECT * FROM models WHERE id = ?1", [&mid_owned], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, f64>(5)?,
                    r.get::<_, i64>(6)?, r.get::<_, i64>(7)?))
            }).ok()
        }).await;
        let row = row.ok_or((StatusCode::NOT_FOUND, format!("model '{}' not found", mid)))?;
        provider = Some(row.2.clone());
        model_name = Some(row.3.clone());
        resolved_model = Some(row);
    }

    if provider.is_none() {
        let row = db::with_conn(|conn| {
            conn.query_row("SELECT * FROM models WHERE is_default = 1 LIMIT 1", [], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?, r.get::<_, i64>(4)?, r.get::<_, f64>(5)?,
                    r.get::<_, i64>(6)?, r.get::<_, i64>(7)?))
            }).ok()
        }).await;
        if let Some(row) = row {
            provider = Some(row.2.clone());
            model_name = Some(row.3.clone());
            resolved_model = Some(row);
        }
    }

    let provider = provider.ok_or((StatusCode::BAD_REQUEST, "no model_id/provider given and no default model set".into()))?;
    if model_name.is_none() {
        model_name = PROVIDER_DEFAULTS.iter().find(|(p, _)| *p == provider).map(|(_, m)| m.to_string());
    }
    let model_name = model_name.ok_or((StatusCode::BAD_REQUEST, format!("no model known for provider '{}'", provider)))?;

    let key = match body.keys.as_ref().and_then(|k| k.get(&provider).cloned()) {
        Some(k) => Some(k),
        None => stored_key(&provider).await,
    };

    let content = providers::dispatch(&provider, &model_name, &body.messages, key.as_deref(), body.temperature)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    Ok(Json(ChatOut {
        content,
        provider,
        model: model_name,
        model_id: resolved_model.map(|r| r.0),
    }))
}

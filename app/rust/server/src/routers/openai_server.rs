//! OpenAI-compatible model server (the "mini-Ollama").

use axum::Json;
use axum::http::StatusCode;
use serde::Deserialize;

use crate::routers::local;

#[derive(Deserialize)]
pub struct ChatIn {
    pub model: String,
    pub messages: serde_json::Value,
    #[serde(default = "default_temp")]
    pub temperature: f64,
    pub max_tokens: Option<i64>,
}
fn default_temp() -> f64 { 0.7 }

fn local_id(model: &str) -> &str {
    model.strip_prefix("local:").unwrap_or(model)
}

pub async fn list_models() -> Json<serde_json::Value> {
    let models = local::list_models();
    let data: Vec<serde_json::Value> = models.iter()
        .filter(|m| m.get("exists").and_then(|v| v.as_bool()).unwrap_or(false))
        .map(|m| {
            serde_json::json!({
                "id": format!("local:{}", m["id"]),
                "object": "model",
                "created": m.get("uploadedAt").and_then(|v| v.as_i64()).unwrap_or(0) / 1000,
                "owned_by": "lithium",
            })
        })
        .collect();
    Json(serde_json::json!({ "object": "list", "data": data }))
}

pub async fn chat_completions(Json(body): Json<ChatIn>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let model_id = local_id(&body.model).to_string();
    if body.messages.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        return Err((StatusCode::BAD_REQUEST, "messages must not be empty".into()));
    }
    let content = local::chat(&model_id, &body.messages, body.temperature)
        .await
        .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, e))?;
    let id = format!("chatcmpl-{}", uuid::Uuid::new_v4().simple());
    Ok(Json(serde_json::json!({
        "id": id, "object": "chat.completion",
        "created": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
        "model": format!("local:{}", model_id),
        "choices": [{ "index": 0, "message": { "role": "assistant", "content": content }, "finish_reason": "stop" }],
        "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
    })))
}

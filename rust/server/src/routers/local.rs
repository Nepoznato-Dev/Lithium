//! Local GGUF model store — upload, download, list, delete, Ollama import.

use axum::Json;
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .unwrap()
});

static DOWNLOADS: LazyLock<Mutex<HashMap<String, Value>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn models_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe.parent().unwrap_or(std::path::Path::new("."));
    let repo = dir.join("../../backend/models_store");
    if repo.exists() { return repo; }
    dir.join("models_store")
}

fn manifest_path() -> PathBuf { models_dir().join("manifest.json") }

pub fn ensure_dir() {
    let _ = std::fs::create_dir_all(models_dir());
    if !manifest_path().exists() {
        let _ = std::fs::write(manifest_path(), "{}");
    }
}

pub fn slugify(name: &str) -> String {
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

fn safe_name(name: &str) -> String {
    name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == ' ').collect()
}

fn read_manifest() -> HashMap<String, Value> {
    let text = std::fs::read_to_string(manifest_path()).unwrap_or_else(|_| "{}".to_string());
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_manifest(manifest: &HashMap<String, Value>) {
    let _ = std::fs::write(manifest_path(), serde_json::to_string_pretty(manifest).unwrap_or_default());
}

pub fn list_models() -> Vec<Value> {
    let manifest = read_manifest();
    manifest.values().cloned().collect()
}

pub async fn chat(model_id: &str, messages: &Value, temperature: f64) -> Result<String, String> {
    // Forward to Ollama
    let resp = HTTP_CLIENT.post("http://localhost:11434/api/chat")
        .timeout(std::time::Duration::from_secs(120))
        .json(&serde_json::json!({ "model": model_id, "messages": messages, "stream": false, "options": { "temperature": temperature } }))
        .send().await.map_err(|e| format!("ollama: {}", e))?;
    let body = resp.text().await.map_err(|e| e.to_string())?;
    let json: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(json["message"]["content"].as_str().unwrap_or("").to_string())
}

pub async fn status() -> Json<Value> {
    let reachable = crate::providers::ollama_reachable().await;
    Json(serde_json::json!({ "ollama": reachable }))
}

const DOWNLOAD_TTL_MS: i64 = 10 * 60 * 1000;

fn evict_stale_downloads() {
    let now = crate::db::chrono_millis();
    let mut map = DOWNLOADS.lock().unwrap();
    map.retain(|_, v| {
        let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("");
        if status == "done" || status == "error" {
            let completed_at = v.get("completedAt").and_then(|t| t.as_i64()).unwrap_or(0);
            now - completed_at < DOWNLOAD_TTL_MS
        } else {
            true
        }
    });
}

pub async fn models_list() -> Json<Value> {
    evict_stale_downloads();
    let downloads = DOWNLOADS.lock().unwrap().values().cloned().collect::<Vec<_>>();
    Json(serde_json::json!({ "models": list_models(), "downloads": downloads }))
}

#[derive(Deserialize)]
pub struct DownloadIn { pub url: String, pub name: Option<String> }

pub async fn upload(mut multipart: axum::extract::Multipart) -> Result<Json<Value>, (StatusCode, String)> {
    let field = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
        .ok_or((StatusCode::BAD_REQUEST, "no file uploaded".to_string()))?;
    let file_name = safe_name(&field.file_name().unwrap_or("model.gguf"));
    if !file_name.to_lowercase().ends_with(".gguf") {
        return Err((StatusCode::BAD_REQUEST, "only .gguf files are supported".to_string()));
    }
    ensure_dir();
    let target = models_dir().join(&file_name);
    let data = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    std::fs::write(&target, &data).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let id = slugify(&file_name.trim_end_matches(".gguf"));
    let entry = serde_json::json!({
        "id": id, "name": file_name.trim_end_matches(".gguf"), "filename": file_name,
        "path": target.to_string_lossy(), "source": "upload",
        "exists": true, "uploadedAt": crate::db::chrono_millis(),
    });
    let mut manifest = read_manifest();
    manifest.insert(id.clone(), entry.clone());
    write_manifest(&manifest);
    Ok(Json(entry))
}

pub async fn download(Json(body): Json<DownloadIn>) -> Result<Json<Value>, (StatusCode, String)> {
    if !body.url.starts_with("http://") && !body.url.starts_with("https://") {
        return Err((StatusCode::BAD_REQUEST, "url must be http(s)".to_string()));
    }
    let file_name = safe_name(&body.name.clone().unwrap_or_else(|| {
        body.url.split('?').next().unwrap_or("model.gguf").split('/').last().unwrap_or("model.gguf").to_string()
    }));
    let file_name = if file_name.to_lowercase().ends_with(".gguf") { file_name } else { format!("{}.gguf", file_name) };
    let job_id = uuid::Uuid::new_v4().simple().to_string()[..8].to_string();
    let job = serde_json::json!({
        "jobId": job_id, "url": body.url, "name": file_name,
        "received": 0, "total": 0, "status": "downloading", "error": "", "modelId": null,
    });
    DOWNLOADS.lock().unwrap().insert(job_id.clone(), job.clone());

    let url = body.url.clone();
    let fname = file_name.clone();
    let jid = job_id.clone();
    tokio::spawn(async move {
        download_job(&jid, &url, &fname).await;
    });

    Ok(Json(job))
}

async fn download_job(job_id: &str, url: &str, file_name: &str) {
    ensure_dir();
    let target = models_dir().join(file_name);
    let result = async {
        let resp = HTTP_CLIENT.get(url).send().await?;
        let total = resp.content_length().unwrap_or(0);
        { DOWNLOADS.lock().unwrap().get_mut(job_id).map(|j| j["total"] = total.into()); }
        let mut file = tokio::fs::File::create(&target).await?;
        let mut stream = resp.bytes_stream();
        let mut received: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk).await?;
            received += chunk.len() as u64;
            { DOWNLOADS.lock().unwrap().get_mut(job_id).map(|j| j["received"] = received.into()); }
        }
        file.flush().await?;
        Ok::<_, Box<dyn std::error::Error + Send + Sync>>(received as usize)
    }.await;

    match result {
        Ok(_) => {
            let id = slugify(file_name.trim_end_matches(".gguf"));
            let entry = serde_json::json!({
                "id": id, "name": file_name.trim_end_matches(".gguf"), "filename": file_name,
                "path": target.to_string_lossy(), "source": url,
                "exists": true, "uploadedAt": crate::db::chrono_millis(),
            });
            let mut manifest = read_manifest();
            manifest.insert(id.clone(), entry);
            write_manifest(&manifest);
            DOWNLOADS.lock().unwrap().get_mut(job_id).map(|j| {
                j["status"] = "done".into();
                j["modelId"] = serde_json::json!(id);
                j["completedAt"] = serde_json::json!(crate::db::chrono_millis());
            });
        }
        Err(e) => {
            let _ = std::fs::remove_file(&target);
            DOWNLOADS.lock().unwrap().get_mut(job_id).map(|j| {
                j["status"] = "error".into();
                j["error"] = e.to_string()[..e.to_string().len().min(300)].into();
                j["completedAt"] = serde_json::json!(crate::db::chrono_millis());
            });
        }
    }
}

pub async fn delete_model(Path(model_id): Path<String>) -> Result<Json<Value>, (StatusCode, String)> {
    let mut manifest = read_manifest();
    let entry = manifest.remove(&model_id);
    if entry.is_none() {
        return Err((StatusCode::NOT_FOUND, format!("local model '{}' not found", model_id)));
    }
    // Try to remove the file
    if let Some(ref e) = entry {
        if let Some(path) = e.get("path").and_then(|v| v.as_str()) {
            let _ = std::fs::remove_file(path);
        }
    }
    write_manifest(&manifest);
    Ok(Json(serde_json::json!({"ok": true})))
}

pub async fn import_model(Path(model_id): Path<String>) -> Result<Json<Value>, (StatusCode, String)> {
    let manifest = read_manifest();
    let _entry = manifest.get(&model_id)
        .ok_or((StatusCode::NOT_FOUND, format!("local model '{}' not found", model_id)))?;
    // In production, this would import to Ollama via CLI
    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Deserialize)]
pub struct ProxyQ { pub url: String }

pub async fn proxy(Query(params): Query<ProxyQ>) -> Result<axum::response::Response, (StatusCode, String)> {
    let parsed = url::Url::parse(&params.url).map_err(|_| (StatusCode::BAD_REQUEST, "invalid URL".to_string()))?;
    let host = parsed.host_str().unwrap_or("").to_string();
    let mut url = params.url.clone();
    if host == "api.huggingface.co" {
        url = url.replace("://api.huggingface.co", "://huggingface.co");
    }
    let resp = HTTP_CLIENT.get(&url).send().await.map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    let status = resp.status().as_u16();
    let content_length = resp.headers().get("content-length").cloned();
    let bytes = resp.bytes().await.map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    let mut builder = axum::response::Response::builder().status(status);
    if let Some(cl) = content_length {
        builder = builder.header("Content-Length", cl);
    }
    Ok(builder.body(bytes.into()).unwrap_or_default())
}

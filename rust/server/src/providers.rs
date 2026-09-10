//! AI provider dispatch — OpenAI-compat, Anthropic, Google, Ollama.

use reqwest::Client;
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;

static OLLAMA_BASE: &str = "http://localhost:11434";

static RE_KEY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"[?&]key=[^\s&'"]+"#).unwrap());
static RE_BEARER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"Bearer\s+[^\s'"]+"#).unwrap());
static RE_XKEY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(x-api-key["\s:]+)[^\s'"]+"#).unwrap());

static HTTP_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap()
});

static OPENAI_COMPAT: &[(&str, &str)] = &[
    ("openai", "https://api.openai.com/v1"),
    ("groq", "https://api.groq.com/openai/v1"),
    ("xai", "https://api.x.ai/v1"),
];

pub async fn ollama_reachable() -> bool {
    HTTP_CLIENT.get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(2))
        .send().await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

pub async fn dispatch(provider: &str, model_name: &str, messages: &Value, key: Option<&str>, temperature: f64) -> Result<String, String> {
    if let Some((_, base)) = OPENAI_COMPAT.iter().find(|(p, _)| *p == provider) {
        return openai_compat(provider, base, model_name, messages, key, temperature).await;
    }
    match provider {
        "anthropic" => anthropic(model_name, messages, key).await,
        "google" => google(model_name, messages, key).await,
        "ollama" => ollama(model_name, messages, temperature).await,
        _ => Err(format!("unknown provider '{}'", provider)),
    }
}

fn sanitize(text: &str) -> String {
    let t = RE_KEY.replace_all(text, "?key=***");
    let t = RE_BEARER.replace_all(&t, "Bearer ***");
    let t = RE_XKEY.replace_all(&t, "${1}***");
    t.to_string()
}

fn raise_for(provider: &str, status: u16, body: &str) -> Result<String, String> {
    if status >= 400 {
        let detail = serde_json::from_str::<Value>(body).ok()
            .and_then(|v| v.get("error").cloned())
            .map(|e| {
                if let Some(s) = e.as_str() { s.to_string() }
                else if let Some(m) = e.get("message").and_then(|v| v.as_str()) { m.to_string() }
                else { e.to_string() }
            })
            .unwrap_or_else(|| body[..body.len().min(200)].to_string());
        Err(format!("{}: {}", provider, sanitize(&detail)))
    } else {
        Ok(String::new())
    }
}

async fn openai_compat(provider: &str, base: &str, model_name: &str, messages: &Value, key: Option<&str>, temperature: f64) -> Result<String, String> {
    let key = key.ok_or_else(|| format!("{}: no API key stored", provider))?;
    let resp = HTTP_CLIENT.post(format!("{}/chat/completions", base))
        .header("Authorization", format!("Bearer {}", key))
        .json(&serde_json::json!({ "model": model_name, "messages": messages, "temperature": temperature }))
        .send().await.map_err(|e| format!("{}: network error ({})", provider, e))?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    raise_for(provider, status, &body)?;
    let json: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string())
}

async fn anthropic(model_name: &str, messages: &Value, key: Option<&str>) -> Result<String, String> {
    let key = key.ok_or_else(|| "anthropic: no API key stored".to_string())?;
    let msgs = messages.as_array().ok_or("messages must be an array")?;
    let system: String = msgs.iter().filter(|m| m["role"] == "system").map(|m| m["content"].as_str().unwrap_or("")).collect::<Vec<_>>().join("\n");
    let turns: Vec<&Value> = msgs.iter().filter(|m| m["role"] != "system").collect();
    let body = serde_json::json!({
        "model": model_name, "max_tokens": 1024,
        "system": if system.is_empty() { Value::Null } else { Value::String(system) },
        "messages": turns,
    });
    let resp = HTTP_CLIENT.post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key).header("anthropic-version", "2023-06-01")
        .json(&body).send().await.map_err(|e| format!("anthropic: network error ({})", e))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    raise_for("anthropic", status, &text)?;
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let content = json["content"].as_array().map(|arr| {
        arr.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("")
    }).unwrap_or_default();
    Ok(content)
}

async fn google(model_name: &str, messages: &Value, key: Option<&str>) -> Result<String, String> {
    let key = key.ok_or_else(|| "google: no API key stored".to_string())?;
    let msgs = messages.as_array().ok_or("messages must be an array")?;
    let system: String = msgs.iter().filter(|m| m["role"] == "system").map(|m| m["content"].as_str().unwrap_or("")).collect::<Vec<_>>().join("\n");
    let turns: Vec<&Value> = msgs.iter().filter(|m| m["role"] != "system").collect();
    let contents: Vec<Value> = turns.iter().map(|m| {
        let role = if m["role"] == "assistant" { "model" } else { "user" };
        serde_json::json!({ "role": role, "parts": [{"text": m["content"]}] })
    }).collect();
    let mut body = serde_json::json!({ "contents": contents });
    if !system.is_empty() {
        body["systemInstruction"] = serde_json::json!({ "parts": [{"text": system}] });
    }
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model_name, key);
    let resp = HTTP_CLIENT.post(&url).json(&body).send().await.map_err(|e| format!("google: network error ({})", e))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    raise_for("google", status, &text)?;
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let candidates = json["candidates"].as_array();
    Ok(candidates.and_then(|c| c.first())
        .and_then(|c| c["content"]["parts"].as_array())
        .map(|parts| parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join(""))
        .unwrap_or_default())
}

async fn ollama(model_name: &str, messages: &Value, temperature: f64) -> Result<String, String> {
    let resp = HTTP_CLIENT.post(format!("{}/api/chat", OLLAMA_BASE))
        .json(&serde_json::json!({ "model": model_name, "messages": messages, "stream": false, "options": { "temperature": temperature } }))
        .send().await.map_err(|e| format!("ollama: network error ({})", e))?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    raise_for("ollama", status, &body)?;
    let json: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(json["message"]["content"].as_str().unwrap_or("").to_string())
}

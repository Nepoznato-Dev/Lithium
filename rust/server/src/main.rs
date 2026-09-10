//! Lithium Axum server — AI proxy, model registry, web proxy, compute endpoints.

mod db;
mod providers;
mod encryption;
mod url_guard;
mod routers;

use axum::routing::{get, post, put, delete, any};
use axum::Router;
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;

const VERSION: &str = "1.0.0";

#[tokio::main]
async fn main() {
    // Initialize database
    db::init().expect("database initialization failed");

    // Ensure local model store directory exists
    routers::local::ensure_dir();

    let app = Router::new()
        // Health
        .route("/api/health", get(health))
        // Models CRUD
        .route("/api/models", get(routers::models::list_models))
        .route("/api/models", post(routers::models::create_model))
        .route("/api/models/{model_id}", get(routers::models::get_model))
        .route("/api/models/{model_id}", put(routers::models::update_model))
        .route("/api/models/{model_id}", delete(routers::models::delete_model))
        // Keys
        .route("/api/keys", get(routers::keys::list_keys))
        .route("/api/keys", post(routers::keys::save_key))
        .route("/api/keys/{provider}", delete(routers::keys::delete_key))
        // Memory
        .route("/api/memory", get(routers::memory::list_memory_handler))
        .route("/api/memory", post(routers::memory::write_memory))
        .route("/api/memory/{key}", delete(routers::memory::delete_memory))
        .route("/api/memory/search", get(routers::memory::search_memory))
        .route("/api/memory/sync", post(routers::memory::sync_memory))
        .route("/api/context/build", post(routers::memory::build_context))
        // Chat
        .route("/api/chat", post(routers::chat::chat))
        // Web proxy / search / scrape
        .route("/api/web/search", post(routers::web::search))
        .route("/api/web/scrape", post(routers::web::scrape))
        .route("/api/web/proxy", any(routers::web::proxy))
        // Local GGUF models
        .route("/api/llm/status", get(routers::local::status))
        .route("/api/llm/models", get(routers::local::models_list))
        .route("/api/llm/models/upload", post(routers::local::upload))
        .route("/api/llm/models/download", post(routers::local::download))
        .route("/api/llm/models/{model_id}", delete(routers::local::delete_model))
        .route("/api/llm/models/{model_id}/import", post(routers::local::import_model))
        .route("/api/llm/proxy", get(routers::local::proxy))
        // MCP
        .route("/api/mcp/tools", get(routers::mcp::list_tools))
        .route("/api/mcp/call", post(routers::mcp::call_tool))
        .route("/api/mcp/status", get(routers::mcp::mcp_status))
        // OpenAI-compatible
        .route("/v1/models", get(routers::openai_server::list_models))
        .route("/v1/chat/completions", post(routers::openai_server::chat_completions))
        // Compute endpoints
        .route("/api/compute/{action}", post(routers::compute::dispatch))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    "http://localhost:5173".parse().unwrap(),
                    "http://127.0.0.1:5173".parse().unwrap(),
                    "http://localhost:4173".parse().unwrap(),
                ])
                .allow_methods(Any)
                .allow_headers(Any),
        );

    let addr = SocketAddr::from(([127, 0, 0, 1], 8734));
    println!("Lithium server v{} listening on {}", VERSION, addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> axum::Json<serde_json::Value> {
    let (model_count, memory_count, default_model) = db::with_conn(|conn| {
        let mc: i64 = conn.query_row("SELECT COUNT(*) FROM models", [], |r| r.get(0)).unwrap_or(0);
        let mem: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0)).unwrap_or(0);
        let dm: Option<serde_json::Value> = conn.query_row(
            "SELECT id, name FROM models WHERE is_default = 1 LIMIT 1", [],
            |r| Ok(serde_json::json!({"id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?}))
        ).ok();
        (mc, mem, dm)
    }).await;

    let internet = tokio::task::spawn_blocking(|| {
        use std::net::ToSocketAddrs;
        "huggingface.co:443".to_socket_addrs().is_ok()
    }).await.unwrap_or(false);

    let ollama = providers::ollama_reachable().await;

    axum::Json(serde_json::json!({
        "ok": true,
        "name": "Lithium Backend",
        "version": VERSION,
        "models": model_count,
        "memories": memory_count,
        "defaultModel": default_model,
        "ollama": ollama,
        "internet": internet,
    }))
}

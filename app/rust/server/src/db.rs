//! SQLite persistence — schema, seed data, connection helper.

use rusqlite::{Connection, params};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

static DB: std::sync::LazyLock<Arc<Mutex<Connection>>> = std::sync::LazyLock::new(|| {
    let path = db_path();
    let conn = Connection::open(&path).expect("failed to open lithium.db");
    conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
    Arc::new(Mutex::new(conn))
});

fn db_path() -> PathBuf {
    // Same directory as the Python backend used: backend/lithium.db
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe.parent().unwrap_or(std::path::Path::new("."));
    // Prefer repo-relative path
    let repo = dir.join("../../backend/lithium.db");
    if repo.exists() { return repo; }
    dir.join("lithium.db")
}

pub fn init() -> Result<(), rusqlite::Error> {
    let conn = DB.lock().unwrap();
    conn.execute_batch(SCHEMA)?;
    let now = chrono_millis();
    for row in DEFAULT_MODELS {
        conn.execute(
            "INSERT OR IGNORE INTO models (id, name, provider, model_name, context_window, temperature, is_default, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![row.0, row.1, row.2, row.3, row.4, row.5, row.6, now],
        )?;
    }
    Ok(())
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  context_window INTEGER NOT NULL DEFAULT 8192,
  temperature REAL NOT NULL DEFAULT 0.7,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS keys (
  provider TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"#;

type ModelRow = (&'static str, &'static str, &'static str, &'static str, i64, f64, i64);

static DEFAULT_MODELS: &[ModelRow] = &[
    ("ollama-qwen3-0.6b", "Qwen3 0.6B (Ollama, local)", "ollama", "qwen3:0.6b", 32768, 0.7, 1),
    ("openai-gpt-4o-mini", "GPT-4o mini", "openai", "gpt-4o-mini", 128000, 0.7, 0),
    ("groq-llama-3.3-70b", "Llama 3.3 70B (Groq)", "groq", "llama-3.3-70b-versatile", 128000, 0.7, 0),
    ("anthropic-claude-haiku", "Claude 3.5 Haiku", "anthropic", "claude-3-5-haiku-latest", 200000, 0.7, 0),
    ("google-gemini-flash", "Gemini 2.0 Flash", "google", "gemini-2.0-flash", 1048576, 0.7, 0),
    ("xai-grok-3-mini", "Grok 3 mini", "xai", "grok-3-mini", 131072, 0.7, 0),
];

pub fn chrono_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Run a closure with a reference to the SQLite connection on a blocking thread.
pub async fn with_conn<F, R>(f: F) -> R
where
    F: FnOnce(&Connection) -> R + Send + 'static,
    R: Send + 'static,
{
    let db = DB.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().unwrap();
        f(&conn)
    })
    .await
    .expect("spawn_blocking join failed")
}

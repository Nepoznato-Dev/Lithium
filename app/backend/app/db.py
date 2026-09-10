"""Lithium backend — SQLite persistence (stdlib only, no ORM)."""
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / 'lithium.db'

SCHEMA = """
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
"""

# Default model registry — mirrors the frontend provider lineup plus Ollama
# for local GGUF-class models.
DEFAULT_MODELS = [
    ('ollama-qwen3-0.6b', 'Qwen3 0.6B (Ollama, local)', 'ollama', 'qwen3:0.6b', 32768, 0.7, 1),
    ('openai-gpt-4o-mini', 'GPT-4o mini', 'openai', 'gpt-4o-mini', 128000, 0.7, 0),
    ('groq-llama-3.3-70b', 'Llama 3.3 70B (Groq)', 'groq', 'llama-3.3-70b-versatile', 128000, 0.7, 0),
    ('anthropic-claude-haiku', 'Claude 3.5 Haiku', 'anthropic', 'claude-3-5-haiku-latest', 200000, 0.7, 0),
    ('google-gemini-flash', 'Gemini 2.0 Flash', 'google', 'gemini-2.0-flash', 1048576, 0.7, 0),
    ('xai-grok-3-mini', 'Grok 3 mini', 'xai', 'grok-3-mini', 131072, 0.7, 0),
]


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init():
    """Create schema + seed the default model registry (idempotent)."""
    with connect() as conn:
        conn.executescript(SCHEMA)
        now = int(time.time() * 1000)
        for row in DEFAULT_MODELS:
            conn.execute(
                'INSERT OR IGNORE INTO models (id, name, provider, model_name, context_window, temperature, is_default, created_at)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (*row, now),
            )

//! lithium-compute — shared computation library for the Lithium server.
//!
//! Pure-Rust implementations of all computation-heavy functions previously
//! living in coreNative.js.  Uses serde_json for I/O so the same code can
//! be called from HTTP handlers or (optionally) WASM.

pub mod markdown;
pub mod browser;
pub mod ai_runtime;
pub mod agent;
pub mod notify;
pub mod memory;
pub mod models;
pub mod weather;
pub mod storage_calc;
pub mod chats;
pub mod api_catalog;
pub mod tar;
pub mod settings;
pub mod soloist;

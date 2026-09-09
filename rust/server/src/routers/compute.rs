//! Compute endpoints — dispatch to lithium-compute library functions.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use serde_json::Value;

pub async fn dispatch(Path(action): Path<String>, Json(body): Json<Value>) -> Result<Json<Value>, (StatusCode, String)> {
    let result = match action.as_str() {
        // Markdown
        "markdown/render" => {
            let source = body.get("source").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "html": lithium_compute::markdown::render(source) })
        }
        "markdown/render-enhanced" => {
            let source = body.get("source").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "html": lithium_compute::markdown::render_enhanced(source) })
        }
        "markdown/wiki-links" => {
            let source = body.get("source").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "html": lithium_compute::markdown::wiki_links(source) })
        }

        // Browser
        "browser/resolve-input" => {
            let input = body.get("input").and_then(|v| v.as_str()).unwrap_or("");
            let search_url = body.get("searchUrl").and_then(|v| v.as_str()).unwrap_or("https://duckduckgo.com/html/?q=");
            let (kind, url) = lithium_compute::browser::resolve_input(input, search_url);
            serde_json::json!({ "kind": kind, "url": url })
        }
        "browser/hostname" => {
            let url = body.get("url").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "hostname": lithium_compute::browser::hostname(url) })
        }
        "browser/proxy-url" => {
            let url = body.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let proxy_origin = body.get("proxyOrigin").and_then(|v| v.as_str()).unwrap_or("");
            let backend_url = body.get("backendUrl").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "result": lithium_compute::browser::to_proxy_url(url, proxy_origin, backend_url) })
        }
        "browser/stats" => {
            let stats_val = body.get("stats");
            let sub_action = body.get("action").and_then(|v| v.as_str()).unwrap_or("increment");
            match sub_action {
                "increment" => {
                    let stats: lithium_compute::browser::ShieldsStats = serde_json::from_value(stats_val.cloned().unwrap_or_default()).unwrap_or_default();
                    let ads = body.get("ads").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    let trackers = body.get("trackers").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    let https = body.get("https").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    let scripts = body.get("scripts").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                    let data = body.get("data").and_then(|v| v.as_u64()).unwrap_or(0);
                    let updated = lithium_compute::browser::stats_increment(&stats, ads, trackers, https, scripts, data);
                    serde_json::to_value(&updated).unwrap_or_default()
                }
                "daily-reset" => {
                    let stats: lithium_compute::browser::ShieldsStats = serde_json::from_value(stats_val.cloned().unwrap_or_default()).unwrap_or_default();
                    let now_ms = body.get("nowMs").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let updated = lithium_compute::browser::stats_daily_reset(&stats, now_ms);
                    serde_json::to_value(&updated).unwrap_or_default()
                }
                _ => return Err((StatusCode::BAD_REQUEST, "action must be 'increment' or 'daily-reset'".into()))
            }
        }
        "browser/format-stat" => {
            let n = body.get("n").and_then(|v| v.as_f64()).unwrap_or(0.0);
            serde_json::json!({ "formatted": lithium_compute::browser::format_stat_number(n) })
        }
        "browser/format-time-saved" => {
            let seconds = body.get("seconds").and_then(|v| v.as_f64()).unwrap_or(0.0);
            serde_json::json!({ "formatted": lithium_compute::browser::format_time_saved(seconds) })
        }
        "browser/bookmarks" => {
            let bookmarks_val = body.get("bookmarks");
            let bookmarks: Vec<lithium_compute::browser::Bookmark> = serde_json::from_value(bookmarks_val.cloned().unwrap_or_default()).unwrap_or_default();
            let sub_action = body.get("action").and_then(|v| v.as_str()).unwrap_or("tree");
            match sub_action {
                "tree" => serde_json::to_value(&lithium_compute::browser::bookmark_tree(&bookmarks)).unwrap_or_default(),
                "search" => {
                    let query = body.get("query").and_then(|v| v.as_str()).unwrap_or("");
                    serde_json::to_value(&lithium_compute::browser::bookmark_search(&bookmarks, query)).unwrap_or_default()
                }
                _ => return Err((StatusCode::BAD_REQUEST, "action must be 'tree' or 'search'".into()))
            }
        }
        "browser/history" => {
            let entries_val = body.get("entries");
            let entries: Vec<lithium_compute::browser::HistoryEntry> = serde_json::from_value(entries_val.cloned().unwrap_or_default()).unwrap_or_default();
            let sub_action = body.get("action").and_then(|v| v.as_str()).unwrap_or("group");
            match sub_action {
                "group" => {
                    let now_ms = body.get("nowMs").and_then(|v| v.as_f64()).unwrap_or_else(|| chrono_now_ms());
                    serde_json::to_value(&lithium_compute::browser::history_group(&entries, now_ms)).unwrap_or_default()
                }
                "search" => {
                    let query = body.get("query").and_then(|v| v.as_str()).unwrap_or("");
                    serde_json::to_value(&lithium_compute::browser::history_search(&entries, query)).unwrap_or_default()
                }
                _ => return Err((StatusCode::BAD_REQUEST, "action must be 'group' or 'search'".into()))
            }
        }
        "browser/omnibox" => {
            let query = body.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let history: Vec<lithium_compute::browser::HistoryEntry> = serde_json::from_value(body.get("history").cloned().unwrap_or_default()).unwrap_or_default();
            let bookmarks: Vec<lithium_compute::browser::Bookmark> = serde_json::from_value(body.get("bookmarks").cloned().unwrap_or_default()).unwrap_or_default();
            let top_sites: Vec<lithium_compute::browser::Bookmark> = serde_json::from_value(body.get("topSites").cloned().unwrap_or_default()).unwrap_or_default();
            serde_json::to_value(&lithium_compute::browser::omnibox_rank(query, &history, &bookmarks, &top_sites)).unwrap_or_default()
        }
        "browser/sanitize" => {
            let html = body.get("html").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "html": lithium_compute::browser::sanitize_html(html) })
        }

        // AI Runtime
        "ai/prepare-messages" => {
            let messages: Vec<lithium_compute::ai_runtime::Message> = serde_json::from_value(body.get("messages").cloned().unwrap_or_default()).unwrap_or_default();
            let model = body.get("model").and_then(|v| v.as_str()).unwrap_or("");
            let no_think = body.get("noThink").and_then(|v| v.as_bool()).unwrap_or(false);
            let thinking = body.get("thinking").and_then(|v| v.as_bool()).unwrap_or(false);
            serde_json::to_value(&lithium_compute::ai_runtime::prepare_messages(&messages, model, no_think, thinking)).unwrap_or_default()
        }
        "ai/estimate-tokens" => {
            if let Some(text) = body.get("text").and_then(|v| v.as_str()) {
                serde_json::json!({ "tokens": lithium_compute::ai_runtime::estimate_tokens_for_text(text) })
            } else {
                let messages: Vec<lithium_compute::ai_runtime::Message> = serde_json::from_value(body.get("messages").cloned().unwrap_or_default()).unwrap_or_default();
                serde_json::json!({ "tokens": lithium_compute::ai_runtime::estimate_messages_tokens(&messages) })
            }
        }
        "ai/trim-context" => {
            let messages: Vec<lithium_compute::ai_runtime::Message> = serde_json::from_value(body.get("messages").cloned().unwrap_or_default()).unwrap_or_default();
            let max_tokens = body.get("maxTokens").and_then(|v| v.as_u64()).unwrap_or(8192) as usize;
            serde_json::to_value(&lithium_compute::ai_runtime::trim_messages_to_context(&messages, max_tokens)).unwrap_or_default()
        }
        "ai/resolve-model" => {
            let tier = body.get("tier").and_then(|v| v.as_str()).unwrap_or("");
            let tiers: Vec<lithium_compute::ai_runtime::Tier> = serde_json::from_value(body.get("tiers").cloned().unwrap_or_default()).unwrap_or_default();
            let downloaded = body.get("downloaded").cloned().unwrap_or(Value::Null);
            serde_json::json!({ "model": lithium_compute::ai_runtime::resolve_model(tier, &tiers, &downloaded) })
        }

        // Agent
        "agent/extract-api" => {
            let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::to_value(&lithium_compute::agent::extract_api_calls(content)).unwrap_or_default()
        }
        "agent/extract-widgets" => {
            let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::to_value(&lithium_compute::agent::extract_widget_blocks(content)).unwrap_or_default()
        }
        "agent/strip-tools" => {
            let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "result": lithium_compute::agent::strip_tool_blocks(content) })
        }

        // Notify — functions take JSON string, not Vec<Notification>
        "notify/filter" => {
            let json_str = body.get("notifications").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
            let cutoff_ms = body.get("cutoffMs").and_then(|v| v.as_f64()).unwrap_or(0.0);
            match lithium_compute::notify::filter(&json_str, cutoff_ms) {
                Some(filtered) => serde_json::to_value(&filtered).unwrap_or_default(),
                None => serde_json::json!([]),
            }
        }
        "notify/mark-all-read" => {
            let json_str = body.get("notifications").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
            match lithium_compute::notify::mark_all_read(&json_str) {
                Some(updated) => serde_json::to_value(&updated).unwrap_or_default(),
                None => serde_json::json!([]),
            }
        }
        "notify/unread-count" => {
            let json_str = body.get("notifications").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
            serde_json::json!({ "count": lithium_compute::notify::unread_count(&json_str) })
        }

        // Weather
        "weather/report" => {
            let data: lithium_compute::weather::WeatherData = match serde_json::from_value(body.clone()) {
                Ok(d) => d,
                Err(_) => return Err((StatusCode::BAD_REQUEST, "invalid weather data".into())),
            };
            serde_json::json!({ "report": lithium_compute::weather::report(&data) })
        }
        "weather/description" => {
            let code = body.get("code").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            serde_json::json!({ "description": lithium_compute::weather::description(code) })
        }
        "weather/emoji" => {
            let code = body.get("code").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let is_day = body.get("isDay").and_then(|v| v.as_bool()).unwrap_or(true);
            serde_json::json!({ "emoji": lithium_compute::weather::emoji(code, is_day) })
        }

        // Storage
        "storage/summary" => {
            let snapshot: lithium_compute::storage_calc::Snapshot = match serde_json::from_value(body.clone()) {
                Ok(s) => s,
                Err(_) => return Err((StatusCode::BAD_REQUEST, "invalid snapshot data".into())),
            };
            serde_json::to_value(&lithium_compute::storage_calc::summary(&snapshot)).unwrap_or_default()
        }
        "storage/format-bytes" => {
            let bytes = body.get("bytes").and_then(|v| v.as_u64()).unwrap_or(0);
            serde_json::json!({ "formatted": lithium_compute::storage_calc::format_bytes_str(bytes) })
        }

        // Chats
        "chats/upsert" => {
            let chats: Vec<lithium_compute::chats::Chat> = serde_json::from_value(body.get("chats").cloned().unwrap_or_default()).unwrap_or_default();
            let chat: lithium_compute::chats::Chat = match serde_json::from_value(body.get("chat").cloned().unwrap_or_default()) {
                Ok(c) => c,
                Err(_) => return Err((StatusCode::BAD_REQUEST, "invalid chat data".into())),
            };
            let now = body.get("now").and_then(|v| v.as_u64()).unwrap_or(0);
            serde_json::to_value(&lithium_compute::chats::upsert(&chats, &chat, now)).unwrap_or_default()
        }
        "chats/delete" => {
            let chats: Vec<lithium_compute::chats::Chat> = serde_json::from_value(body.get("chats").cloned().unwrap_or_default()).unwrap_or_default();
            let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::to_value(&lithium_compute::chats::delete(&chats, id)).unwrap_or_default()
        }
        "chats/trim" => {
            let chats: Vec<lithium_compute::chats::Chat> = serde_json::from_value(body.get("chats").cloned().unwrap_or_default()).unwrap_or_default();
            serde_json::to_value(&lithium_compute::chats::trim(&chats)).unwrap_or_default()
        }

        // Models (compute)
        "models/search" => {
            let models: Vec<lithium_compute::models::Model> = serde_json::from_value(body.get("models").cloned().unwrap_or_default()).unwrap_or_default();
            let query = body.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let tier = body.get("tier").and_then(|v| v.as_str()).unwrap_or("");
            let results = lithium_compute::models::model_search(&models, query, tier);
            serde_json::to_value(&results).unwrap_or_default()
        }
        "models/slugify" => {
            let text = body.get("text").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({ "slug": lithium_compute::models::model_slugify(text) })
        }
        "models/parse-hf-url" => {
            let url = body.get("url").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::to_value(&lithium_compute::models::model_parse_hf_url(url)).unwrap_or_default()
        }

        // Settings
        "settings/defaults" => {
            lithium_compute::settings::defaults()
        }
        "settings/merge" => {
            let stored = body.get("stored");
            lithium_compute::settings::merge(stored)
        }
        "settings/set-at-path" => {
            let settings = body.get("settings").cloned().unwrap_or_default();
            let path = body.get("path").and_then(|v| v.as_str()).unwrap_or("");
            let value = body.get("value").cloned().unwrap_or(Value::Null);
            lithium_compute::settings::set_at_path(&settings, path, value)
        }

        // Soloist
        "soloist/entity-info" => {
            let item: Option<lithium_compute::soloist::Item> = serde_json::from_value(body.get("item").cloned().unwrap_or_default()).ok();
            serde_json::to_value(&lithium_compute::soloist::entity_info(item.as_ref())).unwrap_or_default()
        }
        "soloist/position" => {
            let anchor: Option<lithium_compute::soloist::Anchor> = serde_json::from_value(body.get("anchor").cloned().unwrap_or_default()).ok();
            let status = body.get("status").and_then(|v| v.as_str()).unwrap_or("");
            let now = body.get("now").and_then(|v| v.as_u64());
            serde_json::json!({ "position": lithium_compute::soloist::position(anchor.as_ref(), status, now) })
        }

        // Memory (compute)
        "memory/write" => {
            let memory: lithium_compute::memory::Memory = serde_json::from_value(body.get("memory").cloned().unwrap_or_default()).unwrap_or_default();
            let key = body.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = body.get("value").and_then(|v| v.as_str()).unwrap_or("");
            let now = body.get("now").and_then(|v| v.as_f64()).unwrap_or(0.0);
            serde_json::to_value(&lithium_compute::memory::write(&memory, key, value, now)).unwrap_or_default()
        }
        "memory/dump" => {
            let memory: lithium_compute::memory::Memory = serde_json::from_value(body.get("memory").cloned().unwrap_or_default()).unwrap_or_default();
            let max = body.get("maxEntries").and_then(|v| v.as_u64()).unwrap_or(40) as usize;
            serde_json::json!({ "text": lithium_compute::memory::dump(&memory, max) })
        }

        // API Catalog
        "api/catalog" => {
            serde_json::to_value(&lithium_compute::api_catalog::catalog()).unwrap_or_default()
        }
        "api/validate" => {
            let req: lithium_compute::api_catalog::ValidateRequest = match serde_json::from_value(body.clone()) {
                Ok(r) => r,
                Err(_) => return Err((StatusCode::BAD_REQUEST, "invalid validate request".into())),
            };
            match lithium_compute::api_catalog::validate(&req) {
                Ok(ok) => serde_json::to_value(&ok).unwrap_or_default(),
                Err(err) => serde_json::to_value(&err).unwrap_or_default(),
            }
        }

        // TAR
        "tar/parse" => {
            let data_b64 = body.get("data").and_then(|v| v.as_str()).unwrap_or("");
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD.decode(data_b64).unwrap_or_default();
            serde_json::to_value(&lithium_compute::tar::parse(&bytes)).unwrap_or_default()
        }

        _ => return Err((StatusCode::NOT_FOUND, format!("unknown compute action '{}'", action))),
    };
    Ok(Json(result))
}

/// Helper: current time in milliseconds (for history grouping when client doesn't supply it).
fn chrono_now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

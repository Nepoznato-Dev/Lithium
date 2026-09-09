//! API catalog, validation, and audit log.
//! Ported from coreNative.js lines 283-386.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone)]
pub struct ParamSpec {
    pub name: String,
    pub r#type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ApiSpec {
    pub api: String,
    pub ns: String,
    pub desc: String,
    pub callers: Vec<String>,
    pub params: Vec<ParamSpec>,
}

fn build_catalog() -> Vec<ApiSpec> {
    serde_json::from_value(serde_json::json!([
        { "api": "system.get_info", "ns": "system", "desc": "Build version, time and platform details", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "system.open_start_menu", "ns": "system", "desc": "Open the Start menu", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "system.close_start_menu", "ns": "system", "desc": "Close the Start menu", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "system.show_desktop", "ns": "system", "desc": "Minimize every open window", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "system.get_volume", "ns": "system", "desc": "Current taskbar volume level", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "system.set_volume", "ns": "system", "desc": "Set the taskbar volume level", "callers": ["system","user","widget","model"], "params": [{"name":"level","type":"number","required":true,"min":0,"max":100}] },
        { "api": "system.notify", "ns": "system", "desc": "Show a desktop toast notification", "callers": ["system","user","widget","model"], "params": [{"name":"title","type":"string","required":true},{"name":"body","type":"string","required":false},{"name":"tone","type":"string","required":false,"values":["info","success","warning","error"]}] },
        { "api": "apps.list", "ns": "apps", "desc": "List every registered desktop app", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "apps.open", "ns": "apps", "desc": "Open (or focus) a desktop app window", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true}] },
        { "api": "apps.close", "ns": "apps", "desc": "Close a desktop app window", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true}] },
        { "api": "apps.focus", "ns": "apps", "desc": "Bring an app window to the front", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true}] },
        { "api": "settings.get", "ns": "settings", "desc": "Read one setting (or all) by dotted path", "callers": ["system","user","widget","model"], "params": [{"name":"path","type":"string","required":false}] },
        { "api": "settings.set", "ns": "settings", "desc": "Change a setting by dotted path", "callers": ["system","user","widget","model"], "params": [{"name":"path","type":"string","required":true},{"name":"value","type":"any","required":true}] },
        { "api": "fs.list", "ns": "fs", "desc": "List entries of a virtual-FS folder", "callers": ["system","user","widget","model"], "params": [{"name":"folder","type":"string","required":false}] },
        { "api": "fs.read", "ns": "fs", "desc": "Read a text file content by id", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true}] },
        { "api": "fs.write", "ns": "fs", "desc": "Create or overwrite a text file", "callers": ["system","user","widget","model"], "params": [{"name":"name","type":"string","required":true},{"name":"parent","type":"string","required":false},{"name":"content","type":"string","required":false}] },
        { "api": "fs.create_folder", "ns": "fs", "desc": "Create a folder in the virtual FS", "callers": ["system","user","widget","model"], "params": [{"name":"name","type":"string","required":true},{"name":"parent","type":"string","required":false}] },
        { "api": "fs.delete", "ns": "fs", "desc": "Delete an entry (recursive for folders)", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true}] },
        { "api": "fs.tree", "ns": "fs", "desc": "Recursive overview of a folder", "callers": ["system","user","widget","model"], "params": [{"name":"folder","type":"string","required":false}] },
        { "api": "fs.append", "ns": "fs", "desc": "Append text to a file", "callers": ["system","user","widget","model"], "params": [{"name":"name","type":"string","required":true},{"name":"parent","type":"string","required":false},{"name":"content","type":"string","required":false}] },
        { "api": "fs.move", "ns": "fs", "desc": "Move an entry into another folder", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true},{"name":"parent","type":"string","required":true}] },
        { "api": "fs.rename", "ns": "fs", "desc": "Rename an entry", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true},{"name":"name","type":"string","required":true}] },
        { "api": "weather.get", "ns": "weather", "desc": "Cached local weather", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "ai.list_providers", "ns": "ai", "desc": "Configured AI providers", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "ai.get_tier", "ns": "ai", "desc": "Active on-device inference tier", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "ai.set_tier", "ns": "ai", "desc": "Switch the on-device inference tier", "callers": ["system","user","widget","model"], "params": [{"name":"tier","type":"string","required":true,"values":["lite","efficient","performance","ultra"]}] },
        { "api": "models.list", "ns": "models", "desc": "Model catalog with download status", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "cloud.list_drives", "ns": "cloud", "desc": "Connected external cloud drives", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "cloud.test_drive", "ns": "cloud", "desc": "Test a cloud drive credentials", "callers": ["system","user","widget","model"], "params": [{"name":"id","type":"string","required":true}] },
        { "api": "memory.list", "ns": "memory", "desc": "All memory keys with timestamps", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "memory.read", "ns": "memory", "desc": "Read one memory entry by key", "callers": ["system","user","widget","model"], "params": [{"name":"key","type":"string","required":true}] },
        { "api": "memory.write", "ns": "memory", "desc": "Store a memory entry", "callers": ["system","user","widget","model"], "params": [{"name":"key","type":"string","required":true},{"name":"value","type":"string","required":true}] },
        { "api": "memory.delete", "ns": "memory", "desc": "Delete a memory entry", "callers": ["system","user","widget","model"], "params": [{"name":"key","type":"string","required":true}] },
        { "api": "widgets.list", "ns": "widgets", "desc": "User widgets with enabled state", "callers": ["system","user","widget","model"], "params": [] },
        { "api": "widgets.set_enabled", "ns": "widgets", "desc": "Enable or disable a widget", "callers": ["system","user","model"], "params": [{"name":"id","type":"string","required":true},{"name":"enabled","type":"boolean","required":true}] }
    ])).unwrap()
}

pub fn catalog() -> Vec<ApiSpec> { build_catalog() }

// Settings schema for validation
struct SettingsSchemaEntry { path: &'static str, kind: &'static str, values: Option<&'static [&'static str]>, min: Option<f64>, max: Option<f64> }

fn settings_schema() -> Vec<SettingsSchemaEntry> {
    vec![
        SettingsSchemaEntry { path: "profile.username", kind: "string", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "theme.accent", kind: "string", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "theme.contrast", kind: "string", values: Some(&["normal","high"]), min: None, max: None },
        SettingsSchemaEntry { path: "theme.appTint", kind: "boolean", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "theme.transparency", kind: "boolean", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "layout.density", kind: "string", values: Some(&["compact","default","large"]), min: None, max: None },
        SettingsSchemaEntry { path: "motion.animations", kind: "string", values: Some(&["full","reduced","off"]), min: None, max: None },
        SettingsSchemaEntry { path: "background.enabled", kind: "boolean", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "background.intensity", kind: "number", values: None, min: Some(0.0), max: Some(1.0) },
        SettingsSchemaEntry { path: "performance.lowEndMode", kind: "boolean", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "games.fullscreenOnLaunch", kind: "boolean", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "games.escToClose", kind: "boolean", values: None, min: None, max: None },
        SettingsSchemaEntry { path: "browser.searchEngine", kind: "string", values: Some(&["duckduckgo","qwant","mojeek","startpage"]), min: None, max: None },
    ]
}

fn type_match(value: &Value, kind: &str) -> bool {
    match kind {
        "any" => true,
        "string" => value.is_string(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        _ => true,
    }
}

#[derive(Deserialize)]
pub struct ValidateRequest {
    #[serde(default)]
    pub api: String,
    #[serde(default)]
    pub caller: String,
    #[serde(default)]
    pub params: serde_json::Map<String, Value>,
}

#[derive(Serialize)]
pub struct ValidateOk {
    pub ok: bool,
    pub api: String,
    pub ns: String,
    pub caller: String,
    pub params: serde_json::Map<String, Value>,
}

#[derive(Serialize)]
pub struct ValidateErr {
    pub ok: bool,
    pub error: String,
}

pub type ValidateResult = Result<ValidateOk, ValidateErr>;

pub fn validate(req: &ValidateRequest) -> ValidateResult {
    let caller = if req.caller.is_empty() { "user" } else { &req.caller };
    let catalog = build_catalog();
    let spec = catalog.iter().find(|s| s.api == req.api)
        .ok_or_else(|| ValidateErr { ok: false, error: format!("unknown api '{}'", req.api) })?;
    if !spec.callers.contains(&caller.to_string()) {
        return Err(ValidateErr { ok: false, error: format!("caller '{}' is not allowed to use {}", caller, req.api) });
    }
    let mut out_params = serde_json::Map::new();
    for p in &spec.params {
        if let Some(val) = req.params.get(&p.name) {
            if !type_match(val, &p.r#type) {
                return Err(ValidateErr { ok: false, error: format!("parameter '{}' must be {}", p.name, p.r#type) });
            }
            if let Some(ref vals) = p.values {
                if val.is_string() {
                    let s = val.as_str().unwrap();
                    if !vals.iter().any(|v| v == &s) {
                        return Err(ValidateErr { ok: false, error: format!("parameter '{}' must be one of: {}", p.name, vals.join(", ")) });
                    }
                }
            }
            if p.r#type == "number" && val.is_number() {
                let n = val.as_f64().unwrap_or(0.0);
                if n < p.min.unwrap_or(f64::NEG_INFINITY) || n > p.max.unwrap_or(f64::INFINITY) {
                    return Err(ValidateErr { ok: false, error: format!("parameter '{}' out of range", p.name) });
                }
            }
            out_params.insert(p.name.clone(), val.clone());
        } else if p.required {
            return Err(ValidateErr { ok: false, error: format!("missing required parameter '{}'", p.name) });
        }
    }
    // Special handling for settings.set
    if req.api == "settings.set" {
        if let Some(path_val) = out_params.get("path").and_then(|v| v.as_str()) {
            let schema = settings_schema();
            let entry = schema.iter().find(|s| s.path == path_val)
                .ok_or_else(|| ValidateErr { ok: false, error: format!("unknown settings path '{}'", path_val) })?;
            if let Some(val) = out_params.get("value") {
                if !type_match(val, entry.kind) {
                    return Err(ValidateErr { ok: false, error: format!("setting '{}' expects {}", path_val, entry.kind) });
                }
                if let Some(ref vals) = entry.values {
                    if val.is_string() {
                        let s = val.as_str().unwrap();
                        if !vals.iter().any(|v| v == &s) {
                            return Err(ValidateErr { ok: false, error: format!("setting '{}' must be one of: {}", path_val, vals.join(", ")) });
                        }
                    }
                }
                if entry.kind == "number" && val.is_number() {
                    let n = val.as_f64().unwrap_or(0.0);
                    if n < entry.min.unwrap_or(f64::NEG_INFINITY) || n > entry.max.unwrap_or(f64::INFINITY) {
                        return Err(ValidateErr { ok: false, error: format!("setting '{}' out of range", path_val) });
                    }
                }
            }
        }
    }
    Ok(ValidateOk { ok: true, api: spec.api.clone(), ns: spec.ns.clone(), caller: caller.to_string(), params: out_params })
}

#[derive(Serialize, Clone)]
pub struct AuditEntry {
    pub t: u64,
    pub api: String,
    pub caller: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn audit_append(log: &[AuditEntry], api: &str, caller: &str, ok: bool, error: Option<&str>, now: u64, cap: usize) -> Vec<AuditEntry> {
    let entry = AuditEntry { t: now, api: api.to_string(), caller: caller.to_string(), ok, error: error.map(|s| s.to_string()) };
    let limit = cap.min(log.len() + 1);
    let mut result = vec![entry];
    result.extend(log.iter().take(limit - 1).cloned());
    result
}

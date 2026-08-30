//! Lithium API manager core — catalog, permission and validation engine.
//!
//! Pure and stateless: JS sends `{"api","params","caller"}` and gets back
//! either a normalized, validated dispatch descriptor or a typed error.
//! Execution itself happens in the JS bridge (wasm can't touch the DOM).
//!
//! Caller classes: "system" (desktop internals), "user" (direct UI),
//! "widget" (user-authored widgets), "model" (AI tool calls).

use crate::{get, json_escape, write_json, Parser, Value};

/* ---------- Catalog data ---------- */

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Str,
    Num,
    Bool,
    Any,
}

struct Param {
    name: &'static str,
    kind: Kind,
    required: bool,
    values: &'static [&'static str], // enum constraint (empty = none)
    min: f64,                        // numeric bounds (f64::MIN/MAX = none)
    max: f64,
}

const fn p_str(name: &'static str, required: bool) -> Param {
    Param { name, kind: Kind::Str, required, values: &[], min: f64::MIN, max: f64::MAX }
}

const fn p_str_enum(name: &'static str, required: bool, values: &'static [&'static str]) -> Param {
    Param { name, kind: Kind::Str, required, values, min: f64::MIN, max: f64::MAX }
}

const fn p_num(name: &'static str, required: bool, min: f64, max: f64) -> Param {
    Param { name, kind: Kind::Num, required, values: &[], min, max }
}

const fn p_bool(name: &'static str, required: bool) -> Param {
    Param { name, kind: Kind::Bool, required, values: &[], min: f64::MIN, max: f64::MAX }
}

const fn p_any(name: &'static str, required: bool) -> Param {
    Param { name, kind: Kind::Any, required, values: &[], min: f64::MIN, max: f64::MAX }
}

struct ApiSpec {
    api: &'static str,
    ns: &'static str,
    desc: &'static str,
    callers: &'static [&'static str],
    params: &'static [Param],
}

const ALL: &[&str] = &["system", "user", "widget", "model"];
const AUTOMATIONS: &[&str] = &["system", "user", "widget", "model"];

static CATALOG: &[ApiSpec] = &[
    // ---- system ----
    ApiSpec { api: "system.get_info", ns: "system", desc: "Build version, time and platform details", callers: ALL, params: &[] },
    ApiSpec { api: "system.open_start_menu", ns: "system", desc: "Open the Start menu", callers: AUTOMATIONS, params: &[] },
    ApiSpec { api: "system.close_start_menu", ns: "system", desc: "Close the Start menu", callers: AUTOMATIONS, params: &[] },
    ApiSpec { api: "system.show_desktop", ns: "system", desc: "Minimize every open window", callers: AUTOMATIONS, params: &[] },
    ApiSpec { api: "system.get_volume", ns: "system", desc: "Current taskbar volume level", callers: ALL, params: &[] },
    ApiSpec { api: "system.set_volume", ns: "system", desc: "Set the taskbar volume level", callers: AUTOMATIONS, params: &[p_num("level", true, 0.0, 100.0)] },
    ApiSpec { api: "system.notify", ns: "system", desc: "Show a desktop toast notification", callers: AUTOMATIONS, params: &[
        p_str("title", true),
        p_str("body", false),
        p_str_enum("tone", false, &["info", "success", "warning", "error"]),
    ] },
    // ---- apps ----
    ApiSpec { api: "apps.list", ns: "apps", desc: "List every registered desktop app", callers: ALL, params: &[] },
    ApiSpec { api: "apps.open", ns: "apps", desc: "Open (or focus) a desktop app window", callers: AUTOMATIONS, params: &[p_str("id", true)] },
    ApiSpec { api: "apps.close", ns: "apps", desc: "Close a desktop app window", callers: AUTOMATIONS, params: &[p_str("id", true)] },
    ApiSpec { api: "apps.focus", ns: "apps", desc: "Bring an app window to the front", callers: AUTOMATIONS, params: &[p_str("id", true)] },
    // ---- settings ----
    ApiSpec { api: "settings.get", ns: "settings", desc: "Read one setting (or all) by dotted path", callers: ALL, params: &[p_str("path", false)] },
    ApiSpec { api: "settings.set", ns: "settings", desc: "Change a setting by dotted path (schema-validated)", callers: AUTOMATIONS, params: &[
        p_str("path", true),
        p_any("value", true),
    ] },
    // ---- fs ----
    ApiSpec { api: "fs.list", ns: "fs", desc: "List entries of a virtual-FS folder", callers: ALL, params: &[p_str("folder", false)] },
    ApiSpec { api: "fs.read", ns: "fs", desc: "Read a text file's content by id", callers: ALL, params: &[p_str("id", true)] },
    ApiSpec { api: "fs.write", ns: "fs", desc: "Create or overwrite a text file", callers: AUTOMATIONS, params: &[
        p_str("name", true),
        p_str("parent", false),
        p_str("content", false),
    ] },
    ApiSpec { api: "fs.create_folder", ns: "fs", desc: "Create a folder in the virtual FS", callers: AUTOMATIONS, params: &[
        p_str("name", true),
        p_str("parent", false),
    ] },
    ApiSpec { api: "fs.delete", ns: "fs", desc: "Delete an entry (recursive for folders)", callers: AUTOMATIONS, params: &[p_str("id", true)] },
    ApiSpec { api: "fs.tree", ns: "fs", desc: "Recursive overview of a folder (paths, types, sizes)", callers: ALL, params: &[p_str("folder", false)] },
    ApiSpec { api: "fs.append", ns: "fs", desc: "Append text to a file (creates it when missing)", callers: AUTOMATIONS, params: &[p_str("name", true), p_str("parent", false), p_str("content", false)] },
    ApiSpec { api: "fs.move", ns: "fs", desc: "Move an entry into another folder", callers: AUTOMATIONS, params: &[p_str("id", true), p_str("parent", true)] },
    ApiSpec { api: "fs.rename", ns: "fs", desc: "Rename an entry", callers: AUTOMATIONS, params: &[p_str("id", true), p_str("name", true)] },
    // ---- weather ----
    ApiSpec { api: "weather.get", ns: "weather", desc: "Cached local weather (taskbar widget data)", callers: ALL, params: &[] },
    // ---- ai / models ----
    ApiSpec { api: "ai.list_providers", ns: "ai", desc: "Configured AI providers and whether keys exist", callers: ALL, params: &[] },
    ApiSpec { api: "ai.get_tier", ns: "ai", desc: "Active on-device inference tier", callers: ALL, params: &[] },
    ApiSpec { api: "ai.set_tier", ns: "ai", desc: "Switch the on-device inference tier", callers: AUTOMATIONS, params: &[
        p_str_enum("tier", true, &["lite", "efficient", "performance", "ultra"]),
    ] },
    ApiSpec { api: "models.list", ns: "models", desc: "Model catalog with download status", callers: ALL, params: &[] },
    // ---- cloud (external) ----
    ApiSpec { api: "cloud.list_drives", ns: "cloud", desc: "Connected external cloud drives", callers: ALL, params: &[] },
    ApiSpec { api: "cloud.test_drive", ns: "cloud", desc: "Test a cloud drive's credentials", callers: AUTOMATIONS, params: &[p_str("id", true)] },
    // ---- memory (persistent model memory) ----
    ApiSpec { api: "memory.list", ns: "memory", desc: "All memory keys with timestamps", callers: ALL, params: &[] },
    ApiSpec { api: "memory.read", ns: "memory", desc: "Read one memory entry by key", callers: ALL, params: &[p_str("key", true)] },
    ApiSpec { api: "memory.write", ns: "memory", desc: "Store/overwrite a memory entry (short key, concise value)", callers: AUTOMATIONS, params: &[p_str("key", true), p_str("value", true)] },
    ApiSpec { api: "memory.delete", ns: "memory", desc: "Delete a memory entry", callers: AUTOMATIONS, params: &[p_str("key", true)] },
    // ---- widgets ----
    ApiSpec { api: "widgets.list", ns: "widgets", desc: "User widgets with enabled state", callers: ALL, params: &[] },
    ApiSpec { api: "widgets.set_enabled", ns: "widgets", desc: "Enable or disable a widget", callers: &["system", "user", "model"], params: &[
        p_str("id", true),
        p_bool("enabled", true),
    ] },
];

/* ---------- Settings schema (settings.set validation) ---------- */

struct SettingSpec {
    path: &'static str,
    kind: Kind,
    values: &'static [&'static str],
    min: f64,
    max: f64,
}

static SETTINGS_SCHEMA: &[SettingSpec] = &[
    SettingSpec { path: "profile.username", kind: Kind::Str, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "theme.accent", kind: Kind::Str, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "theme.contrast", kind: Kind::Str, values: &["normal", "high"], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "theme.appTint", kind: Kind::Bool, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "theme.transparency", kind: Kind::Bool, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "layout.density", kind: Kind::Str, values: &["compact", "default", "large"], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "motion.animations", kind: Kind::Str, values: &["full", "reduced", "off"], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "background.enabled", kind: Kind::Bool, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "background.intensity", kind: Kind::Num, values: &[], min: 0.0, max: 1.0 },
    SettingSpec { path: "performance.lowEndMode", kind: Kind::Bool, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "games.fullscreenOnLaunch", kind: Kind::Bool, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "games.escToClose", kind: Kind::Bool, values: &[], min: f64::MIN, max: f64::MAX },
    SettingSpec { path: "browser.searchEngine", kind: Kind::Str, values: &["duckduckgo", "qwant", "mojeek", "startpage"], min: f64::MIN, max: f64::MAX },
];

/* ---------- Helpers ---------- */

fn kind_name(kind: Kind) -> &'static str {
    match kind {
        Kind::Str => "string",
        Kind::Num => "number",
        Kind::Bool => "boolean",
        Kind::Any => "any",
    }
}

fn value_matches(v: &Value, kind: Kind) -> bool {
    match kind {
        Kind::Str => matches!(v, Value::Str(_)),
        Kind::Num => matches!(v, Value::Num(_)),
        Kind::Bool => matches!(v, Value::Bool(_)),
        Kind::Any => true,
    }
}

fn err(reason: &str) -> Option<String> {
    Some(format!("{{\"ok\":false,\"error\":\"{}\"}}", json_escape(reason)))
}

/* ---------- Public entry points ---------- */

/// Full API catalog as a JSON array (docs, UI browser, AI tool prompts).
pub fn catalog() -> String {
    let mut parts: Vec<String> = Vec::with_capacity(CATALOG.len());
    for spec in CATALOG {
        let callers: Vec<String> = spec.callers.iter().map(|c| format!("\"{}\"", c)).collect();
        let params: Vec<String> = spec
            .params
            .iter()
            .map(|p| {
                let mut s = format!(
                    "{{\"name\":\"{}\",\"type\":\"{}\",\"required\":{}",
                    p.name,
                    kind_name(p.kind),
                    p.required
                );
                if !p.values.is_empty() {
                    let vals: Vec<String> = p.values.iter().map(|v| format!("\"{}\"", v)).collect();
                    s.push_str(&format!(",\"values\":[{}]", vals.join(",")));
                }
                if p.kind == Kind::Num && (p.min != f64::MIN || p.max != f64::MAX) {
                    s.push_str(&format!(",\"min\":{},\"max\":{}", crate::num_json(p.min), crate::num_json(p.max)));
                }
                s.push('}');
                s
            })
            .collect();
        parts.push(format!(
            "{{\"api\":\"{}\",\"ns\":\"{}\",\"desc\":\"{}\",\"callers\":[{}],\"params\":[{}]}}",
            spec.api,
            spec.ns,
            json_escape(spec.desc),
            callers.join(","),
            params.join(",")
        ));
    }
    format!("[{}]", parts.join(","))
}

/// Validate a call request. Returns {"ok":true,...} or {"ok":false,"error":...}.
pub fn validate(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return err("request must be an object") };

    let str_field = |key: &str| -> Option<String> {
        get(&req, key).and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
    };

    let api = str_field("api").unwrap_or_default();
    let caller = str_field("caller").unwrap_or_else(|| "user".into());
    let params_obj: &[(String, Value)] = match get(&req, "params") {
        Some(Value::Obj(o)) => o,
        Some(_) => return err("params must be an object"),
        None => &[],
    };

    let spec = match CATALOG.iter().find(|s| s.api == api) {
        Some(s) => s,
        None => return err(&format!("unknown api '{}'", api)),
    };
    if !spec.callers.contains(&caller.as_str()) {
        return err(&format!("caller '{}' is not allowed to use {}", caller, api));
    }

    // Validate + normalize parameters (unknown keys are stripped).
    let mut out_params: Vec<(String, Value)> = Vec::new();
    for p in spec.params {
        let value = params_obj.iter().find(|(k, _)| k == p.name).map(|(_, v)| v);
        match value {
            Some(v) => {
                if !value_matches(v, p.kind) {
                    return err(&format!("parameter '{}' must be {}", p.name, kind_name(p.kind)));
                }
                if let Value::Str(s) = v {
                    if !p.values.is_empty() && !p.values.contains(&s.as_str()) {
                        return err(&format!("parameter '{}' must be one of: {}", p.name, p.values.join(", ")));
                    }
                }
                if let Value::Num(n) = v {
                    if *n < p.min || *n > p.max {
                        return err(&format!("parameter '{}' out of range", p.name));
                    }
                }
                out_params.push((p.name.to_string(), v.clone()));
            }
            None if p.required => return err(&format!("missing required parameter '{}'", p.name)),
            None => {}
        }
    }

    // settings.set: enforce the settings schema on path + value.
    if api == "settings.set" {
        let path = out_params.iter().find(|(k, _)| k == "path").and_then(|(_, v)| match v { Value::Str(s) => Some(s.clone()), _ => None })?;
        let schema = match SETTINGS_SCHEMA.iter().find(|s| s.path == path) {
            Some(s) => s,
            None => return err(&format!("unknown settings path '{}'", path)),
        };
        let value = out_params.iter().find(|(k, _)| k == "value").map(|(_, v)| v)?;
        if !value_matches(value, schema.kind) {
            return err(&format!("setting '{}' expects {}", path, kind_name(schema.kind)));
        }
        if let Value::Str(s) = value {
            if !schema.values.is_empty() && !schema.values.contains(&s.as_str()) {
                return err(&format!("setting '{}' must be one of: {}", path, schema.values.join(", ")));
            }
        }
        if let Value::Num(n) = value {
            if *n < schema.min || *n > schema.max {
                return err(&format!("setting '{}' out of range", path));
            }
        }
    }

    let mut out = String::from("{\"ok\":true,\"api\":\"");
    out.push_str(spec.api);
    out.push_str("\",\"ns\":\"");
    out.push_str(spec.ns);
    out.push_str("\",\"caller\":\"");
    out.push_str(&json_escape(&caller));
    out.push_str("\",\"params\":");
    write_json(&Value::Obj(out_params), &mut out);
    out.push('}');
    Some(out)
}

/* ---------- Audit log ---------- */

/// Prepend a new audit entry and cap the list.
/// Input: {"log": [...], "api": "...", "caller": "...", "ok": true, "error": "...", "now": 123, "cap": 200}
pub fn audit_append(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(req) = root else { return None };

    let str_field = |key: &str| -> String {
        get(&req, key)
            .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
            .unwrap_or("")
            .to_string()
    };
    let api = str_field("api");
    let caller = str_field("caller");
    let error = str_field("error");
    let ok = get(&req, "ok").map(|v| matches!(v, Value::Bool(true))).unwrap_or(false);
    let now = get(&req, "now").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
    let cap = get(&req, "cap").and_then(|v| match v { Value::Num(n) => Some(*n as usize), _ => None }).unwrap_or(200);

    let empty_log: Vec<Value> = Vec::new();
    let existing = match get(&req, "log") {
        Some(Value::Arr(items)) => items,
        _ => &empty_log,
    };

    // Build new entry
    let mut entry = String::from("{");
    entry.push_str(&format!("\"t\":{}", crate::num_json(now)));
    entry.push_str(&format!(",\"api\":\"{}\"", json_escape(&api)));
    entry.push_str(&format!(",\"caller\":\"{}\"", json_escape(&caller)));
    entry.push_str(&format!(",\"ok\":{}", ok));
    if !error.is_empty() {
        entry.push_str(&format!(",\"error\":\"{}\"", json_escape(&error)));
    }
    entry.push('}');

    // Prepend new entry + existing items, capped
    let limit = cap.min(existing.len() + 1);
    let mut out = String::from("[");
    out.push_str(&entry);
    for (idx, item) in existing.iter().enumerate() {
        if idx + 1 >= limit { break; }
        out.push(',');
        write_json(item, &mut out);
    }
    out.push(']');
    Some(out)
}

//! Settings — defaults, deep-merge, immutable path set.
//! Ported from coreNative.js lines 8-58.

use serde_json::Value;

pub fn defaults() -> Value {
    serde_json::json!({
        "profile": { "username": "Player" },
        "theme": { "accent": "#22d3ee", "contrast": "normal", "appTint": true, "transparency": true },
        "layout": { "density": "compact" },
        "motion": { "animations": "full" },
        "background": { "enabled": true, "intensity": 0.7 },
        "performance": { "lowEndMode": false },
        "games": { "fullscreenOnLaunch": false, "escToClose": true },
        "browser": { "searchEngine": "duckduckgo" }
    })
}

pub fn merge(stored: Option<&Value>) -> Value {
    let def = defaults();
    let stored = match stored {
        Some(Value::Object(m)) => m,
        _ => return def,
    };
    let def_obj = def.as_object().unwrap();
    let mut merged = serde_json::Map::new();
    for (key, def_val) in def_obj {
        if let Value::Object(def_map) = def_val {
            if let Some(Value::Object(stored_section)) = stored.get(key) {
                let mut section = def_map.clone();
                for (fk, fv) in stored_section {
                    section.insert(fk.clone(), fv.clone());
                }
                merged.insert(key.clone(), Value::Object(section));
            } else {
                merged.insert(key.clone(), def_val.clone());
            }
        } else {
            merged.insert(key.clone(), stored.get(key).cloned().unwrap_or_else(|| def_val.clone()));
        }
    }
    Value::Object(merged)
}

pub fn set_at_path(settings: &Value, path: &str, value: Value) -> Value {
    let keys: Vec<&str> = path.split('.').collect();
    let mut result = settings.clone();
    let mut cur = &mut result;
    for key in &keys[..keys.len() - 1] {
        if cur.get(key).and_then(|v| v.as_object()).is_none() {
            return settings.clone();
        }
        // Clone the inner object to make it owned
        let inner = cur[key].clone();
        cur[key] = inner;
        cur = &mut cur[key];
    }
    cur[keys[keys.len() - 1]] = value;
    result
}

//! Window snap geometry — snap zone detection and bounds calculation.

use crate::{get, Parser, Value};

/// How close to a screen edge the pointer must be to trigger a snap zone.
const SNAP_EDGE: f64 = 14.0;

/// Detect which snap zone the pointer is in.
/// Input: `{"x": 10, "y": 5, "screenWidth": 1920, "screenHeight": 1080}`
/// Output: `"left"` | `"right"` | `"maximize"` | `null`
pub fn detect_zone(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let x = get(&obj, "x").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
    let y = get(&obj, "y").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
    let screen_width = get(&obj, "screenWidth").and_then(|v| match v { Value::Num(n) => Some(*n), _ => None }).unwrap_or(0.0);
    
    if y <= SNAP_EDGE {
        Some("\"maximize\"".to_string())
    } else if x <= SNAP_EDGE {
        Some("\"left\"".to_string())
    } else if x >= screen_width - SNAP_EDGE {
        Some("\"right\"".to_string())
    } else {
        Some("null".to_string())
    }
}

/// Calculate window bounds for a snap side.
/// Input: `{"side": "left"|"right", "taskbarPosition": "bottom"|"left"|"right", "screenWidth": 1920, "screenHeight": 1080}`
/// Output: `{x, y, width, height, maximized: false}` or `null` for maximize.
pub fn bounds(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let side = get(&obj, "side")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })?;
    let taskbar_pos = get(&obj, "taskbarPosition")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("bottom");
    let screen_width = get(&obj, "screenWidth")
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(1920.0);
    let screen_height = get(&obj, "screenHeight")
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(1080.0);
    
    // Calculate work area (viewport minus taskbar)
    let left = if taskbar_pos == "left" { 58.0 } else { 0.0 };
    let right = if taskbar_pos == "right" { 58.0 } else { 0.0 };
    let bottom = if taskbar_pos == "bottom" { 48.0 } else { 0.0 };
    
    let area_width = screen_width - left - right;
    let area_height = screen_height - bottom;
    let half = (area_width / 2.0).floor();
    
    let (x, y, width, height) = if side == "left" {
        (left, 0.0, half, area_height)
    } else if side == "right" {
        (left + area_width - half, 0.0, half, area_height)
    } else {
        return Some("null".to_string());
    };
    
    let mut out = String::new();
    out.push('{');
    out.push_str(&format!("\"x\":{},\"y\":{},\"width\":{},\"height\":{},\"maximized\":false", 
        x as i32, y as i32, width as i32, height as i32));
    out.push('}');
    Some(out)
}

/// Calculate preview style for a snap zone.
/// Input: `{"side": "left"|"right"|"maximize", "taskbarPosition": "bottom"|"left"|"right", "screenWidth": 1920, "screenHeight": 1080}`
/// Output: CSS style object as JSON.
pub fn preview_style(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };
    
    let side = get(&obj, "side")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })?;
    let taskbar_pos = get(&obj, "taskbarPosition")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("bottom");
    let screen_width = get(&obj, "screenWidth")
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(1920.0);
    let screen_height = get(&obj, "screenHeight")
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(1080.0);
    
    // Calculate work area
    let left = if taskbar_pos == "left" { 58.0 } else { 0.0 };
    let right = if taskbar_pos == "right" { 58.0 } else { 0.0 };
    let bottom = if taskbar_pos == "bottom" { 48.0 } else { 0.0 };
    
    let area_width = screen_width - left - right;
    let area_height = screen_height - bottom;
    let half = (area_width / 2.0).floor();
    
    let pad = 8.0;
    let (pos_left, width, height) = if side == "left" {
        (left + pad, half - pad * 1.5, area_height - pad * 2.0)
    } else if side == "right" {
        (left + area_width - half + pad / 2.0, half - pad * 1.5, area_height - pad * 2.0)
    } else {
        // maximize
        (left + pad, area_width - pad * 2.0, area_height - pad * 2.0)
    };
    
    let mut out = String::new();
    out.push('{');
    out.push_str("\"position\":\"fixed\",");
    out.push_str(&format!("\"top\":{},", pad as i32));
    out.push_str(&format!("\"left\":{},", pos_left as i32));
    out.push_str(&format!("\"width\":{},", width as i32));
    out.push_str(&format!("\"height\":{},", height as i32));
    out.push_str("\"borderRadius\":12,");
    out.push_str("\"background\":\"rgba(34,211,238,0.14)\",");
    out.push_str("\"border\":\"1.5px solid rgba(34,211,238,0.55)\",");
    out.push_str("\"boxShadow\":\"0 8px 32px rgba(0,0,0,0.35)\",");
    out.push_str("\"pointerEvents\":\"none\",");
    out.push_str("\"zIndex\":99990,");
    out.push_str("\"transition\":\"all 120ms ease-out\"");
    out.push('}');
    Some(out)
}

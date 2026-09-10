//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../browser/src/browser.rs"]
mod browser;

#[no_mangle]
pub extern "C" fn browser_resolve_input(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let input_str = get(&obj, "input").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let search_url = get(&obj, "searchUrl").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let (kind, value) = browser::resolve_input(input_str, search_url);
    set_out(format!(r#"{{"kind":"{}","value":"{}"}}"#, kind, json_escape(&value)).into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_hostname(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let url = get(&obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let host = browser::hostname(url);
    set_out(format!("\"{}\"", json_escape(&host)).into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_to_proxy_url(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let url = get(&obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let proxy = get(&obj, "proxyOrigin").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let backend = get(&obj, "backendUrl").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::to_proxy_url(url, proxy, backend);
    set_out(format!("\"{}\"", json_escape(&result)).into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_stats_increment(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let stats_json = match get(&obj, "stats") { Some(Value::Str(s)) => s.clone(), _ => return 0 };
    let ads = as_num(get(&obj, "ads").unwrap_or(&Value::Num(0.0))) as u32;
    let trackers = as_num(get(&obj, "trackers").unwrap_or(&Value::Num(0.0))) as u32;
    let https = as_num(get(&obj, "https").unwrap_or(&Value::Num(0.0))) as u32;
    let scripts = as_num(get(&obj, "scripts").unwrap_or(&Value::Num(0.0))) as u32;
    let data_val = as_num(get(&obj, "data").unwrap_or(&Value::Num(0.0))) as u64;
    let result = browser::stats_increment(&stats_json, ads, trackers, https, scripts, data_val);
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_stats_daily_reset(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let stats_json = match get(&obj, "stats") { Some(Value::Str(s)) => s.clone(), _ => "{}".into() };
    let now = as_num(get(&obj, "now").unwrap_or(&Value::Num(0.0)));
    let result = browser::stats_daily_reset(&stats_json, now);
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_format_stat_number(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let n = as_num(get(&obj, "n").unwrap_or(&Value::Num(0.0)));
    let result = browser::format_stat_number(n);
    set_out(format!("\"{}\"", result).into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_format_time_saved(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let secs = as_num(get(&obj, "seconds").unwrap_or(&Value::Num(0.0)));
    let result = browser::format_time_saved(secs);
    set_out(format!("\"{}\"", result).into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_bookmark_tree(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let result = browser::bookmark_tree(std::str::from_utf8(data).unwrap_or("[]"));
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_bookmark_search(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let bookmarks = match get(&obj, "bookmarks") { Some(v) => { let mut s = String::new(); write_json(v, &mut s); s }, _ => "[]".into() };
    let query = get(&obj, "query").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::bookmark_search(&bookmarks, query);
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_history_group(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let entries = match get(&obj, "entries") { Some(v) => { let mut s = String::new(); write_json(v, &mut s); s }, _ => "[]".into() };
    let now = as_num(get(&obj, "now").unwrap_or(&Value::Num(0.0)));
    let result = browser::history_group(&entries, now);
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_history_search(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let entries = match get(&obj, "entries") { Some(v) => { let mut s = String::new(); write_json(v, &mut s); s }, _ => "[]".into() };
    let query = get(&obj, "query").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::history_search(&entries, query);
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_omnibox_rank(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let result = browser::omnibox_rank(std::str::from_utf8(data).unwrap_or("{}"));
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_sanitize_html(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let html = get(&obj, "html").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::sanitize_html(html);
    set_out(result.into_bytes())
}

#[no_mangle]
pub extern "C" fn browser_slug(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() { Some(Value::Obj(o)) => o, _ => return 0 };
    let text = get(&obj, "text").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::slug(text);
    set_out(format!("\"{}\"", json_escape(&result)).into_bytes())
}
//! Lithium weather WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/device.rs"]
mod device;

// ─── WEATHER ──────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn weather_description(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let code = Parser::new(data).value().and_then(|v| match v {
        Value::Obj(ref obj) => get(obj, "code").and_then(|v| match v { Value::Num(n) => Some(*n as i32), _ => None }),
        _ => None,
    }).unwrap_or(-1);
    set_out(format!("\"{}\"", device::weather_description(code)).into_bytes())
}

#[no_mangle]
pub extern "C" fn weather_emoji(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::weather_emoji(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn weather_report(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::build_weather_report(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn weather_summary_line(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::summary_line_fn(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

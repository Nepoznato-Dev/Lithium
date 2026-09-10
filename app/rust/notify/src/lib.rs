//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/notify.rs"]
mod notify;

#[no_mangle]
pub extern "C" fn notify_filter(ptr: u32, len: u32, cutoff_ms: u64) -> u32 {
    let data = unsafe { input(ptr, len) };
    match notify::filter_by_age(data, cutoff_ms as f64) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_mark_all_read(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match notify::mark_all_read(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_mark_read(ptr: u32, len: u32, id_ptr: u32, id_len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let id_bytes = unsafe { input(id_ptr, id_len) };
    let id = std::str::from_utf8(id_bytes).unwrap_or("");
    match notify::mark_read(data, id) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_dismiss(ptr: u32, len: u32, id_ptr: u32, id_len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let id_bytes = unsafe { input(id_ptr, id_len) };
    let id = std::str::from_utf8(id_bytes).unwrap_or("");
    match notify::dismiss(data, id) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_unread_count(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    notify::unread_count(data).unwrap_or(0)
}
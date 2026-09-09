//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../ai/src/widget.rs"]
mod widget;

#[no_mangle]
pub extern "C" fn widget_filter_entries(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::filter_entries(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn widget_toggle_enabled(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::toggle_enabled(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn widget_stale_running_ids(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::stale_running_ids(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
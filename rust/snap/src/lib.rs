//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/snap.rs"]
mod snap;

#[no_mangle]
pub extern "C" fn snap_detect_zone(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::detect_zone(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn snap_bounds(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::bounds(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn snap_preview_style(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::preview_style(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
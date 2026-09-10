//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../core/src/settings.rs"]
mod settings;

#[no_mangle]
pub extern "C" fn settings_defaults() -> u32 {
    set_out(settings::defaults().into_bytes())
}

#[no_mangle]
pub extern "C" fn settings_merge(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match settings::merge(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn settings_set_at_path(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match settings::set_at_path(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
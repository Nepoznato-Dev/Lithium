//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/api.rs"]
mod api;

#[no_mangle]
pub extern "C" fn api_catalog() -> u32 {
    set_out(api::catalog().into_bytes())
}

#[no_mangle]
pub extern "C" fn api_validate(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match api::validate(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn api_audit_append(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match api::audit_append(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
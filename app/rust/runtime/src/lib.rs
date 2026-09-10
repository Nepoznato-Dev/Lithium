//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../ai/src/runtime.rs"]
mod runtime;

#[no_mangle]
pub extern "C" fn runtime_prepare_messages(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::prepare_messages(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_estimate_tokens(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::estimate_tokens(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_estimate_messages_tokens(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::estimate_messages_tokens(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_trim_messages_to_context(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::trim_messages_to_context(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_resolve_model(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::resolve_model(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
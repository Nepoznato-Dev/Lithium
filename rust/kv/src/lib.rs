//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/kv.rs"]
mod kv;

#[no_mangle]
pub extern "C" fn kv_should_overflow(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::should_overflow(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn kv_overflow_bytes(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::overflow_bytes(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn kv_migration_candidates(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::migration_candidates(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
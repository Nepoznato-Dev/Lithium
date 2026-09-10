//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/lock.rs"]
mod lock;

#[no_mangle]
pub extern "C" fn lock_verify(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match lock::verify(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn lock_record_failure(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match lock::record_failure(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/memory.rs"]
mod memory;

#[no_mangle]
pub extern "C" fn memory_write(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match memory::write_entry(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn memory_dump(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match memory::dump(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
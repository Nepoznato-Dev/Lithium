//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../ai/src/soloist.rs"]
mod soloist;

#[no_mangle]
pub extern "C" fn soloist_entity_info(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match soloist::entity_info(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn soloist_position(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match soloist::position(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
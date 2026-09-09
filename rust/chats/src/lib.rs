//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../ai/src/chats.rs"]
mod chats;

#[no_mangle]
pub extern "C" fn chats_upsert(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match chats::upsert(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn chats_delete(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match chats::delete(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn chats_trim(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match chats::trim(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
//! Lithium filesystem WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../core/src/fs.rs"]
mod fs;
#[path = "../../core/src/explorer.rs"]
mod explorer;

// ─── FS ───────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn fs_op(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match fs::op(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

// ─── EXPLORER ─────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn explorer_op(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match explorer::op(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

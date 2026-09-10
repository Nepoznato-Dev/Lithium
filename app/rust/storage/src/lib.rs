//! Lithium storage calc WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/storage_calc.rs"]
mod storage_calc;
#[path = "../../shell/src/dl_sync.rs"]
mod dl_sync;

// ─── STORAGE CALC ─────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn storage_format_bytes(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match storage_calc::format_bytes(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn storage_guess_disk(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match storage_calc::guess_total_disk(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn storage_summary(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match storage_calc::storage_summary(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

// ─── DL SYNC ──────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn dl_slug(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match dl_sync::download_slug(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn dl_progress(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match dl_sync::download_progress(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn dl_state(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match dl_sync::download_state(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

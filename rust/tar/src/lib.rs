//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../shell/src/tar_archive.rs"]
mod tar_archive;

#[no_mangle]
pub extern "C" fn tar_build(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match tar_archive::build_tar(data) { Some(out) => set_out(out), None => 0 }
}

#[no_mangle]
pub extern "C" fn tar_parse(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match tar_archive::parse_tar(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
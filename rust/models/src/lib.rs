//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../ai/src/models.rs"]
mod models;

#[no_mangle]
pub extern "C" fn model_slugify(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::slugify(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn model_parse_hf_url(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::parse_hf_url(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn model_hf_resolve_url(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::hf_resolve_url(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn model_search(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::search_models(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn model_download_slug(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::download_slug(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
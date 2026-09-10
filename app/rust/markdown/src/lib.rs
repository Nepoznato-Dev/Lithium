//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../core/src/markdown.rs"]
mod markdown;

#[no_mangle]
pub extern "C" fn md_render(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let src = String::from_utf8_lossy(data);
    set_out(markdown::render(&src).into_bytes())
}

#[no_mangle]
pub extern "C" fn md_render_enhanced(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let src = String::from_utf8_lossy(data);
    set_out(markdown::render_enhanced(&src).into_bytes())
}

#[no_mangle]
pub extern "C" fn md_wiki_links(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let src = String::from_utf8_lossy(data);
    let targets = markdown::wiki_links(&src);
    let parts: Vec<String> = targets.iter().map(|t| format!("\"{}\"", json_escape(t))).collect();
    set_out(format!("[{}]", parts.join(",")).into_bytes())
}
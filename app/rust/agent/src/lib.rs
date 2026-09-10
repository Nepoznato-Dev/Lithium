//! Lithium WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[path = "../../ai/src/agent.rs"]
mod agent;

#[no_mangle]
pub extern "C" fn agent_mode_catalog() -> u32 {
    set_out(agent::mode_catalog().into_bytes())
}

#[no_mangle]
pub extern "C" fn agent_extract_api_calls(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match agent::extract_api_calls(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn agent_extract_widget_blocks(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match agent::extract_widget_blocks(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn agent_strip_tool_blocks(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match agent::strip_tool_blocks(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}
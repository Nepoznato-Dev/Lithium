//! Lithium AI WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

mod models;
mod agent;
mod chats;
mod soloist;
mod runtime;
mod widget;

// ─── MODELS ───────────────────────────────────────────────────────

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

// ─── AGENT ────────────────────────────────────────────────────────

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

// ─── CHATS ────────────────────────────────────────────────────────

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

// ─── SOLOIST ──────────────────────────────────────────────────────

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

// ─── RUNTIME ──────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn runtime_prepare_messages(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::prepare_messages(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_estimate_tokens(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::estimate_tokens(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_estimate_messages_tokens(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::estimate_messages_tokens(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_trim_messages_to_context(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::trim_messages_to_context(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn runtime_resolve_model(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::resolve_model(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

// ─── WIDGET ───────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn widget_filter_entries(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::filter_entries(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn widget_toggle_enabled(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::toggle_enabled(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn widget_stale_running_ids(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::stale_running_ids(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

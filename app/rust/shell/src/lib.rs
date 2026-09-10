//! Lithium shell WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

mod notify;
mod snap;
mod lock;
mod device;
mod storage_calc;
mod memory;
mod api;
mod dl_sync;
mod kv;
mod tar_archive;

// ─── NOTIFY ───────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn notify_filter(ptr: u32, len: u32, cutoff_ms: u64) -> u32 {
    let data = unsafe { input(ptr, len) };
    match notify::filter_by_age(data, cutoff_ms as f64) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_mark_all_read(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match notify::mark_all_read(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_mark_read(ptr: u32, len: u32, id_ptr: u32, id_len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let id_bytes = unsafe { input(id_ptr, id_len) };
    let id = std::str::from_utf8(id_bytes).unwrap_or("");
    match notify::mark_read(data, id) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_dismiss(ptr: u32, len: u32, id_ptr: u32, id_len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let id_bytes = unsafe { input(id_ptr, id_len) };
    let id = std::str::from_utf8(id_bytes).unwrap_or("");
    match notify::dismiss(data, id) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn notify_unread_count(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    notify::unread_count(data).unwrap_or(0)
}

// ─── SNAP ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn snap_detect_zone(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::detect_zone(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn snap_bounds(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::bounds(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn snap_preview_style(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::preview_style(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

// ─── LOCK ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn lock_verify(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match lock::verify(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn lock_record_failure(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match lock::record_failure(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

// ─── MEMORY ───────────────────────────────────────────────────────

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

// ─── API ──────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn api_catalog() -> u32 {
    set_out(api::catalog().into_bytes())
}

#[no_mangle]
pub extern "C" fn api_validate(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match api::validate(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn api_audit_append(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match api::audit_append(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

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

// ─── WEATHER ──────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn weather_description(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let code = Parser::new(data).value().and_then(|v| match v {
        Value::Obj(ref obj) => get(obj, "code").and_then(|v| match v { Value::Num(n) => Some(*n as i32), _ => None }),
        _ => None,
    }).unwrap_or(-1);
    set_out(format!("\"{}\"", device::weather_description(code)).into_bytes())
}

#[no_mangle]
pub extern "C" fn weather_emoji(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::weather_emoji(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn weather_report(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::build_weather_report(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn weather_summary_line(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::summary_line_fn(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

// ─── KV ───────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn kv_should_overflow(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::should_overflow(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn kv_overflow_bytes(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::overflow_bytes(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
}

#[no_mangle]
pub extern "C" fn kv_migration_candidates(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::migration_candidates(data) { Some(out) => set_out(out.into_bytes()), None => 0 }
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

// ─── TAR ──────────────────────────────────────────────────────────

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

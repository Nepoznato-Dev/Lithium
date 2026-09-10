//! Lithium core WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

mod markdown;
mod fs;
mod explorer;
mod settings;

// ─── SNAPSHOT CODEC ───────────────────────────────────────────────

fn kind_code(kind: &str) -> u8 {
    match kind {
        "folder" => 0,
        "text" => 1,
        "image" => 2,
        _ => 3,
    }
}

fn kind_name(code: u8) -> &'static str {
    match code {
        0 => "folder",
        1 => "text",
        2 => "image",
        _ => "file",
    }
}

struct Writer(Vec<u8>);

impl Writer {
    fn new() -> Self { Writer(Vec::with_capacity(64 * 1024)) }
    fn u8(&mut self, v: u8) { self.0.push(v); }
    fn u32(&mut self, v: u32) { self.0.extend_from_slice(&v.to_le_bytes()); }
    fn u64(&mut self, v: u64) { self.0.extend_from_slice(&v.to_le_bytes()); }
    fn str(&mut self, s: &str) { self.u32(s.len() as u32); self.0.extend_from_slice(s.as_bytes()); }
}

struct Reader<'a> { buf: &'a [u8], pos: usize }

impl<'a> Reader<'a> {
    fn new(buf: &'a [u8]) -> Self { Reader { buf, pos: 0 } }
    fn ok(&self, n: usize) -> bool { self.pos + n <= self.buf.len() }
    fn u8(&mut self) -> Option<u8> { if !self.ok(1) { return None; } let v = self.buf[self.pos]; self.pos += 1; Some(v) }
    fn u32(&mut self) -> Option<u32> { if !self.ok(4) { return None; } let v = u32::from_le_bytes(self.buf[self.pos..self.pos + 4].try_into().ok()?); self.pos += 4; Some(v) }
    fn u64(&mut self) -> Option<u64> { if !self.ok(8) { return None; } let v = u64::from_le_bytes(self.buf[self.pos..self.pos + 8].try_into().ok()?); self.pos += 8; Some(v) }
    fn str(&mut self) -> Option<String> { let len = self.u32()? as usize; if !self.ok(len) { return None; } let s = String::from_utf8_lossy(&self.buf[self.pos..self.pos + len]).into_owned(); self.pos += len; Some(s) }
}

#[no_mangle]
pub extern "C" fn snapshot_encode(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let root = match Parser::new(data).value() {
        Some(Value::Arr(items)) => items,
        _ => return 0,
    };
    let mut entries: Vec<EntryRaw> = Vec::with_capacity(root.len());
    for item in &root {
        let Value::Obj(obj) = item else { return 0 };
        let mut e = EntryRaw::default();
        if let Some(Value::Str(s)) = get(obj, "id") { e.id = s.clone() }
        if let Some(Value::Str(s)) = get(obj, "name") { e.name = s.clone() }
        if let Some(Value::Str(s)) = get(obj, "type") { e.kind = s.clone() }
        if e.kind.is_empty() { e.kind = "file".into() }
        if let Some(Value::Str(s)) = get(obj, "parentId") { e.parentId = Some(s.clone()) }
        if let Some(Value::Str(s)) = get(obj, "content") { e.content = Some(s.clone()) }
        if let Some(v) = get(obj, "size") { e.size = as_num(v) }
        if let Some(v) = get(obj, "createdAt") { e.createdAt = as_num(v) }
        if let Some(v) = get(obj, "updatedAt") { e.updatedAt = as_num(v) }
        if let Some(v) = get(obj, "idb") { e.idb = as_bool(v) }
        if let Some(Value::Str(s)) = get(obj, "blobRef") { e.blobRef = Some(s.clone()) }
        if let Some(Value::Str(s)) = get(obj, "ref") { e.reference = Some(s.clone()) }
        entries.push(e);
    }
    let mut w = Writer::new();
    w.u32(MAGIC);
    w.u8(VERSION);
    w.u32(entries.len() as u32);
    for e in &entries {
        w.str(&e.id); w.str(&e.name); w.u8(kind_code(&e.kind));
        w.str(e.parentId.as_deref().unwrap_or(""));
        w.u64(e.size as u64); w.u64(e.createdAt as u64); w.u64(e.updatedAt as u64);
        match &e.content { Some(c) => { w.u8(1); w.str(c); } None => w.u8(0), }
        w.u8(e.idb as u8);
        w.str(e.blobRef.as_deref().unwrap_or(""));
        w.str(e.reference.as_deref().unwrap_or(""));
    }
    set_out(w.0)
}

#[no_mangle]
pub extern "C" fn snapshot_decode(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let mut r = Reader::new(data);
    let magic = match r.u32() { Some(v) => v, None => return 0 };
    let version = r.u8().unwrap_or(0);
    if magic != MAGIC || (version != 1 && version != 2) { return 0; }
    let count = match r.u32() { Some(v) => v, None => return 0 };
    let mut parts: Vec<String> = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let id = match r.str() { Some(v) => v, None => return 0 };
        let name = r.str().unwrap_or_default();
        let kind = kind_name(r.u8().unwrap_or(3));
        let parent = r.str().unwrap_or_default();
        let size = r.u64().unwrap_or(0);
        let createdAt = r.u64().unwrap_or(0);
        let updatedAt = r.u64().unwrap_or(0);
        let has_content = r.u8().unwrap_or(0) == 1;
        let content = if has_content { r.str() } else { None };
        let idb = r.u8().unwrap_or(0) == 1;
        let (blob_ref, reference) = if version >= 2 {
            (r.str().unwrap_or_default(), r.str().unwrap_or_default())
        } else { (String::new(), String::new()) };
        let mut s = String::new();
        s.push('{');
        s.push_str(&format!("\"id\":\"{}\",\"name\":\"{}\",\"type\":\"{}\"", json_escape(&id), json_escape(&name), kind));
        match &content { Some(c) => s.push_str(&format!(",\"content\":\"{}\"", json_escape(c))), None => s.push_str(",\"content\":null"), }
        if parent.is_empty() { s.push_str(",\"parentId\":null"); } else { s.push_str(&format!(",\"parentId\":\"{}\"", json_escape(&parent))); }
        s.push_str(&format!(",\"size\":{},\"createdAt\":{},\"updatedAt\":{},\"idb\":{}", num_json(size as f64), num_json(createdAt as f64), num_json(updatedAt as f64), idb));
        if !blob_ref.is_empty() { s.push_str(&format!(",\"blobRef\":\"{}\"", json_escape(&blob_ref))); }
        if !reference.is_empty() { s.push_str(&format!(",\"ref\":\"{}\"", json_escape(&reference))); }
        s.push('}');
        parts.push(s);
    }
    set_out(format!("[{}]", parts.join(",")).into_bytes())
}

// ─── LZ4 ──────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn lz4_compress(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    set_out(lz4_flex::block::compress_prepend_size(data))
}

#[no_mangle]
pub extern "C" fn lz4_uncompressed_size(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    if data.len() < 4 { return 0; }
    u32::from_le_bytes([data[0], data[1], data[2], data[3]])
}

#[no_mangle]
pub extern "C" fn lz4_decompress_into(in_ptr: u32, in_len: u32, out_ptr: u32, out_cap: u32) -> u32 {
    let data = unsafe { input(in_ptr, in_len) };
    match lz4_flex::block::decompress_size_prepended(data) {
        Ok(out) if (out.len() as u32) <= out_cap => {
            unsafe { std::ptr::copy_nonoverlapping(out.as_ptr(), out_ptr as *mut u8, out.len()) };
            out.len() as u32
        }
        _ => 0,
    }
}

// ─── XXH3 ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn xxh3(ptr: u32, len: u32) -> u64 {
    let data = unsafe { input(ptr, len) };
    xxhash_rust::xxh3::xxh3_64(data)
}

// ─── MARKDOWN ─────────────────────────────────────────────────────

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

// ─── FS ───────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn fs_op(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match fs::op(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

#[no_mangle]
pub extern "C" fn explorer_op(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match explorer::op(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

// ─── SETTINGS ─────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn settings_defaults() -> u32 {
    set_out(settings::defaults().into_bytes())
}

#[no_mangle]
pub extern "C" fn settings_merge(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match settings::merge(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

#[no_mangle]
pub extern "C" fn settings_set_at_path(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match settings::set_at_path(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

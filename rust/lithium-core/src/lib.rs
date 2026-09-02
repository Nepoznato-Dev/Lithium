//! Lithium native core — compiled to wasm32-unknown-unknown with a raw ABI
//! (no wasm-bindgen): JS copies bytes in via `alloc`, calls a function, and
//! reads the leaked result via `out_ptr`/return value.
//!
//! Exposes:
//!  - LZ4 block compression / decompression (size-prepended container)
//!  - xxh3 64-bit integrity hashing
//!  - binary snapshot codec for the virtual file system tree
//!  - markdown renderer + wiki-link extraction (markdown.rs)
//!  - file-system tree ops: remove/duplicate/move/path/doomed (fs.rs)
//!
//! Snapshot binary format v2 (little endian, decodes v1 too):
//!   magic u32 'LiFS' (0x4C694653) · version u8 = 2 · count u32
//!   per entry: str id · str name · u8 kind · str parentId ("" = null)
//!              · u64 size · u64 createdAt · u64 updatedAt
//!              · u8 has_content · [str content] · u8 idb
//!              · v2 adds: str blobRef ("" = none) · str ref ("" = none)
//!   str = u32 len + utf8 bytes
//!
//! Dependencies are pure-Rust and build-script-free so the crate cross-compiles
//! on hosts without a C toolchain.

#![allow(non_snake_case)]

mod agent;
mod api;
mod browser;
mod chats;
mod device;
mod dl_sync;
mod fs;
mod explorer;
mod kv;
mod lock;
mod markdown;
mod memory;
mod models;
mod notify;
mod settings;
mod snap;
mod soloist;
mod storage_calc;
mod runtime;
mod widget;

const MAGIC: u32 = 0x4C694653; // "LiFS"
const VERSION: u8 = 2;

/* ---------- ABI helpers ---------- */

static mut OUT_PTR: u32 = 0;

fn leak(bytes: Vec<u8>) -> u32 {
    let ptr = bytes.as_ptr() as u32;
    std::mem::forget(bytes);
    ptr
}

fn set_out(bytes: Vec<u8>) -> u32 {
    let len = bytes.len() as u32;
    let ptr = leak(bytes);
    unsafe { OUT_PTR = ptr };
    len
}

unsafe fn input<'a>(ptr: u32, len: u32) -> &'a [u8] {
    std::slice::from_raw_parts(ptr as *const u8, len as usize)
}

#[no_mangle]
pub extern "C" fn core_version() -> u32 {
    VERSION as u32
}

#[no_mangle]
pub extern "C" fn alloc(size: u32) -> u32 {
    let layout = std::alloc::Layout::from_size_align(size.max(1) as usize, 8).unwrap();
    unsafe { std::alloc::alloc(layout) as u32 }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: u32, size: u32) {
    if ptr == 0 {
        return;
    }
    let layout = std::alloc::Layout::from_size_align(size.max(1) as usize, 8).unwrap();
    unsafe { std::alloc::dealloc(ptr as *mut u8, layout) }
}

#[no_mangle]
pub extern "C" fn out_ptr() -> u32 {
    unsafe { OUT_PTR }
}

/* ---------- LZ4 ---------- */

#[no_mangle]
pub extern "C" fn lz4_compress(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    set_out(lz4_flex::block::compress_prepend_size(data))
}

#[no_mangle]
pub extern "C" fn lz4_uncompressed_size(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    if data.len() < 4 {
        return 0;
    }
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

/* ---------- xxh3 ---------- */

#[no_mangle]
pub extern "C" fn xxh3(ptr: u32, len: u32) -> u64 {
    let data = unsafe { input(ptr, len) };
    xxhash_rust::xxh3::xxh3_64(data)
}

/* ---------- Minimal JSON (subset produced by JSON.stringify) ---------- */

#[derive(Default, Clone)]
struct EntryRaw {
    id: String,
    name: String,
    kind: String,
    parentId: Option<String>,
    content: Option<String>,
    size: f64,
    createdAt: f64,
    updatedAt: f64,
    idb: bool,
    blobRef: Option<String>, // external IndexedDB blob key (e.g. model GGUFs)
    reference: Option<String>, // external reference (e.g. cached game url)
}

#[derive(Clone)]
pub(crate) enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

pub(crate) struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn new(b: &'a [u8]) -> Self {
        Parser { b, i: 0 }
    }

    fn ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }

    fn eat(&mut self, c: u8) -> bool {
        if self.peek() == Some(c) {
            self.i += 1;
            true
        } else {
            false
        }
    }

    fn value(&mut self) -> Option<Value> {
        self.ws();
        match self.peek()? {
            b'{' => self.object(),
            b'[' => self.array(),
            b'"' => Some(Value::Str(self.string()?)),
            b't' => {
                self.lit("true")?;
                Some(Value::Bool(true))
            }
            b'f' => {
                self.lit("false")?;
                Some(Value::Bool(false))
            }
            b'n' => {
                self.lit("null")?;
                Some(Value::Null)
            }
            _ => self.number(),
        }
    }

    fn lit(&mut self, s: &str) -> Option<()> {
        if self.b[self.i..].starts_with(s.as_bytes()) {
            self.i += s.len();
            Some(())
        } else {
            None
        }
    }

    fn number(&mut self) -> Option<Value> {
        let start = self.i;
        if self.eat(b'-') {}
        while matches!(self.peek(), Some(b'0'..=b'9' | b'.' | b'e' | b'E' | b'+' | b'-')) {
            self.i += 1;
        }
        std::str::from_utf8(&self.b[start..self.i]).ok()?.parse::<f64>().ok().map(Value::Num)
    }

    fn string(&mut self) -> Option<String> {
        if !self.eat(b'"') {
            return None;
        }
        let mut out = String::new();
        loop {
            let c = self.peek()?;
            self.i += 1;
            match c {
                b'"' => return Some(out),
                b'\\' => {
                    let e = self.peek()?;
                    self.i += 1;
                    match e {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{0008}'),
                        b'f' => out.push('\u{000C}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            if self.i + 4 > self.b.len() {
                                return None;
                            }
                            let hex = std::str::from_utf8(&self.b[self.i..self.i + 4]).ok()?;
                            let code = u32::from_str_radix(hex, 16).ok()?;
                            self.i += 4;
                            out.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
                        }
                        _ => return None,
                    }
                }
                _ => {
                    // raw utf-8 byte: copy continuation sequence
                    let start = self.i - 1;
                    let extra = if c >= 0xF0 {
                        3
                    } else if c >= 0xE0 {
                        2
                    } else if c >= 0xC0 {
                        1
                    } else {
                        0
                    };
                    if self.i + extra > self.b.len() {
                        return None;
                    }
                    let s = std::str::from_utf8(&self.b[start..self.i + extra]).ok()?;
                    out.push_str(s);
                    self.i += extra;
                }
            }
        }
    }

    fn array(&mut self) -> Option<Value> {
        if !self.eat(b'[') {
            return None;
        }
        let mut items = Vec::new();
        self.ws();
        if self.eat(b']') {
            return Some(Value::Arr(items));
        }
        loop {
            items.push(self.value()?);
            self.ws();
            if self.eat(b',') {
                continue;
            }
            if self.eat(b']') {
                return Some(Value::Arr(items));
            }
            return None;
        }
    }

    fn object(&mut self) -> Option<Value> {
        if !self.eat(b'{') {
            return None;
        }
        let mut pairs = Vec::new();
        self.ws();
        if self.eat(b'}') {
            return Some(Value::Obj(pairs));
        }
        loop {
            self.ws();
            let key = self.string()?;
            self.ws();
            if !self.eat(b':') {
                return None;
            }
            let val = self.value()?;
            pairs.push((key, val));
            self.ws();
            if self.eat(b',') {
                continue;
            }
            if self.eat(b'}') {
                return Some(Value::Obj(pairs));
            }
            return None;
        }
    }
}

pub(crate) fn get<'v>(obj: &'v [(String, Value)], key: &str) -> Option<&'v Value> {
    obj.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

pub(crate) fn as_num(v: &Value) -> f64 {
    match v {
        Value::Num(n) => *n,
        _ => 0.0,
    }
}

pub(crate) fn as_bool(v: &Value) -> bool {
    matches!(v, Value::Bool(true))
}

pub(crate) fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

pub(crate) fn num_json(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 9.0e15 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

/// Generic Value → JSON serializer (used by fs.rs to round-trip trees).
pub(crate) fn write_json(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Num(n) => out.push_str(&num_json(*n)),
        Value::Str(s) => {
            out.push('"');
            out.push_str(&json_escape(s));
            out.push('"');
        }
        Value::Arr(items) => {
            out.push('[');
            for (idx, item) in items.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                write_json(item, out);
            }
            out.push(']');
        }
        Value::Obj(pairs) => {
            out.push('{');
            for (idx, (key, val)) in pairs.iter().enumerate() {
                if idx > 0 {
                    out.push(',');
                }
                out.push('"');
                out.push_str(&json_escape(key));
                out.push_str("\":");
                write_json(val, out);
            }
            out.push('}');
        }
    }
}

/* ---------- Snapshot codec ---------- */

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
    fn new() -> Self {
        Writer(Vec::with_capacity(64 * 1024))
    }
    fn u8(&mut self, v: u8) {
        self.0.push(v);
    }
    fn u32(&mut self, v: u32) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn u64(&mut self, v: u64) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn str(&mut self, s: &str) {
        self.u32(s.len() as u32);
        self.0.extend_from_slice(s.as_bytes());
    }
}

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Reader { buf, pos: 0 }
    }
    fn ok(&self, n: usize) -> bool {
        self.pos + n <= self.buf.len()
    }
    fn u8(&mut self) -> Option<u8> {
        if !self.ok(1) {
            return None;
        }
        let v = self.buf[self.pos];
        self.pos += 1;
        Some(v)
    }
    fn u32(&mut self) -> Option<u32> {
        if !self.ok(4) {
            return None;
        }
        let v = u32::from_le_bytes(self.buf[self.pos..self.pos + 4].try_into().ok()?);
        self.pos += 4;
        Some(v)
    }
    fn u64(&mut self) -> Option<u64> {
        if !self.ok(8) {
            return None;
        }
        let v = u64::from_le_bytes(self.buf[self.pos..self.pos + 8].try_into().ok()?);
        self.pos += 8;
        Some(v)
    }
    fn str(&mut self) -> Option<String> {
        let len = self.u32()? as usize;
        if !self.ok(len) {
            return None;
        }
        let s = String::from_utf8_lossy(&self.buf[self.pos..self.pos + len]).into_owned();
        self.pos += len;
        Some(s)
    }
}

/// JSON (array of entries) → binary snapshot. Output via out_ptr(); returns len (0 = error).
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
        if let Some(Value::Str(s)) = get(obj, "id") {
            e.id = s.clone()
        }
        if let Some(Value::Str(s)) = get(obj, "name") {
            e.name = s.clone()
        }
        if let Some(Value::Str(s)) = get(obj, "type") {
            e.kind = s.clone()
        }
        if e.kind.is_empty() {
            e.kind = "file".into()
        }
        if let Some(Value::Str(s)) = get(obj, "parentId") {
            e.parentId = Some(s.clone())
        }
        if let Some(Value::Str(s)) = get(obj, "content") {
            e.content = Some(s.clone())
        }
        if let Some(v) = get(obj, "size") {
            e.size = as_num(v)
        }
        if let Some(v) = get(obj, "createdAt") {
            e.createdAt = as_num(v)
        }
        if let Some(v) = get(obj, "updatedAt") {
            e.updatedAt = as_num(v)
        }
        if let Some(v) = get(obj, "idb") {
            e.idb = as_bool(v)
        }
        if let Some(Value::Str(s)) = get(obj, "blobRef") {
            e.blobRef = Some(s.clone())
        }
        if let Some(Value::Str(s)) = get(obj, "ref") {
            e.reference = Some(s.clone())
        }
        entries.push(e);
    }

    let mut w = Writer::new();
    w.u32(MAGIC);
    w.u8(VERSION);
    w.u32(entries.len() as u32);
    for e in &entries {
        w.str(&e.id);
        w.str(&e.name);
        w.u8(kind_code(&e.kind));
        w.str(e.parentId.as_deref().unwrap_or(""));
        w.u64(e.size as u64);
        w.u64(e.createdAt as u64);
        w.u64(e.updatedAt as u64);
        match &e.content {
            Some(content) => {
                w.u8(1);
                w.str(content);
            }
            None => w.u8(0),
        }
        w.u8(e.idb as u8);
        w.str(e.blobRef.as_deref().unwrap_or(""));
        w.str(e.reference.as_deref().unwrap_or(""));
    }
    set_out(w.0)
}

/// Binary snapshot → JSON string. Output via out_ptr(); returns len (0 = error).
#[no_mangle]
pub extern "C" fn snapshot_decode(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let mut r = Reader::new(data);

    let magic = match r.u32() {
        Some(v) => v,
        None => return 0,
    };
    let version = r.u8().unwrap_or(0);
    if magic != MAGIC || (version != 1 && version != 2) {
        return 0;
    }
    let count = match r.u32() {
        Some(v) => v,
        None => return 0,
    };

    let mut parts: Vec<String> = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let id = match r.str() {
            Some(v) => v,
            None => return 0,
        };
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
        } else {
            (String::new(), String::new())
        };

        let mut s = String::new();
        s.push('{');
        s.push_str(&format!("\"id\":\"{}\",\"name\":\"{}\",\"type\":\"{}\"", json_escape(&id), json_escape(&name), kind));
        match &content {
            Some(c) => s.push_str(&format!(",\"content\":\"{}\"", json_escape(c))),
            None => s.push_str(",\"content\":null"),
        }
        if parent.is_empty() {
            s.push_str(",\"parentId\":null");
        } else {
            s.push_str(&format!(",\"parentId\":\"{}\"", json_escape(&parent)));
        }
        s.push_str(&format!(",\"size\":{},\"createdAt\":{},\"updatedAt\":{},\"idb\":{}", num_json(size as f64), num_json(createdAt as f64), num_json(updatedAt as f64), idb));
        if !blob_ref.is_empty() {
            s.push_str(&format!(",\"blobRef\":\"{}\"", json_escape(&blob_ref)));
        }
        if !reference.is_empty() {
            s.push_str(&format!(",\"ref\":\"{}\"", json_escape(&reference)));
        }
        s.push('}');
        parts.push(s);
    }

    set_out(format!("[{}]", parts.join(",")).into_bytes())
}

/* ---------- Markdown ---------- */

/// Markdown source → HTML string. Output via out_ptr(); returns len.
#[no_mangle]
pub extern "C" fn md_render(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let src = String::from_utf8_lossy(data);
    set_out(markdown::render(&src).into_bytes())
}

/// Enhanced Markdown (Obsidian/GFM) → HTML string. Output via out_ptr(); returns len.
#[no_mangle]
pub extern "C" fn md_render_enhanced(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let src = String::from_utf8_lossy(data);
    set_out(markdown::render_enhanced(&src).into_bytes())
}

/// Markdown source → JSON array of unique wiki-link targets.
#[no_mangle]
pub extern "C" fn md_wiki_links(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let src = String::from_utf8_lossy(data);
    let targets = markdown::wiki_links(&src);
    let parts: Vec<String> = targets.iter().map(|t| format!("\"{}\"", json_escape(t))).collect();
    set_out(format!("[{}]", parts.join(",")).into_bytes())
}

/* ---------- File system ops ---------- */

/// {"op","tree","id",...} → JSON result. Returns 0 on error (JS falls back).
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

/* ---------- API manager ---------- */

/// Full API catalog as a JSON array.
#[no_mangle]
pub extern "C" fn api_catalog() -> u32 {
    set_out(api::catalog().into_bytes())
}

/// Validate an API call request: {"api","params","caller"} → verdict JSON.
#[no_mangle]
pub extern "C" fn api_validate(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match api::validate(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Prepend audit log entry and cap: {"log","api","caller","ok","error","now","cap"} → updated log.
#[no_mangle]
pub extern "C" fn api_audit_append(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match api::audit_append(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Notification history ---------- */

/// Filter notifications by age: JSON array → filtered JSON array.
#[no_mangle]
pub extern "C" fn notify_filter(ptr: u32, len: u32, cutoff_ms: u64) -> u32 {
    let data = unsafe { input(ptr, len) };
    match notify::filter_by_age(data, cutoff_ms as f64) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Mark all notifications as read: JSON array → updated JSON array.
#[no_mangle]
pub extern "C" fn notify_mark_all_read(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match notify::mark_all_read(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Mark single notification as read: JSON array + id → updated JSON array.
#[no_mangle]
pub extern "C" fn notify_mark_read(ptr: u32, len: u32, id_ptr: u32, id_len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let id_bytes = unsafe { input(id_ptr, id_len) };
    let id = std::str::from_utf8(id_bytes).unwrap_or("");
    match notify::mark_read(data, id) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Dismiss notification by id: JSON array + id → filtered JSON array.
#[no_mangle]
pub extern "C" fn notify_dismiss(ptr: u32, len: u32, id_ptr: u32, id_len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let id_bytes = unsafe { input(id_ptr, id_len) };
    let id = std::str::from_utf8(id_bytes).unwrap_or("");
    match notify::dismiss(data, id) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Count unread notifications: JSON array → count.
#[no_mangle]
pub extern "C" fn notify_unread_count(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    notify::unread_count(data).unwrap_or(0)
}

/* ---------- Settings ---------- */

/// Default settings as JSON string.
#[no_mangle]
pub extern "C" fn settings_defaults() -> u32 {
    set_out(settings::defaults().into_bytes())
}

/// Deep-merge stored settings over defaults: {"stored": {...}} → merged JSON.
#[no_mangle]
pub extern "C" fn settings_merge(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match settings::merge(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Immutable set at dotted path: {"settings", "path", "value"} → updated JSON.
#[no_mangle]
pub extern "C" fn settings_set_at_path(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match settings::set_at_path(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Window snap geometry ---------- */

/// Detect snap zone: {"x", "y", "screenWidth"} → "left"|"right"|"maximize"|null.
#[no_mangle]
pub extern "C" fn snap_detect_zone(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::detect_zone(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Calculate snap bounds: {"side", "taskbarPosition", "screenWidth", "screenHeight"} → bounds JSON.
#[no_mangle]
pub extern "C" fn snap_bounds(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::bounds(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Calculate preview style: {"side", "taskbarPosition", "screenWidth", "screenHeight"} → style JSON.
#[no_mangle]
pub extern "C" fn snap_preview_style(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match snap::preview_style(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Lock state machine ---------- */

/// Validate PIN format and lockout: {"pin", "failCount", "lockedUntil", "now"} → result JSON.
#[no_mangle]
pub extern "C" fn lock_verify(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match lock::verify(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Record PIN failure: {"failCount", "now"} → {"failCount", "lockedUntil", "retryIn"}.
#[no_mangle]
pub extern "C" fn lock_record_failure(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match lock::record_failure(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Memory management ---------- */

/// Write memory entry with LRU eviction: {"memory", "key", "value", "now"} → {"memory", "cleanKey"}.
#[no_mangle]
pub extern "C" fn memory_write(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match memory::write_entry(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Generate compact memory dump: {"memory", "maxEntries"} → formatted string.
#[no_mangle]
pub extern "C" fn memory_dump(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match memory::dump(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Agent modes and AI blocks ---------- */

/// Get mode catalog as JSON.
#[no_mangle]
pub extern "C" fn agent_mode_catalog() -> u32 {
    set_out(agent::mode_catalog().into_bytes())
}

/// Extract ```api blocks: {"text"} → [{api, params}, ...].
#[no_mangle]
pub extern "C" fn agent_extract_api_calls(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match agent::extract_api_calls(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Extract ```widget blocks: {"text"} → [{name, code}, ...].
#[no_mangle]
pub extern "C" fn agent_extract_widget_blocks(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match agent::extract_widget_blocks(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Strip tool blocks: {"text"} → cleaned text.
#[no_mangle]
pub extern "C" fn agent_strip_tool_blocks(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match agent::strip_tool_blocks(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Chat management ---------- */

/// Upsert chat: {"chats", "chat", "now"} → {"chats": [...]}.
#[no_mangle]
pub extern "C" fn chats_upsert(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match chats::upsert(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Delete chat: {"chats", "id"} → {"chats": [...]} or null.
#[no_mangle]
pub extern "C" fn chats_delete(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match chats::delete(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Trim chats to max: {"chats"} → {"chats": [...]}.
#[no_mangle]
pub extern "C" fn chats_trim(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match chats::trim(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Storage calculations ---------- */

/// Format bytes to human-readable: {"bytes": 1234} → "1.2 KB".
#[no_mangle]
pub extern "C" fn storage_format_bytes(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match storage_calc::format_bytes(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Guess total disk from quota: {"quota": 1234} → {"estimatedDisk": 2057}.
#[no_mangle]
pub extern "C" fn storage_guess_disk(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match storage_calc::guess_total_disk(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Storage summary with formatted sizes.
#[no_mangle]
pub extern "C" fn storage_summary(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match storage_calc::storage_summary(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Device context / weather ---------- */

/// Weather description from WMO code: {"code": 2} → "partly cloudy".
#[no_mangle]
pub extern "C" fn weather_description(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let code = Parser::new(data).value().and_then(|v| match v {
        Value::Obj(ref obj) => get(obj, "code")
            .and_then(|v| match v { Value::Num(n) => Some(*n as i32), _ => None }),
        _ => None,
    }).unwrap_or(-1);
    set_out(format!("\"{}\"", device::weather_description(code)).into_bytes())
}

/// Weather emoji from WMO code + day/night.
#[no_mangle]
pub extern "C" fn weather_emoji(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::weather_emoji(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Build weather report markdown.
#[no_mangle]
pub extern "C" fn weather_report(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::build_weather_report(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Weather summary line.
#[no_mangle]
pub extern "C" fn weather_summary_line(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match device::summary_line_fn(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- KV tier ---------- */

/// Decide if value should overflow: {"jsonLength": 40000} → {"overflow": true}.
#[no_mangle]
pub extern "C" fn kv_should_overflow(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::should_overflow(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Calculate overflow bytes: {"entries": [...]} → {"bytes": 80000}.
#[no_mangle]
pub extern "C" fn kv_overflow_bytes(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::overflow_bytes(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Migration candidates: {"entries": [...]} → ["key1", "key2"].
#[no_mangle]
pub extern "C" fn kv_migration_candidates(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match kv::migration_candidates(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Download sync ---------- */

/// Download slug: {"name": "My File"} → "my-file".
#[no_mangle]
pub extern "C" fn dl_slug(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match dl_sync::download_slug(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Download progress: {"received", "total"} → progress JSON.
#[no_mangle]
pub extern "C" fn dl_progress(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match dl_sync::download_progress(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Download state: {"received", "total", "error"} → state JSON.
#[no_mangle]
pub extern "C" fn dl_state(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match dl_sync::download_state(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Models ---------- */

/// Slugify a model name: {"text": "My Model"} → "my-model".
#[no_mangle]
pub extern "C" fn model_slugify(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::slugify(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Parse HF URL: {"url": "..."} → {"repoId", "path"} or null.
#[no_mangle]
pub extern "C" fn model_parse_hf_url(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::parse_hf_url(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Resolve HF file URL: {"repoId", "file"} → "https://...".
#[no_mangle]
pub extern "C" fn model_hf_resolve_url(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::hf_resolve_url(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Search/filter models: {"models", "query", "tier"} → filtered array.
#[no_mangle]
pub extern "C" fn model_search(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::search_models(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Download slug from name: {"name": "..."} → "slug".
#[no_mangle]
pub extern "C" fn model_download_slug(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match models::download_slug(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Soloist (Spotify) ---------- */

/// Extract display info from entity envelope: {"item": {...}} → info JSON.
#[no_mangle]
pub extern "C" fn soloist_entity_info(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match soloist::entity_info(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Interpolate playback position: {"anchor", "status", "now"} → seconds.
#[no_mangle]
pub extern "C" fn soloist_position(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match soloist::position(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Inference runtime ---------- */

/// Prepare chat messages for inference: {"messages", "modelId", "noThink", "thinking"} → array.
#[no_mangle]
pub extern "C" fn runtime_prepare_messages(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::prepare_messages(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Estimate token count from text: {"text": "..."} → {"tokens": 123}.
#[no_mangle]
pub extern "C" fn runtime_estimate_tokens(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::estimate_tokens(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Estimate total tokens across messages: {"messages": [...]} → {"tokens": 456}.
#[no_mangle]
pub extern "C" fn runtime_estimate_messages_tokens(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::estimate_messages_tokens(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Trim messages to fit context window: {"messages": [...], "maxTokens": 4096} → trimmed.
#[no_mangle]
pub extern "C" fn runtime_trim_messages_to_context(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::trim_messages_to_context(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Resolve tier or model ID to downloaded model: {"tierOrModelId", "tiers", "downloaded"} → model.
#[no_mangle]
pub extern "C" fn runtime_resolve_model(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match runtime::resolve_model(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Widget runtime ---------- */

/// Filter widget entries from tree: {"tree", "folderId"} → [{id, name}, ...].
#[no_mangle]
pub extern "C" fn widget_filter_entries(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::filter_entries(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Toggle id in enabled set: {"enabled", "id", "value"} → updated array.
#[no_mangle]
pub extern "C" fn widget_toggle_enabled(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::toggle_enabled(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/// Stale running ids: {"running", "valid"} → [stale_ids].
#[no_mangle]
pub extern "C" fn widget_stale_running_ids(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    match widget::stale_running_ids(data) {
        Some(out) => set_out(out.into_bytes()),
        None => 0,
    }
}

/* ---------- Browser compute ---------- */

/// Resolve input: {"input", "searchUrl"} → {"kind": "url"|"search", "value": "..."}.
#[no_mangle]
pub extern "C" fn browser_resolve_input(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let input_str = get(&obj, "input").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let search_url = get(&obj, "searchUrl").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let (kind, value) = browser::resolve_input(input_str, search_url);
    set_out(format!(r#"{{"kind":"{}","value":"{}"}}"#, kind, json_escape(&value)).into_bytes())
}

/// Hostname from URL: {"url": "..."} → "example.com".
#[no_mangle]
pub extern "C" fn browser_hostname(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let url = get(&obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let host = browser::hostname(url);
    set_out(format!("\"{}\"", json_escape(&host)).into_bytes())
}

/// Build proxy URL: {"url", "proxyOrigin", "backendUrl"} → "https://...".
#[no_mangle]
pub extern "C" fn browser_to_proxy_url(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let url = get(&obj, "url").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let proxy = get(&obj, "proxyOrigin").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let backend = get(&obj, "backendUrl").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::to_proxy_url(url, proxy, backend);
    set_out(format!("\"{}\"", json_escape(&result)).into_bytes())
}

/// Increment shields stats: {"stats", "ads", "trackers", "https", "scripts", "data"} → updated stats.
#[no_mangle]
pub extern "C" fn browser_stats_increment(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let stats_json = match get(&obj, "stats") { Some(Value::Str(s)) => s.clone(), _ => return 0 };
    let ads = as_num(get(&obj, "ads").unwrap_or(&Value::Num(0.0))) as u32;
    let trackers = as_num(get(&obj, "trackers").unwrap_or(&Value::Num(0.0))) as u32;
    let https = as_num(get(&obj, "https").unwrap_or(&Value::Num(0.0))) as u32;
    let scripts = as_num(get(&obj, "scripts").unwrap_or(&Value::Num(0.0))) as u32;
    let data = as_num(get(&obj, "data").unwrap_or(&Value::Num(0.0))) as u64;
    let result = browser::stats_increment(&stats_json, ads, trackers, https, scripts, data);
    set_out(result.into_bytes())
}

/// Daily reset check: {"stats", "now"} → stats (zeroed if new day).
#[no_mangle]
pub extern "C" fn browser_stats_daily_reset(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let stats_json = match get(&obj, "stats") { Some(Value::Str(s)) => s.clone(), _ => "{}".into() };
    let now = as_num(get(&obj, "now").unwrap_or(&Value::Num(0.0)));
    let result = browser::stats_daily_reset(&stats_json, now);
    set_out(result.into_bytes())
}

/// Format stat number: {"n": 1234} → "1.2K".
#[no_mangle]
pub extern "C" fn browser_format_stat_number(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let n = as_num(get(&obj, "n").unwrap_or(&Value::Num(0.0)));
    let result = browser::format_stat_number(n);
    set_out(format!("\"{}\"", result).into_bytes())
}

/// Format time saved: {"seconds": 125} → "2m 5s".
#[no_mangle]
pub extern "C" fn browser_format_time_saved(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let secs = as_num(get(&obj, "seconds").unwrap_or(&Value::Num(0.0)));
    let result = browser::format_time_saved(secs);
    set_out(format!("\"{}\"", result).into_bytes())
}

/// Build bookmark tree: {"bookmarks": [...]} → tree JSON.
#[no_mangle]
pub extern "C" fn browser_bookmark_tree(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let result = browser::bookmark_tree(std::str::from_utf8(data).unwrap_or("[]"));
    set_out(result.into_bytes())
}

/// Search bookmarks: {"bookmarks": [...], "query": "..."} → filtered array.
#[no_mangle]
pub extern "C" fn browser_bookmark_search(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let bookmarks = match get(&obj, "bookmarks") { Some(v) => { let mut s = String::new(); crate::write_json(v, &mut s); s }, _ => "[]".into() };
    let query = get(&obj, "query").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::bookmark_search(&bookmarks, query);
    set_out(result.into_bytes())
}

/// Group history entries by date: {"entries": [...], "now": 123} → grouped array.
#[no_mangle]
pub extern "C" fn browser_history_group(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let entries = match get(&obj, "entries") { Some(v) => { let mut s = String::new(); crate::write_json(v, &mut s); s }, _ => "[]".into() };
    let now = as_num(get(&obj, "now").unwrap_or(&Value::Num(0.0)));
    let result = browser::history_group(&entries, now);
    set_out(result.into_bytes())
}

/// Search history: {"entries": [...], "query": "..."} → filtered array.
#[no_mangle]
pub extern "C" fn browser_history_search(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let entries = match get(&obj, "entries") { Some(v) => { let mut s = String::new(); crate::write_json(v, &mut s); s }, _ => "[]".into() };
    let query = get(&obj, "query").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::history_search(&entries, query);
    set_out(result.into_bytes())
}

/// Rank omnibox suggestions: {"query", "history", "bookmarks", "topSites"} → ranked array.
#[no_mangle]
pub extern "C" fn browser_omnibox_rank(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let result = browser::omnibox_rank(std::str::from_utf8(data).unwrap_or("{}"));
    set_out(result.into_bytes())
}

/// Sanitize HTML: {"html": "..."} → cleaned HTML string.
#[no_mangle]
pub extern "C" fn browser_sanitize_html(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let html = get(&obj, "html").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::sanitize_html(html);
    set_out(result.into_bytes())
}

/// Slug from text: {"text": "..."} → "url-safe-slug".
#[no_mangle]
pub extern "C" fn browser_slug(ptr: u32, len: u32) -> u32 {
    let data = unsafe { input(ptr, len) };
    let obj = match Parser::new(data).value() {
        Some(Value::Obj(o)) => o,
        _ => return 0,
    };
    let text = get(&obj, "text").and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None }).unwrap_or("");
    let result = browser::slug(text);
    set_out(format!("\"{}\"", json_escape(&result)).into_bytes())
}

//! Shared ABI + JSON infrastructure for Lithium WASM modules.
//!
//! Contains the alloc/dealloc/out_ptr protocol, the JSON parser,
//! the Value enum, and all helper functions used by the cdylib crates.

extern crate alloc;

use alloc::vec::Vec;
use alloc::string::String;
use alloc::format;

// ─── MAGIC + VERSION ──────────────────────────────────────────────

pub const MAGIC: u32 = 0x4C694653; // "LiFS"
pub const VERSION: u8 = 2;

// ─── OUTPUT BUFFER ────────────────────────────────────────────────

static mut OUT_PTR: u32 = 0;

pub fn leak(bytes: Vec<u8>) -> u32 {
    let ptr = bytes.as_ptr() as u32;
    core::mem::forget(bytes);
    ptr
}

pub fn set_out(bytes: Vec<u8>) -> u32 {
    let len = bytes.len() as u32;
    let ptr = leak(bytes);
    unsafe { OUT_PTR = ptr };
    len
}

pub unsafe fn input<'a>(ptr: u32, len: u32) -> &'a [u8] {
    core::slice::from_raw_parts(ptr as *const u8, len as usize)
}

// ─── C ABI EXPORTS ────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn core_version() -> u32 {
    VERSION as u32
}

#[no_mangle]
pub extern "C" fn alloc(size: u32) -> u32 {
    let layout = core::alloc::Layout::from_size_align(size.max(1) as usize, 8).unwrap();
    unsafe { std::alloc::alloc(layout) as u32 }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: u32, size: u32) {
    if ptr == 0 { return; }
    let layout = core::alloc::Layout::from_size_align(size.max(1) as usize, 8).unwrap();
    unsafe { std::alloc::dealloc(ptr as *mut u8, layout) }
}

#[no_mangle]
pub extern "C" fn out_ptr() -> u32 {
    unsafe { OUT_PTR }
}

// ─── ENTRY RAW ────────────────────────────────────────────────────

#[derive(Default, Clone)]
pub struct EntryRaw {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub parentId: Option<String>,
    pub content: Option<String>,
    pub size: f64,
    pub createdAt: f64,
    pub updatedAt: f64,
    pub idb: bool,
    pub blobRef: Option<String>,
    pub reference: Option<String>,
}

// ─── VALUE ENUM ───────────────────────────────────────────────────

#[derive(Clone)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

// ─── JSON PARSER ──────────────────────────────────────────────────

pub struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    pub fn new(b: &'a [u8]) -> Self {
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

    pub fn value(&mut self) -> Option<Value> {
        self.ws();
        match self.peek()? {
            b'{' => self.object(),
            b'[' => self.array(),
            b'"' => Some(Value::Str(self.string()?)),
            b't' => { self.lit("true")?; Some(Value::Bool(true)) }
            b'f' => { self.lit("false")?; Some(Value::Bool(false)) }
            b'n' => { self.lit("null")?; Some(Value::Null) }
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
        core::str::from_utf8(&self.b[start..self.i]).ok()?.parse::<f64>().ok().map(Value::Num)
    }

    fn string(&mut self) -> Option<String> {
        if !self.eat(b'"') { return None; }
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
                            if self.i + 4 > self.b.len() { return None; }
                            let hex = core::str::from_utf8(&self.b[self.i..self.i + 4]).ok()?;
                            let code = u32::from_str_radix(hex, 16).ok()?;
                            self.i += 4;
                            out.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
                        }
                        _ => return None,
                    }
                }
                _ => {
                    let start = self.i - 1;
                    let extra = if c >= 0xF0 { 3 } else if c >= 0xE0 { 2 } else if c >= 0xC0 { 1 } else { 0 };
                    if self.i + extra > self.b.len() { return None; }
                    let s = core::str::from_utf8(&self.b[start..self.i + extra]).ok()?;
                    out.push_str(s);
                    self.i += extra;
                }
            }
        }
    }

    fn array(&mut self) -> Option<Value> {
        if !self.eat(b'[') { return None; }
        let mut items = Vec::new();
        self.ws();
        if self.eat(b']') { return Some(Value::Arr(items)); }
        loop {
            items.push(self.value()?);
            self.ws();
            if self.eat(b',') { continue; }
            if self.eat(b']') { return Some(Value::Arr(items)); }
            return None;
        }
    }

    fn object(&mut self) -> Option<Value> {
        if !self.eat(b'{') { return None; }
        let mut pairs = Vec::new();
        self.ws();
        if self.eat(b'}') { return Some(Value::Obj(pairs)); }
        loop {
            self.ws();
            let key = self.string()?;
            self.ws();
            if !self.eat(b':') { return None; }
            let val = self.value()?;
            pairs.push((key, val));
            self.ws();
            if self.eat(b',') { continue; }
            if self.eat(b'}') { return Some(Value::Obj(pairs)); }
            return None;
        }
    }
}

// ─── JSON HELPERS ─────────────────────────────────────────────────

pub fn get<'v>(obj: &'v [(String, Value)], key: &str) -> Option<&'v Value> {
    obj.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

pub fn as_num(v: &Value) -> f64 {
    match v {
        Value::Num(n) => *n,
        _ => 0.0,
    }
}

pub fn as_bool(v: &Value) -> bool {
    matches!(v, Value::Bool(true))
}

pub fn json_escape(s: &str) -> String {
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

pub fn num_json(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 9.0e15 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

pub fn write_json(v: &Value, out: &mut String) {
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
                if idx > 0 { out.push(','); }
                write_json(item, out);
            }
            out.push(']');
        }
        Value::Obj(pairs) => {
            out.push('{');
            for (idx, (key, val)) in pairs.iter().enumerate() {
                if idx > 0 { out.push(','); }
                out.push('"');
                out.push_str(&json_escape(key));
                out.push_str("\":");
                write_json(val, out);
            }
            out.push('}');
        }
    }
}

//! TAR archive engine — header construction, checksum computation,
//! stream assembly, and header parsing.
//!
//! Pure computation over byte slices; no browser-API dependencies.
//! JS owns I/O (IndexedDB blobs, CompressionStream gzip, Blob construction).
//!
//! TAR format: POSIX/USTAR with 512-byte blocks.
//! This module handles the CPU-intensive parts:
//!  - Building 512-byte headers with octal fields and checksums
//!  - Assembling the padded tar stream
//!  - Parsing headers and extracting entries

use crate::{get, Parser, Value};

const BLOCK: usize = 512;

/* ---------- Base64 (for binary data ↔ JSON transport) ---------- */

const B64_ENC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = (data[i] as u32) << 16 | (data[i + 1] as u32) << 8 | data[i + 2] as u32;
        out.push(B64_ENC[(n >> 18 & 63) as usize] as char);
        out.push(B64_ENC[(n >> 12 & 63) as usize] as char);
        out.push(B64_ENC[(n >> 6 & 63) as usize] as char);
        out.push(B64_ENC[(n & 63) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(B64_ENC[(n >> 18 & 63) as usize] as char);
        out.push(B64_ENC[(n >> 12 & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = (data[i] as u32) << 16 | (data[i + 1] as u32) << 8;
        out.push(B64_ENC[(n >> 18 & 63) as usize] as char);
        out.push(B64_ENC[(n >> 12 & 63) as usize] as char);
        out.push(B64_ENC[(n >> 6 & 63) as usize] as char);
        out.push('=');
    }
    out
}

fn b64_val(c: u8) -> u32 {
    match c {
        b'A'..=b'Z' => (c - b'A') as u32,
        b'a'..=b'z' => (c - b'a' + 26) as u32,
        b'0'..=b'9' => (c - b'0' + 52) as u32,
        b'+' => 62,
        b'/' => 63,
        _ => 0,
    }
}

fn base64_decode(s: &str) -> Vec<u8> {
    let bytes: Vec<u8> = s.bytes().filter(|&b| b != b'=' && b != b'\n' && b != b'\r').collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let n = b64_val(bytes[i]) << 18
            | b64_val(bytes[i + 1]) << 12
            | b64_val(bytes[i + 2]) << 6
            | b64_val(bytes[i + 3]);
        out.push((n >> 16 & 0xFF) as u8);
        out.push((n >> 8 & 0xFF) as u8);
        out.push((n & 0xFF) as u8);
        i += 4;
    }
    let rem = bytes.len() - i;
    if rem == 2 {
        let n = b64_val(bytes[i]) << 18 | b64_val(bytes[i + 1]) << 12;
        out.push((n >> 16 & 0xFF) as u8);
    } else if rem == 3 {
        let n = b64_val(bytes[i]) << 18 | b64_val(bytes[i + 1]) << 12 | b64_val(bytes[i + 2]) << 6;
        out.push((n >> 16 & 0xFF) as u8);
        out.push((n >> 8 & 0xFF) as u8);
    }
    out
}

/* ---------- TAR header construction ---------- */

/// Write a string into a byte buffer at a given offset (no null terminator).
fn write_str(buf: &mut [u8], offset: usize, s: &str) {
    let bytes = s.as_bytes();
    let len = bytes.len().min(buf.len() - offset);
    buf[offset..offset + len].copy_from_slice(&bytes[..len]);
}

/// Build a 512-byte USTAR header for a regular file.
fn tar_header(name: &str, size: usize) -> [u8; BLOCK] {
    let mut buf = [0u8; BLOCK];

    write_str(&mut buf, 0, name);                          // name      0..100
    write_str(&mut buf, 100, "0000644\0");                 // mode
    write_str(&mut buf, 108, "0001000\0");                 // uid
    write_str(&mut buf, 116, "0001000\0");                 // gid
    write_str(&mut buf, 124, &format!("{:011o}", size));   // size
    let mtime = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    write_str(&mut buf, 136, &format!("{:011o}", mtime));  // mtime
    write_str(&mut buf, 148, "        ");                  // checksum placeholder (8 spaces)
    buf[156] = b'0';                                       // typeflag (regular file)
    write_str(&mut buf, 257, "ustar\0");                   // magic
    write_str(&mut buf, 263, "00");                        // version

    // Compute header checksum (sum of all 512 bytes as u8)
    let cksum: u32 = buf.iter().map(|&b| b as u32).sum();
    write_str(&mut buf, 148, &format!("{:06o}\0 ", cksum));

    buf
}

/// Padding bytes needed to align `size` to the next 512-byte block boundary.
fn pad_size(size: usize) -> usize {
    let rem = size % BLOCK;
    if rem == 0 { 0 } else { BLOCK - rem }
}

/* ---------- Public API ---------- */

/// Build a TAR stream from a list of named entries.
///
/// Input JSON: `{"entries": [{"name": "path/to/file", "data_b64": "base64..."}]}`
/// Returns raw TAR bytes (not gzipped — JS handles the gzip layer).
pub fn build_tar(input: &[u8]) -> Option<Vec<u8>> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let entries_val = get(&obj, "entries")?;
    let Value::Arr(items) = entries_val else { return None };

    // Decode entries from JSON
    struct Entry {
        name: String,
        data: Vec<u8>,
    }

    let mut entries: Vec<Entry> = Vec::with_capacity(items.len());
    for item in items {
        let Value::Obj(e) = item else { continue };
        let name = match get(e, "name") {
            Some(Value::Str(s)) => s.clone(),
            _ => continue,
        };
        let data_b64 = match get(e, "data_b64") {
            Some(Value::Str(s)) => s.as_str(),
            _ => "",
        };
        entries.push(Entry {
            name,
            data: base64_decode(data_b64),
        });
    }

    // Calculate total size upfront
    let mut total: usize = 0;
    for entry in &entries {
        total += BLOCK + entry.data.len() + pad_size(entry.data.len());
    }
    total += BLOCK * 2; // end-of-archive marker (two zero blocks)

    // Assemble TAR stream
    let mut tar = Vec::with_capacity(total);

    for entry in &entries {
        tar.extend_from_slice(&tar_header(&entry.name, entry.data.len()));
        tar.extend_from_slice(&entry.data);
        tar.extend(std::iter::repeat(0u8).take(pad_size(entry.data.len())));
    }

    // End-of-archive: two 512-byte zero blocks
    tar.extend(std::iter::repeat(0u8).take(BLOCK * 2));

    Some(tar)
}

/// Parse a TAR stream into a list of file entries.
///
/// Input: raw TAR bytes (not gzipped — JS handles gzip decompression).
/// Returns JSON: `{"files": [{"name": "...", "data_b64": "..."}], "count": N}`
pub fn parse_tar(data: &[u8]) -> Option<String> {
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut pos = 0;

    while pos + BLOCK <= data.len() {
        let header = &data[pos..pos + BLOCK];

        // End-of-archive: all-zero block
        if header.iter().all(|&b| b == 0) {
            break;
        }

        // Read null-terminated C string from a header field
        let read_cstr = |start: usize, end: usize| -> String {
            let mut s = String::new();
            for i in start..end.min(header.len()) {
                if header[i] == 0 { break; }
                s.push(header[i] as char);
            }
            s
        };

        let name = read_cstr(0, 100);
        let size_str = read_cstr(124, 136);
        let size = usize::from_str_radix(size_str.trim(), 8).unwrap_or(0);
        let typeflag = header[156] as char;

        pos += BLOCK;

        if (typeflag == '0' || typeflag == '\0') && size > 0 && pos + size <= data.len() {
            files.push((name, data[pos..pos + size].to_vec()));
        }

        pos += size + pad_size(size);
    }

    // Build JSON output with base64-encoded file data
    let mut out = String::from("{\"files\":[");
    for (i, (name, data)) in files.iter().enumerate() {
        if i > 0 { out.push(','); }
        out.push_str("{\"name\":\"");
        out.push_str(&crate::json_escape(name));
        out.push_str("\",\"data_b64\":\"");
        out.push_str(&base64_encode(data));
        out.push_str("\"}");
    }
    out.push_str("],\"count\":");
    out.push_str(&files.len().to_string());
    out.push('}');

    Some(out)
}

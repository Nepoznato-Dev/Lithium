//! TAR — build and parse TAR archives (pure Rust).
//! Ported from coreNative.js lines 1032-1097.

use serde::{Deserialize, Serialize};
use base64::Engine as _;

const TAR_BLOCK: usize = 512;

fn tar_header(name: &str, size: usize, mtime: u64) -> [u8; TAR_BLOCK] {
    let mut buf = [0u8; TAR_BLOCK];
    // name (0..100)
    let name_bytes = name.as_bytes();
    let copy_len = name_bytes.len().min(100);
    buf[..copy_len].copy_from_slice(&name_bytes[..copy_len]);
    // mode (100..108)
    buf[100..107].copy_from_slice(b"0000644");
    buf[107] = 0;
    // uid (108..116)
    buf[108..115].copy_from_slice(b"0001000");
    buf[115] = 0;
    // gid (116..124)
    buf[116..123].copy_from_slice(b"0001000");
    buf[123] = 0;
    // size (124..136) — octal, zero-padded
    let size_str = format!("{:011o}", size);
    buf[124..135].copy_from_slice(size_str.as_bytes());
    buf[135] = 0;
    // mtime (136..148)
    let mtime_str = format!("{:011o}", mtime);
    let mtime_bytes = mtime_str.as_bytes();
    let mlen = mtime_bytes.len().min(12);
    buf[136..136 + mlen].copy_from_slice(&mtime_bytes[..mlen]);
    buf[147] = 0;
    // checksum placeholder (148..156) — spaces
    buf[148..156].copy_from_slice(b"        ");
    // typeflag (156)
    buf[156] = b'0';
    // magic (257..263)
    buf[257..262].copy_from_slice(b"ustar");
    buf[262] = 0;
    // version (263..265)
    buf[263..265].copy_from_slice(b"00");
    // compute checksum
    let cksum: u32 = buf.iter().map(|&b| b as u32).sum();
    let cksum_str = format!("{:06o}\0 ", cksum);
    buf[148..156].copy_from_slice(cksum_str.as_bytes());
    buf
}

fn tar_pad(size: usize) -> usize {
    let r = size % TAR_BLOCK;
    if r == 0 { 0 } else { TAR_BLOCK - r }
}

#[derive(Deserialize)]
pub struct TarEntry {
    pub name: String,
    #[serde(default)]
    pub data: Vec<u8>,
}

pub fn build(entries: &[TarEntry]) -> Vec<u8> {
    let mtime = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut result = Vec::new();
    for e in entries {
        let header = tar_header(&e.name, e.data.len(), mtime);
        result.extend_from_slice(&header);
        result.extend_from_slice(&e.data);
        let pad = tar_pad(e.data.len());
        if pad > 0 { result.extend_from_slice(&vec![0u8; pad]); }
    }
    // Two empty blocks at end
    result.extend_from_slice(&vec![0u8; TAR_BLOCK * 2]);
    result
}

fn read_cstring(buf: &[u8], start: usize, end: usize) -> String {
    let slice = &buf[start..end.min(buf.len())];
    let nul = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    String::from_utf8_lossy(&slice[..nul]).to_string()
}

#[derive(Serialize)]
pub struct ParsedFile {
    pub name: String,
    pub data_b64: String,
}

#[derive(Serialize)]
pub struct ParsedTar {
    pub files: Vec<ParsedFile>,
    pub count: usize,
}

pub fn parse(tar_bytes: &[u8]) -> Option<ParsedTar> {
    let mut files = Vec::new();
    let mut pos = 0;
    while pos + TAR_BLOCK <= tar_bytes.len() {
        let header = &tar_bytes[pos..pos + TAR_BLOCK];
        if header.iter().all(|&b| b == 0) { break; }
        let name = read_cstring(header, 0, 100);
        let size_str = read_cstring(header, 124, 136);
        let size = usize::from_str_radix(size_str.trim(), 8).unwrap_or(0);
        let typeflag = header[156] as char;
        pos += TAR_BLOCK;
        if (typeflag == '0' || typeflag == '\0') && size > 0 && pos + size <= tar_bytes.len() {
            let data = &tar_bytes[pos..pos + size];
            let data_b64 = base64::engine::general_purpose::STANDARD.encode(data);
            files.push(ParsedFile { name, data_b64 });
        }
        pos += size + tar_pad(size);
    }
    Some(ParsedTar { count: files.len(), files })
}

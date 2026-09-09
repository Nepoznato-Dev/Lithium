//! Lithium LZ4 compression WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

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

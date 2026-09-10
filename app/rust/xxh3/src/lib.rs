//! Lithium xxh3 hashing WASM module.

#![allow(non_snake_case)]

pub use lithium_abi::*;

#[no_mangle]
pub extern "C" fn xxh3(ptr: u32, len: u32) -> u64 {
    let data = unsafe { input(ptr, len) };
    xxhash_rust::xxh3::xxh3_64(data)
}

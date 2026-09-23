/**
 * CPU-bound WASM compute primitives (lz4 / xxh3 / snapshot_codec).
 *
 * Single source of truth shared by BOTH the compute worker (where these run
 * off the UI thread) and the main-thread fallback in compute.js (used only if
 * the worker cannot be constructed). Each op lazily loads its WASM module via
 * coreHelpers, so importing this file costs nothing until an op runs.
 *
 * These helpers are safe to evaluate in a Worker realm: `_loadModule` is pure
 * fetch + WebAssembly.instantiate and the module cache is per-realm.
 */
import { toWasm, mem, loadModule, dealloc } from './coreHelpers';

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/** LZ4-compress (size-prepended container). Returns Uint8Array or null. */
export async function wasmCompress(u8) {
  const wasm = await loadModule('lz4');
  if (!wasm) return null;
  const ptr = toWasm(u8, 'lz4');
  const len = wasm.lz4_compress(ptr, u8.length);
  dealloc(ptr, u8.length, 'lz4');
  if (!len) return null;
  const outPtr = wasm.out_ptr();
  const result = mem('lz4').slice(outPtr, outPtr + len);
  dealloc(outPtr, len, 'lz4');
  return result;
}

/** Decompress a container produced by wasmCompress. */
export async function wasmDecompress(u8) {
  const wasm = await loadModule('lz4');
  if (!wasm) return null;
  const inPtr = toWasm(u8, 'lz4');
  const orig = wasm.lz4_uncompressed_size(inPtr, u8.length);
  if (!orig) { dealloc(inPtr, u8.length, 'lz4'); return null; }
  const outPtr = wasm.alloc(orig);
  const written = wasm.lz4_decompress_into(inPtr, u8.length, outPtr, orig);
  dealloc(inPtr, u8.length, 'lz4');
  if (!written) { dealloc(outPtr, orig, 'lz4'); return null; }
  const result = mem('lz4').slice(outPtr, outPtr + written);
  dealloc(outPtr, orig, 'lz4');
  return result;
}

/** xxh3-64 integrity hash as a hex string. */
export async function wasmHash(u8) {
  const wasm = await loadModule('xxh3');
  if (!wasm) return null;
  const ptr = toWasm(u8, 'xxh3');
  const value = wasm.xxh3(ptr, u8.length);
  dealloc(ptr, u8.length, 'xxh3');
  return BigInt.asUintN(64, value).toString(16).padStart(16, '0');
}

/** JSON (entries array) → binary snapshot bytes (Uint8Array). */
export async function snapshotEncode(jsonString) {
  const wasm = await loadModule('snapshot_codec');
  if (!wasm) return null;
  const bytes = _enc.encode(jsonString);
  const ptr = toWasm(bytes, 'snapshot_codec');
  const len = wasm.snapshot_encode(ptr, bytes.length);
  dealloc(ptr, bytes.length, 'snapshot_codec');
  if (!len) return null;
  const outPtr = wasm.out_ptr();
  // NB: snapshot_codec hands its result back through lithium-abi::leak(), which
  // stores a Vec deliberately forgotten with core::mem::forget — its capacity
  // (the writer's 64 KiB reserve) is larger than `len`, so calling dealloc with
  // a length-sized layout is undefined behaviour and traps the whole instance
  // with `unreachable`. The out buffer is therefore never freed here; only the
  // input allocation above (made with our own exact-size alloc) is.
  return mem('snapshot_codec').slice(outPtr, outPtr + len);
}

/** Binary snapshot → JSON string. */
export async function snapshotDecode(bin) {
  const wasm = await loadModule('snapshot_codec');
  if (!wasm) return null;
  const ptr = toWasm(bin, 'snapshot_codec');
  const len = wasm.snapshot_decode(ptr, bin.length);
  dealloc(ptr, bin.length, 'snapshot_codec');
  if (!len) return null;
  const outPtr = wasm.out_ptr();
  // Same leaked-Vec contract as snapshotEncode — read, never dealloc.
  return _dec.decode(mem('snapshot_codec').slice(outPtr, outPtr + len));
}

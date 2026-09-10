/**
 * JS facade over the Lithium WASM core.
 *
 * CPU-intensive operations use 4 WASM modules (filesystem, snapshot_codec, lz4, xxh3).
 * All other functionality has been inlined at call sites.
 *
 * Helpers (coreReady, hasWasm, wasmStatus, loadModule)
 * live in coreHelpers.js — this file re-exports them for backward compat.
 */

export { coreReady, hasWasm, wasmStatus, loadModule } from './coreHelpers';
import { toWasm, fromOut, mem, getM, loadModule, dealloc } from './coreHelpers';

const _enc = new TextEncoder();
const _dec = new TextDecoder();



/* ================================================================
   WASM dispatch table — only filesystem (fs + explorer)
   All other modules use native JS above.
   ================================================================ */

const _D = {
  // Filesystem → filesystem (WASM — large tree manipulation)
  fsOpSync:                  ['fs_op',               'json', 'filesystem'],
  explorerOpSync:            ['explorer_op',         'json', 'filesystem'],
};

/* ---------- generic WASM dispatcher ---------- */

function _call(name, input) {
  const entry = _D[name];
  if (!entry) return null;
  const [wasmFn, ret, mod] = entry;
  const exp = getM(mod);
  if (!exp) return null;
  const fn = exp[wasmFn];
  if (!fn) return null;

  let ptr, len;
  if (name.includes('Bytes')) {
    ptr = toWasm(input, mod);
    len = input.length;
  } else {
    const bytes = _enc.encode(JSON.stringify(input));
    ptr = toWasm(bytes, mod);
    len = bytes.length;
  }

  const out = fn(ptr, len);
  dealloc(ptr, len, mod);

  switch (ret) {
    case 'bytes': {
      if (!out) return null;
      const result = fromOut(out, mod);
      dealloc(exp.out_ptr(), out, mod);
      return result;
    }
    case 'int': { return out; }
    case 'str': {
      if (!out) return null;
      const outPtr = exp.out_ptr();
      const result = _dec.decode(mem(mod).slice(outPtr, outPtr + out));
      dealloc(outPtr, out, mod);
      return result;
    }
    default: {
      if (!out) return null;
      const outPtr = exp.out_ptr();
      const text = _dec.decode(mem(mod).slice(outPtr, outPtr + out));
      dealloc(outPtr, out, mod);
      try { return JSON.parse(text); } catch { return null; }
    }
  }
}

/* ---------- Filesystem (WASM) ---------- */

export function fsOpSync(request) { return _call('fsOpSync', request); }
export function explorerOpSync(request) { return _call('explorerOpSync', request); }

/* ================================================================
   Async facades — WASM modules (lz4, xxh3, snapshot_codec)
   ================================================================ */

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

/** JSON (entries array) → binary snapshot. */
export async function snapshotEncode(jsonString) {
  const wasm = await loadModule('snapshot_codec');
  if (!wasm) return null;
  const bytes = _enc.encode(jsonString);
  const ptr = toWasm(bytes, 'snapshot_codec');
  const len = wasm.snapshot_encode(ptr, bytes.length);
  dealloc(ptr, bytes.length, 'snapshot_codec');
  if (!len) return null;
  const outPtr = wasm.out_ptr();
  const result = mem('snapshot_codec').slice(outPtr, outPtr + len);
  dealloc(outPtr, len, 'snapshot_codec');
  return result;
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
  const result = _dec.decode(mem('snapshot_codec').slice(outPtr, outPtr + len));
  dealloc(outPtr, len, 'snapshot_codec');
  return result;
}



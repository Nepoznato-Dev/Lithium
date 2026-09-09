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
import { toWasm, fromOut, mem, getM, loadModule } from './coreHelpers';



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
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    ptr = toWasm(bytes, mod);
    len = bytes.length;
  }

  const out = fn(ptr, len);

  switch (ret) {
    case 'bytes': { return out ? fromOut(out, mod) : null; }
    case 'int': { return out; }
    case 'str': { return out ? new TextDecoder().decode(fromOut(out, mod)) : null; }
    default: {
      if (!out) return null;
      const text = new TextDecoder().decode(fromOut(out, mod));
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
  const len = wasm.lz4_compress(toWasm(u8, 'lz4'), u8.length);
  return len ? fromOut(len, 'lz4') : null;
}

/** Decompress a container produced by wasmCompress. */
export async function wasmDecompress(u8) {
  const wasm = await loadModule('lz4');
  if (!wasm) return null;
  const inPtr = toWasm(u8, 'lz4');
  const orig = wasm.lz4_uncompressed_size(inPtr, u8.length);
  if (!orig) return null;
  const outPtr = wasm.alloc(orig);
  const written = wasm.lz4_decompress_into(inPtr, u8.length, outPtr, orig);
  if (!written) return null;
  return mem('lz4').slice(outPtr, outPtr + written);
}

/** xxh3-64 integrity hash as a hex string. */
export async function wasmHash(u8) {
  const wasm = await loadModule('xxh3');
  if (!wasm) return null;
  const value = wasm.xxh3(toWasm(u8, 'xxh3'), u8.length);
  return BigInt.asUintN(64, value).toString(16).padStart(16, '0');
}

/** JSON (entries array) → binary snapshot. */
export async function snapshotEncode(jsonString) {
  const wasm = await loadModule('snapshot_codec');
  if (!wasm) return null;
  const bytes = new TextEncoder().encode(jsonString);
  const len = wasm.snapshot_encode(toWasm(bytes, 'snapshot_codec'), bytes.length);
  return len ? fromOut(len, 'snapshot_codec') : null;
}

/** Binary snapshot → JSON string. */
export async function snapshotDecode(bin) {
  const wasm = await loadModule('snapshot_codec');
  if (!wasm) return null;
  const len = wasm.snapshot_decode(toWasm(bin, 'snapshot_codec'), bin.length);
  return len ? new TextDecoder().decode(fromOut(len, 'snapshot_codec')) : null;
}



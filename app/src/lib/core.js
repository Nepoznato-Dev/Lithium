/**
 * JS facade over the Lithium WASM core.
 *
 * The synchronous filesystem/explorer ops run against the `filesystem` WASM
 * module on this thread. All CPU-heavy compute — lz4, xxh3, snapshot_codec
 * and the archive byte-math — is offloaded to the shared compute Web Worker
 * via compute.js (with a main-thread fallback inside that façade).
 *
 * Helpers (coreReady, hasWasm, wasmStatus, loadModule)
 * live in coreHelpers.js — this file re-exports them for backward compat.
 */

export { coreReady, hasWasm, wasmStatus, loadModule } from './coreHelpers';
import { toWasm, fromOut, mem, getM, dealloc } from './coreHelpers';
import { computeCall } from './compute';

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
   Async compute facades — delegated to the compute Web Worker
   (lz4, xxh3, snapshot_codec). Signatures unchanged: each resolves
   with the same value the in-thread implementation produced, or
   null when the underlying module is unavailable.
   ================================================================ */

/** LZ4-compress (size-prepended container). Returns Uint8Array or null. */
export function wasmCompress(u8) {
  return computeCall('lz4.compress', { data: u8 }).catch(() => null);
}

/** Decompress a container produced by wasmCompress. */
export function wasmDecompress(u8) {
  return computeCall('lz4.decompress', { data: u8 }).catch(() => null);
}

/** xxh3-64 integrity hash as a hex string. */
export function wasmHash(u8) {
  return computeCall('xxh3.hash', { data: u8 }).catch(() => null);
}

/** JSON (entries array) → binary snapshot. */
export function snapshotEncode(jsonString) {
  return computeCall('snap.encode', { json: jsonString }).catch(() => null);
}

/** Binary snapshot → JSON string. */
export function snapshotDecode(bin) {
  return computeCall('snap.decode', { data: bin }).catch(() => null);
}



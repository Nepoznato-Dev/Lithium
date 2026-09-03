/**
 * Shared helpers for the lithium-core WASM facade.
 * Imported by core.js to build compact one-liner wrappers.
 */

let exportsRef = null;
let readyPromise = null;

export function coreReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const response = await fetch(new URL('../wasm/lithium_core.wasm', import.meta.url));
        if (!response.ok) throw new Error(`wasm fetch ${response.status}`);
        const bytes = await response.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        exportsRef = instance.exports;
        const fnCount = Object.keys(exportsRef).filter(k => typeof exportsRef[k] === 'function').length;
        if (import.meta.env.DEV) console.log(`[lithium-core] WASM loaded — ${fnCount} native functions available`);
      } catch (err) {
        exportsRef = null;
        if (import.meta.env.DEV) console.warn('[lithium-core] WASM unavailable:', err.message || err);
      }
      return exportsRef;
    })();
  }
  return readyPromise;
}

export function hasWasm() {
  return Boolean(exportsRef);
}

/** Diagnostic: returns a summary of WASM status for browser console debugging. */
export function wasmStatus() {
  if (!exportsRef) return { wasm: false, functions: [] };
  const fns = Object.keys(exportsRef).filter(k => typeof exportsRef[k] === 'function');
  return { wasm: true, functions: fns, memory: `${(exportsRef.memory.buffer.byteLength / 1024).toFixed(0)} KB` };
}

export const mem = () => new Uint8Array(getE().memory.buffer);

/** Return the live WASM exports object (null if not loaded). */
export const getE = () => exportsRef;

/** Run a WASM call with graceful null-return when exports aren't ready. */
export const safe = (fn) => {
  if (!exportsRef) return null;
  return fn();
};

export function toWasm(u8) {
  const ptr = exportsRef.alloc(u8.length);
  mem().set(u8, ptr);
  return ptr;
}

export function fromOut(len) {
  const ptr = exportsRef.out_ptr();
  return mem().slice(ptr, ptr + len);
}

/** Encode text → WASM, call fn(bytes, len), decode output as UTF-8 string. */
export function callStr(fn, text) {
  const bytes = new TextEncoder().encode(text);
  const len = fn(toWasm(bytes), bytes.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}

/**
 * Shared helpers for the Lithium WASM facade.
 *
 * Only 4 CPU-intensive WASM modules are loaded:
 *   Boot (eager):   filesystem, snapshot_codec
 *   Lazy:           lz4, xxh3
 *
 * All other functionality (settings, browser, AI, shell, etc.)
 * is implemented as pure JS in coreNative.js — zero download cost.
 */

const _MODULE_NAMES = ['filesystem', 'snapshot_codec', 'lz4', 'xxh3'];
const _BOOT_MODULES = ['filesystem', 'snapshot_codec'];

const _modules = {};
let _bootPromise = null;
let _bootReady = false;
const _modulePromises = {};

async function _loadModule(name) {
  if (_modules[name]) return _modules[name];
  if (_modulePromises[name]) return _modulePromises[name];

  _modulePromises[name] = (async () => {
    try {
      const response = await fetch(new URL(`../wasm/${name}.wasm`, import.meta.url));
      if (!response.ok) throw new Error(`wasm fetch ${response.status}`);
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      _modules[name] = instance.exports;
      const fnCount = Object.keys(_modules[name]).filter(k => typeof _modules[name][k] === 'function').length;
      if (import.meta.env.DEV) console.log(`[lithium-core] ${name}.wasm loaded — ${fnCount} native functions`);
      return _modules[name];
    } catch (err) {
      _modules[name] = null;
      if (import.meta.env.DEV) console.warn(`[lithium-core] ${name}.wasm unavailable:`, err.message || err);
      return null;
    }
  })();
  return _modulePromises[name];
}

/** Load boot WASM modules (called eagerly at startup). */
export function coreReady() {
  if (!_bootPromise) {
    _bootPromise = Promise.all(_BOOT_MODULES.map(m => _loadModule(m))).then(() => {
      _bootReady = true;
      return _modules;
    });
  }
  return _bootPromise;
}

/** Load a named WASM module on demand. Returns the module's exports. */
export function loadModule(name) {
  return _loadModule(name);
}

export function hasWasm() {
  return _bootReady;
}

/** Diagnostic: returns a summary of all WASM module statuses. */
export function wasmStatus() {
  const result = { modules: {} };
  for (const name of _MODULE_NAMES) {
    const exp = _modules[name];
    if (exp) {
      const fns = Object.keys(exp).filter(k => typeof exp[k] === 'function');
      result.modules[name] = { loaded: true, functions: fns, memory: `${(exp.memory.buffer.byteLength / 1024).toFixed(0)} KB` };
    } else {
      result.modules[name] = { loaded: false };
    }
  }
  result.wasm = _bootReady;
  return result;
}

/** Get Uint8Array view of a module's linear memory. */
export const mem = (mod) => new Uint8Array(getM(mod).memory.buffer);

/** Return the filesystem module exports (primary boot module). */
export const getE = () => _modules.filesystem;
export const getM = (name) => _modules[name];

/** Run a WASM call with graceful null-return when boot modules aren't ready. */
export const safe = (fn) => {
  if (!_bootReady) return null;
  return fn();
};

/** Write bytes into a module's memory and return the pointer.
 *  Grows linear memory automatically when the allocator cannot fit the data. */
export function toWasm(u8, mod) {
  const exp = _modules[mod];
  const needed = u8.length;
  const m = exp.memory;
  // Pre-grow if the current buffer is clearly too small for the payload.
  const currentBytes = m.buffer.byteLength;
  if (needed > currentBytes - 64) {
    const pages = Math.ceil((needed + 64) / 65536);
    m.grow(pages);
  }
  let ptr = exp.alloc(needed);
  let view = new Uint8Array(m.buffer);
  // If the allocator returned a pointer beyond the current view, grow and retry.
  if (ptr + needed > view.byteLength) {
    const pages = Math.ceil((ptr + needed - view.byteLength + 64) / 65536);
    m.grow(pages);
    view = new Uint8Array(m.buffer);
    if (ptr + needed > view.byteLength) {
      // Allocator failed — force-grow from zero and re-allocate.
      m.grow(Math.ceil((needed + 64) / 65536));
      ptr = exp.alloc(needed);
      view = new Uint8Array(m.buffer);
    }
  }
  view.set(u8, ptr);
  return ptr;
}

/** Read output bytes from a module's out_ptr. */
export function fromOut(len, mod) {
  const exp = _modules[mod];
  const ptr = exp.out_ptr();
  return mem(mod).slice(ptr, ptr + len);
}

/** Encode text → WASM, call fn(bytes, len), decode output as UTF-8 string. */
export function callStr(fn, text, mod) {
  const bytes = new TextEncoder().encode(text);
  const len = fn(toWasm(bytes, mod), bytes.length);
  return len ? new TextDecoder().decode(fromOut(len, mod)) : null;
}

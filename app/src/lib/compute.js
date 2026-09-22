/**
 * Compute façade — one shared module Web Worker running the CPU-heavy WASM
 * (lz4 / xxh3 / snapshot_codec) and archive byte-math (fflate) off the UI
 * thread.
 *
 *   main thread                    worker
 *   ───────────                    ──────
 *   computeCall(op, payload) ───▶  OPS[op](payload)
 *   promise ◀───────────────────   { id, ok, result }   (buffers transferred)
 *
 * The worker is created lazily on the first call, so nothing spawns unless a
 * compute op actually runs. If the worker cannot be constructed at all, the
 * WASM ops fall back to the very same primitives executed on the main thread
 * (computeWasmOps → coreHelpers), mirroring the project's graceful-degradation
 * style: hashing/compression stay available, they just don't get offloaded.
 * Archive ops have no main-thread fallback by design — fflate lives only in
 * the worker chunk, so they reject and callers surface an error instead.
 */
import * as wasmOps from './computeWasmOps';

/** Ops that can run on the main thread when no worker is available. */
const _MAIN_THREAD_FALLBACKS = {
  'lz4.compress': (p) => wasmOps.wasmCompress(p.data),
  'lz4.decompress': (p) => wasmOps.wasmDecompress(p.data),
  'xxh3.hash': (p) => wasmOps.wasmHash(p.data),
  'snap.encode': (p) => wasmOps.snapshotEncode(p.json),
  'snap.decode': (p) => wasmOps.snapshotDecode(p.data),
};

let _worker = null;
let _workerBroken = false;
let _seq = 0;
const _pending = new Map();

function _failAll(message) {
  for (const { reject } of _pending.values()) reject(new Error(message));
  _pending.clear();
}

function _ensureWorker() {
  if (_worker || _workerBroken) return _worker;
  try {
    _worker = new Worker(new URL('./workers/compute.worker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data || {};
      const settle = _pending.get(id);
      if (!settle) return;
      _pending.delete(id);
      if (ok) settle.resolve(result ?? null);
      else settle.reject(new Error(error || 'compute failed'));
    };
    _worker.onerror = (event) => {
      // Module resolution or an uncaught worker error — degrade permanently.
      if (import.meta.env.DEV) console.warn('[lithium-compute] worker error:', event.message);
      _workerBroken = true;
      try { _worker.terminate(); } catch { /* already dead */ }
      _worker = null;
      _failAll('compute worker unavailable');
    };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[lithium-compute] worker construction failed:', err.message || err);
    _workerBroken = true;
    _worker = null;
  }
  return _worker;
}

/**
 * Run a compute op. Resolves with the worker's result (bytes arrive
 * transferred, not copied); rejects when the op fails or no worker is
 * available for worker-only ops.
 * @param {string} op  e.g. 'lz4.compress' | 'archive.zipBuild'
 * @param {object} [payload]
 */
export function computeCall(op, payload) {
  const worker = _ensureWorker();
  if (!worker) {
    const fallback = _MAIN_THREAD_FALLBACKS[op];
    if (!fallback) return Promise.reject(new Error(`compute worker unavailable (op: ${op})`));
    return Promise.resolve().then(() => fallback(payload || {}));
  }
  return new Promise((resolve, reject) => {
    const id = ++_seq;
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, payload: payload || {} });
  });
}

/** True once the worker is known to be unusable (main-thread degradation). */
export function computeDegraded() {
  return _workerBroken;
}

/**
 * Resolve when the compute layer is up (worker constructed, or degradation
 * decided). Never rejects — safe to `await` before a batch of calls.
 */
export function computeReady() {
  return Promise.resolve().then(() => {
    _ensureWorker();
    return !_workerBroken;
  });
}

/** Tear the worker down (idle-shutdown hook; calls recreate it on demand). */
export function terminateCompute() {
  if (_worker) {
    try { _worker.terminate(); } catch { /* already dead */ }
    _worker = null;
  }
  _failAll('compute worker terminated');
}

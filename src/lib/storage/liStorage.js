/**
 * liStorage — Single write-path gateway for all IndexedDB operations.
 *
 * Every IndexedDB write in Lithium MUST route through this module.
 * It enforces:
 *   - Namespace authorization (each module has a restricted key space)
 *   - Audit logging (every write recorded with caller, key, size, outcome)
 *   - User-configurable size limits (storage.maxUploadMB in settings)
 *   - Per-key write serialization (prevents race conditions)
 *
 * Mirrors the apiManager.js pattern: catalog → validate → execute → audit.
 */

import { idbPut, idbDelete, idbGet } from './indexedDB';
import { loadSettings } from '../settings';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const IDB_CAP = 28 * 1024 ** 3;          // 28 GB hard limit (matches manager.js)
const AUDIT_KEY = 'li-storage-audit';
const AUDIT_CAP = 500;
const USAGE_KEY = 'idbUsage';
const MB = 1024 * 1024;
const KB = 1024;

/* ------------------------------------------------------------------ */
/*  Namespace catalog                                                  */
/* ------------------------------------------------------------------ */

/**
 * Each entry defines:
 *   store     — IDB object store ('kv', 'blobs', 'cacheLedger')
 *   keyPrefix — required key prefix ('' = any key accepted)
 *   caller    — module identity string for audit
 *   maxOpSize — per-operation byte limit (Infinity = no limit)
 */
export const NAMESPACES = {
  'kv':            { store: 'kv',          keyPrefix: 'kvx:',            caller: 'kvTier',             maxOpSize: 10 * MB },
  'app-state':     { store: 'kv',          keyPrefix: 'app-state:',      caller: 'appStateSerializer', maxOpSize: 50 * MB },
  'fs-pointer':    { store: 'kv',          keyPrefix: 'fs-pointer',      caller: 'unifiedStore',       maxOpSize: KB },
  'audio':         { store: 'blobs',       keyPrefix: 'local-audio:',    caller: 'music',              maxOpSize: 100 * MB },
  'picture':       { store: 'blobs',       keyPrefix: 'local-picture:',  caller: 'music',              maxOpSize: 50 * MB },
  'file':          { store: 'blobs',       keyPrefix: '',                caller: 'fileSystem',         maxOpSize: 500 * MB },
  'cold':          { store: 'blobs',       keyPrefix: 'cold:',           caller: 'coldStorage',        maxOpSize: 1024 * MB },
  'download':      { store: 'blobs',       keyPrefix: '',                caller: 'downloads',          maxOpSize: 500 * MB },
  'model':         { store: 'blobs',       keyPrefix: '',                caller: 'models',             maxOpSize: 2048 * MB },
  'archive':       { store: 'blobs',       keyPrefix: '',                caller: 'archive',            maxOpSize: 1024 * MB },
  'repo':          { store: 'blobs',       keyPrefix: '',                caller: 'repos',              maxOpSize: 500 * MB },
  'upload':        { store: 'blobs',       keyPrefix: '',                caller: 'ExplorerShell',      maxOpSize: 500 * MB },
  'photo-save':    { store: 'blobs',       keyPrefix: '',                caller: 'liRuntime',          maxOpSize: 50 * MB },
  'usage':         { store: 'kv',          keyPrefix: 'idbUsage',        caller: 'manager',            maxOpSize: 64 },
  'cache-ledger':  { store: 'cacheLedger', keyPrefix: '',                caller: 'manager',            maxOpSize: MB },
  // System-level callers bypass size checks (internal bookkeeping)
  'system-audit':  { store: 'kv',          keyPrefix: 'api-audit',       caller: 'apiManager',         maxOpSize: Infinity },
  'system-ai':     { store: 'kv',          keyPrefix: 'ai-',             caller: 'agent',              maxOpSize: Infinity },
};

/* ------------------------------------------------------------------ */
/*  Per-key write locks                                                */
/* ------------------------------------------------------------------ */

const locks = new Map();

/** Serialize writes to the same logical key to prevent race conditions. */
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const chained = next.catch(() => {});
  locks.set(key, chained);
  return next;
}

/* ------------------------------------------------------------------ */
/*  Internal: raw IDB primitives (bypass validation — bootstrap-safe)  */
/* ------------------------------------------------------------------ */

async function _rawPut(store, key, value) {
  return idbPut(store, key, value);
}

async function _rawDelete(store, key) {
  return idbDelete(store, key);
}

/* ------------------------------------------------------------------ */
/*  Internal: usage counter (serialized under __usage__ lock)          */
/* ------------------------------------------------------------------ */

async function _readUsage() {
  return (await idbGet('kv', USAGE_KEY)) || 0;
}

async function _writeUsage(value) {
  return idbPut('kv', USAGE_KEY, Math.max(0, value));
}

/* ------------------------------------------------------------------ */
/*  Internal: audit log (direct IDB, no kvTier dependency)             */
/* ------------------------------------------------------------------ */

function _auditAppend(log, entry) {
  const existing = Array.isArray(log) ? log : [];
  return [entry, ...existing.slice(0, AUDIT_CAP - 1)];
}

async function _audit(ns, caller, op, key, size, ok, error) {
  const entry = { t: Date.now(), ns, caller, op, key, ok: !!ok };
  if (size != null) entry.size = size;
  if (error) entry.error = error;
  try {
    const log = await idbGet('kv', AUDIT_KEY);
    await idbPut('kv', AUDIT_KEY, _auditAppend(log, entry));
    window.dispatchEvent(new Event('lithium:storage-audit'));
  } catch { /* audit must never break the write path */ }
}

/* ------------------------------------------------------------------ */
/*  Internal: validation                                               */
/* ------------------------------------------------------------------ */

function _resolveNamespace(ns) {
  const spec = NAMESPACES[ns];
  if (!spec) return { ok: false, error: `unknown storage namespace '${ns}'` };
  return { ok: true, spec };
}

function _validateKey(spec, key) {
  if (spec.keyPrefix && !key.startsWith(spec.keyPrefix)) {
    return { ok: false, error: `key '${key}' does not match prefix '${spec.keyPrefix}' for namespace` };
  }
  return { ok: true };
}

function _measureSize(data) {
  if (data instanceof Blob) return data.size;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof data === 'string') return data.length * 2;
  return JSON.stringify(data).length * 2;
}

function _validateSize(bytes, nsSpec) {
  if (bytes > nsSpec.maxOpSize) {
    return {
      ok: false,
      code: 'NAMESPACE_LIMIT',
      error: `Write size (${_fmt(bytes)}) exceeds namespace limit (${_fmt(nsSpec.maxOpSize)})`,
    };
  }
  const userLimitMB = loadSettings()?.storage?.maxUploadMB ?? 500;
  const userLimit = userLimitMB * MB;
  if (bytes > userLimit) {
    return {
      ok: false,
      code: 'SIZE_LIMIT_EXCEEDED',
      error: `Write size (${_fmt(bytes)}) exceeds user limit (${userLimitMB} MB)`,
      limit: userLimit,
      size: bytes,
    };
  }
  return { ok: true };
}

function _fmt(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Write a value to the 'kv' store through the gateway.
 *
 * @param {string} namespace  Namespace key from NAMESPACES catalog.
 * @param {string} key        Storage key (must match namespace prefix).
 * @param {*}      value      Value to store.
 * @param {string} [caller]   Override caller identity (defaults to namespace caller).
 * @returns {Promise<void>}
 */
export async function put(namespace, key, value, caller) {
  const r = _resolveNamespace(namespace);
  if (!r.ok) { await _audit(namespace, caller || '?', 'put', key, null, false, r.error); throw new Error(r.error); }

  const { spec } = r;
  const who = caller || spec.caller;

  const kr = _validateKey(spec, key);
  if (!kr.ok) { await _audit(namespace, who, 'put', key, null, false, kr.error); throw new Error(kr.error); }

  const size = _measureSize(value);
  const sr = _validateSize(size, spec);
  if (!sr.ok) { await _audit(namespace, who, 'put', key, size, false, sr.error); throw new Error(sr.error); }

  return withLock(`${spec.store}:${key}`, async () => {
    try {
      await _rawPut(spec.store, key, value);
      await _audit(namespace, who, 'put', key, size, true);
    } catch (err) {
      await _audit(namespace, who, 'put', key, size, false, err.message);
      throw err;
    }
  });
}

/**
 * Delete a value from the 'kv' store through the gateway.
 *
 * @param {string} namespace  Namespace key from NAMESPACES catalog.
 * @param {string} key        Storage key.
 * @param {string} [caller]   Override caller identity.
 * @returns {Promise<void>}
 */
export async function del(namespace, key, caller) {
  const r = _resolveNamespace(namespace);
  if (!r.ok) { await _audit(namespace, caller || '?', 'delete', key, null, false, r.error); throw new Error(r.error); }

  const { spec } = r;
  const who = caller || spec.caller;

  const kr = _validateKey(spec, key);
  if (!kr.ok) { await _audit(namespace, who, 'delete', key, null, false, kr.error); throw new Error(kr.error); }

  return withLock(`${spec.store}:${key}`, async () => {
    try {
      await _rawDelete(spec.store, key);
      await _audit(namespace, who, 'delete', key, null, true);
    } catch (err) {
      await _audit(namespace, who, 'delete', key, null, false, err.message);
      throw err;
    }
  });
}

/**
 * Store a blob (binary data) with quota enforcement and usage tracking.
 * Validates namespace, key prefix, size limits, and the 28 GB IDB cap.
 * The usage counter update is serialized under a shared lock to prevent
 * race conditions when multiple blobs are written concurrently.
 *
 * @param {string}          namespace  Namespace key from NAMESPACES catalog.
 * @param {string}          key        Blob key.
 * @param {Blob|string}     data       Blob data or string.
 * @param {string}          [caller]   Override caller identity.
 * @param {object}          [meta]     Extra metadata stored alongside the blob.
 * @returns {Promise<void>}
 */
export async function putBlob(namespace, key, data, caller, meta) {
  const r = _resolveNamespace(namespace);
  if (!r.ok) { await _audit(namespace, caller || '?', 'putBlob', key, null, false, r.error); throw new Error(r.error); }

  const { spec } = r;
  const who = caller || spec.caller;

  const kr = _validateKey(spec, key);
  if (!kr.ok) { await _audit(namespace, who, 'putBlob', key, null, false, kr.error); throw new Error(kr.error); }

  const size = data instanceof Blob ? data.size : (data.length || 0) * 2;
  const sr = _validateSize(size, spec);
  if (!sr.ok) { await _audit(namespace, who, 'putBlob', key, size, false, sr.error); throw new Error(sr.error); }

  // Serialize blob write + usage counter update under a shared lock
  // so concurrent putBlob calls don't race on the usage counter.
  return withLock('__storage_write__', async () => {
    try {
      const usage = await _readUsage();
      if (usage + size > IDB_CAP) {
        const err = `IndexedDB limit (${_fmt(IDB_CAP)}) reached`;
        await _audit(namespace, who, 'putBlob', key, size, false, err);
        throw new Error(err);
      }
      await _rawPut('blobs', key, { data, size, ...(meta || {}), updatedAt: Date.now() });
      await _writeUsage(usage + size);
      await _audit(namespace, who, 'putBlob', key, size, true);
    } catch (err) {
      await _audit(namespace, who, 'putBlob', key, size, false, err.message);
      throw err;
    }
  });
}

/**
 * Delete a blob and update the usage counter.
 *
 * @param {string} namespace  Namespace key from NAMESPACES catalog.
 * @param {string} key        Blob key.
 * @param {string} [caller]   Override caller identity.
 * @returns {Promise<void>}
 */
export async function deleteBlob(namespace, key, caller) {
  const r = _resolveNamespace(namespace);
  if (!r.ok) { await _audit(namespace, caller || '?', 'deleteBlob', key, null, false, r.error); throw new Error(r.error); }

  const { spec } = r;
  const who = caller || spec.caller;

  const kr = _validateKey(spec, key);
  if (!kr.ok) { await _audit(namespace, who, 'deleteBlob', key, null, false, kr.error); throw new Error(kr.error); }

  return withLock('__storage_write__', async () => {
    try {
      const record = await idbGet('blobs', key);
      if (!record) {
        await _audit(namespace, who, 'deleteBlob', key, null, true);
        return;
      }
      await _rawDelete('blobs', key);
      await _writeUsage((await _readUsage()) - (record.size || 0));
      await _audit(namespace, who, 'deleteBlob', key, record.size || 0, true);
    } catch (err) {
      await _audit(namespace, who, 'deleteBlob', key, null, false, err.message);
      throw err;
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Audit log access                                                   */
/* ------------------------------------------------------------------ */

/** Return the storage audit log (newest first). */
export async function getStorageAudit() {
  try {
    return (await idbGet('kv', AUDIT_KEY)) || [];
  } catch {
    return [];
  }
}

/** Clear the storage audit log. */
export async function clearStorageAudit() {
  await idbPut('kv', AUDIT_KEY, []);
  window.dispatchEvent(new Event('lithium:storage-audit'));
}

/* ------------------------------------------------------------------ */
/*  Diagnostics                                                        */
/* ------------------------------------------------------------------ */

/** Approximate byte size of a value (exported for callers that need it). */
export { _measureSize as measureSize, _fmt as formatSize };

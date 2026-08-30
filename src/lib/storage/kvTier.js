import { idbAll, idbDelete, idbKeys, idbPut } from './indexedDB';
import { storage } from './localStorage';
import * as core from '../core';

/**
 * Unified local tier — localStorage and Cache Storage working as one pool.
 *
 * Small values stay in localStorage (synchronous, instant reads). Values
 * above OVERFLOW_THRESHOLD transparently overflow into IndexedDB
 * (write-behind, never blocks the UI) and are hydrated back into memory at
 * boot. localStorage therefore never grows toward the browser's ~5 MB wall
 * no matter how long chats, audit logs or memories get.
 *
 * Reads are always synchronous: memory cache → localStorage fallback.
 * 'lithium:kv-ready' fires once hydration completes so UI can refresh.
 */

const PREFIX = 'kvx:';
const LOCAL_PREFIX = 'lithium:';
const OVERFLOW_THRESHOLD = 32 * 1024; // chars before a value moves to IndexedDB
export const KV_READY_EVENT = 'lithium:kv-ready';

const overflow = new Map(); // key → raw JSON string (canonical copy in IDB)
let hydratePromise = null;
let ready = false;

/** Load overflowed values from IndexedDB into memory (idempotent). */
export function hydrateKv() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const [keys, values] = await Promise.all([idbKeys('kv'), idbAll('kv')]);
        keys.forEach((key, index) => {
          if (typeof key === 'string' && key.startsWith(PREFIX)) {
            const real = key.slice(PREFIX.length);
            overflow.set(real, values[index]);
            storage.remove(real); // canonical copy now lives in IndexedDB
          }
        });
      } catch { /* IndexedDB unavailable — localStorage-only mode */ }

      // Eagerly migrate already-bulky localStorage values into the overflow
      // tier so existing bloat drains on the very next boot.
      try {
        const candidates = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const rawKey = localStorage.key(i);
          if (rawKey && rawKey.startsWith(LOCAL_PREFIX)) candidates.push(rawKey);
        }
        for (const rawKey of candidates) {
          const key = rawKey.slice(LOCAL_PREFIX.length);
          if (overflow.has(key)) continue;
          const raw = localStorage.getItem(rawKey) || '';
          if (raw.length < OVERFLOW_THRESHOLD) continue;
          overflow.set(key, raw);
          // Keep the localStorage copy until the IDB write lands, then drop
          // it — never destroy data before the overflow copy is durable.
          idbPut('kv', PREFIX + key, raw)
            .then(() => storage.remove(key))
            .catch(() => overflow.delete(key));
        }
      } catch { /* best effort */ }

      ready = true;
      window.dispatchEvent(new Event(KV_READY_EVENT));
      return true;
    })();
  }
  return hydratePromise;
}

/** Synchronous read: memory overflow first, then localStorage. */
export function kvGet(key, fallback = null) {
  if (overflow.has(key)) {
    try {
      return JSON.parse(overflow.get(key));
    } catch {
      return fallback;
    }
  }
  return storage.get(key, fallback);
}

/** Write-through: small values stay local, big ones overflow to IndexedDB.
 *  Writes before hydration completes are deferred so existing bulky values
 *  are never clobbered mid-migration. */
export function kvSet(key, value) {
  if (!ready) {
    hydrateKv().then(() => kvSet(key, value)).catch(() => {});
    return;
  }
  const json = JSON.stringify(value);
  const wasmDecision = core.kvShouldOverflowSync(json.length);
  const shouldOverflow = wasmDecision?.overflow ?? json.length >= OVERFLOW_THRESHOLD;
  
  if (shouldOverflow) {
    overflow.set(key, json);
    storage.remove(key);
    idbPut('kv', PREFIX + key, json).catch(() => {});
  } else {
    if (overflow.delete(key)) {
      idbDelete('kv', PREFIX + key).catch(() => {});
    }
    storage.set(key, value);
  }
}

/** Approximate bytes held in the overflow tier (for the Storage Manager). */
export function kvOverflowBytes() {
  const entries = [];
  overflow.forEach((json, key) => entries.push({ key, jsonLen: json.length }));
  const wasmResult = core.kvOverflowBytesSync(entries);
  return wasmResult?.bytes ?? 0;
}

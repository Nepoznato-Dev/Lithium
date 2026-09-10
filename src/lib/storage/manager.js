import { idbAll, idbGet, idbKeys } from './indexedDB';
import { putBlob as gwPutBlob, deleteBlob as gwDeleteBlob, del as liDel } from './liStorage';
import { kvOverflowBytes } from './kvTier';

/**
 * Unified storage tiers:
 *  - localStorage  : settings + small metadata; heavy values overflow into
 *                    IndexedDB via kvTier (never grows toward the 5 MB wall)
 *  - IndexedDB     : files, photos, models, kv overflow (hard cap 28 GB)
 *  - Cache Storage : whole-site offline cache, games excluded (soft cap 10 GB)
 *
 * localStorage + Cache Storage are presented as one "local tier".
 * Browsers (Chromium) typically grant ~60% of the user's free disk as quota,
 * so we estimate the real disk as quota / 0.6.
 */

export const IDB_CAP = 28 * 1024 ** 3; // 28 GB hard limit
export const CACHE_CAP = 10 * 1024 ** 3; // 10 GB soft limit for the offline cache
export const LOCAL_CAP = 5 * 1024 ** 2; // ~5 MB (informational — overflow prevents hitting it)
export const SITE_CACHE_NAME = 'lithium-site-v2';
export const LEGACY_GAME_CACHE = 'lithium-games-v1'; // purged on sw activate

const _UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
export function formatBytes(bytes) {
  const b = bytes || 0;
  if (b === 0) return '0 B';
  const i = Math.min(_UNITS.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const v = b / Math.pow(1024, i);
  return v >= 100 || i === 0 ? `${Math.round(v)} ${_UNITS[i]}` : `${v.toFixed(1)} ${_UNITS[i]}`;
}

/** Browser-reported usage & quota (the "educated guess" source). */
export async function browserEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch { /* unavailable */ }
  return { usage: 0, quota: 0 };
}

/** Chromium grants ~60% of disk — invert to guess total capacity. */
export function guessTotalDisk(quota) {
  return quota > 0 ? Math.round(quota / 0.6) : 0;
}

/* ---------- localStorage tier ---------- */

export function localStorageUsage() {
  let chars = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      chars += key.length + (localStorage.getItem(key)?.length || 0);
    }
  } catch { /* blocked */ }
  return chars * 2; // UTF-16
}

/* ---------- IndexedDB tier (writes routed through liStorage gateway) ---------- */

export async function idbUsage() {
  return (await idbGet('kv', 'idbUsage')) || 0;
}

/**
 * Store a blob — backward-compatible wrapper.
 * New code should call liStorage.putBlob(ns, key, data, caller, meta) directly
 * for proper namespace attribution in the audit log.
 */
export async function putBlob(id, data, meta = {}) {
  return gwPutBlob('file', id, data, 'manager', meta);
}

export async function getBlob(id) {
  const record = await idbGet('blobs', id);
  if (!record) return null;
  // Gateway-wrapped format: { data, size, ... } — unwrap to the raw payload.
  // Legacy records store the raw value directly — return as-is.
  return record.data !== undefined ? record.data : record;
}

/**
 * Delete a blob — backward-compatible wrapper.
 * New code should call liStorage.deleteBlob(ns, key, caller) directly.
 */
export async function deleteBlob(id) {
  return gwDeleteBlob('file', id, 'manager');
}

/* ---------- Cache Storage tier (whole-site offline cache, no games) ---------- */

async function siteCacheKeys() {
  try {
    if (!(await caches.has(SITE_CACHE_NAME))) return [];
    const cache = await caches.open(SITE_CACHE_NAME);
    return await cache.keys();
  } catch {
    return [];
  }
}

export async function cacheEntries() {
  // Legacy game ledger — kept only so old data drains out of the UI.
  const entries = (await idbAll('cacheLedger')) || [];
  return entries.sort((a, b) => a.time - b.time);
}

export async function cachedAssetCount() {
  return (await siteCacheKeys()).length;
}

export async function cacheUsage() {
  try {
    const keys = await siteCacheKeys();
    if (!keys.length) return 0;
    const cache = await caches.open(SITE_CACHE_NAME);
    // Don't load full blobs into memory - just sum sizes from Content-Length headers
    let total = 0;
    for (const key of keys) {
      const response = await cache.match(key);
      if (response) {
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
          total += parseInt(contentLength, 10);
        } else {
          // Fallback: clone and get size without keeping the blob
          const blob = await response.clone().blob();
          total += blob.size;
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** Wipe the site offline cache plus any legacy game cache/ledger leftovers. */
export async function clearSiteCache() {
  try {
    await caches.delete(SITE_CACHE_NAME);
    await caches.delete(LEGACY_GAME_CACHE);
  } catch { /* cache api unavailable */ }
  try {
    for (const entry of await cacheEntries()) {
      await liDel('cache-ledger', entry.url);
    }
  } catch { /* ledger already empty */ }
}

/** Everything the Storage Manager panel needs, in one call. */
export async function storageSnapshot() {
  const estimate = await browserEstimate();
  const [local, idb, cache, assets, cold] = await Promise.all([
    Promise.resolve(localStorageUsage()),
    idbUsage(),
    cacheUsage(),
    cachedAssetCount(),
    coldStorageUsage(),
  ]);
  return {
    quota: estimate.quota || 0,
    browserUsage: estimate.usage || 0,
    estimatedDisk: guessTotalDisk(estimate.quota || 0),
    local,
    idb,
    cache,
    cachedAssets: assets,
    kvOverflow: kvOverflowBytes(),
    cold,
  };
}

async function coldStorageUsage() {
  try {
    const keys = await idbKeys('blobs');
    let archives = 0;
    let compressedBytes = 0;
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith('cold:')) {
        archives++;
        const record = await idbGet('blobs', key);
        // Use stored size metadata instead of loading the blob data
        if (record?.size) {
          compressedBytes += record.size;
        } else if (record?.data) {
          compressedBytes += record.data.size || 0;
        }
      }
    }
    return { archives, compressedBytes };
  } catch {
    return { archives: 0, compressedBytes: 0 };
  }
}

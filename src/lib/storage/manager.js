import { idbAll, idbDelete, idbGet, idbPut, idbKeys } from './indexedDB';
import { kvOverflowBytes } from './kvTier';
import * as core from '../core';

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

export function formatBytes(bytes) {
  return core.storageFormatBytesSync(bytes || 0) || '0 B';
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
  const result = core.storageGuessDiskSync(quota || 0);
  return result?.estimatedDisk ?? 0;
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

/* ---------- IndexedDB tier ---------- */

export async function idbUsage() {
  return (await idbGet('kv', 'idbUsage')) || 0;
}

async function setIdbUsage(value) {
  await idbPut('kv', 'idbUsage', Math.max(0, value));
}

/** Store a string payload (text or data: URL) with the 28 GB cap enforced. */
export async function putBlob(id, data, meta = {}) {
  const size = data instanceof Blob ? data.size : data.length * 2;
  const usage = await idbUsage();
  if (usage + size > IDB_CAP) throw new Error(`IndexedDB limit (${formatBytes(IDB_CAP)}) reached`);
  await idbPut('blobs', id, { data, size, ...meta, updatedAt: Date.now() });
  await setIdbUsage(usage + size);
}

export async function getBlob(id) {
  const record = await idbGet('blobs', id);
  return record?.data ?? null;
}

export async function deleteBlob(id) {
  const record = await idbGet('blobs', id);
  if (!record) return;
  await idbDelete('blobs', id);
  await setIdbUsage((await idbUsage()) - (record.size || 0));
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
    const responses = await Promise.all(keys.map(key => cache.match(key)));
    const blobs = await Promise.all(responses.filter(Boolean).map(response => response.blob()));
    return blobs.reduce((total, blob) => total + blob.size, 0);
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
      await idbDelete('cacheLedger', entry.url);
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
        if (record?.data) compressedBytes += record.data.size || record.size || 0;
      }
    }
    return { archives, compressedBytes };
  } catch {
    return { archives: 0, compressedBytes: 0 };
  }
}

import { deleteBlob, getBlob, putBlob } from './manager';
import { idbGet, idbPut } from './indexedDB';
import * as core from '../core';
import { storage } from './localStorage';

/**
 * Unified store — memory-first persistence for the virtual file system.
 *
 *   change → applied to the in-memory tree instantly (UI never waits)
 *          → debounced background persist:
 *              JSON → wasm binary snapshot → LZ4 (wasm) → xxh3 hash
 *              → Blob in IndexedDB → atomic pointer swap (kv store)
 *
 * The previous snapshot is kept until the new one is committed, so a crash
 * mid-write always leaves a readable last-good state. Legacy localStorage
 * trees ('fs') are migrated on first hydration and then removed.
 */

const POINTER_KEY = 'fs-pointer';
const SNAP_PREFIX = 'fs-snap-';
const SAVE_DEBOUNCE = 350;

let tree = null;
let hydrated = false;
let hadData = false;
let hydratePromise = null;
let saveTimer = null;
let lastStats = null;
let seeder = null;

/** fileSystem registers its default-tree/migration logic here (avoids a cycle). */
export function registerSeeder(fn) {
  seeder = fn;
}

export function getTree() {
  return tree || [];
}

export function isHydrated() {
  return hydrated;
}

export function hasStoredData() {
  return hadData;
}

export function getSnapshotStats() {
  return lastStats;
}

export function hydrate() {
  if (!hydratePromise) hydratePromise = doHydrate();
  return hydratePromise;
}

async function readSnapshot(pointer) {
  if (!pointer?.key) return null;
  const blob = await getBlob(pointer.key);
  if (!blob) return null;
  const buf = new Uint8Array(await blob.arrayBuffer());

  // Integrity check (when wasm + hash available).
  if (pointer.hash) {
    const hash = await core.wasmHash(buf);
    if (hash && hash !== pointer.hash) return null;
  }

  if (pointer.binary) {
    const bin = pointer.raw ? buf : await core.wasmDecompress(buf);
    if (!bin) return null;
    const json = await core.snapshotDecode(bin);
    if (!json) return null;
    return { entries: JSON.parse(json), pointer };
  }
  // Raw JSON fallback snapshot (written when wasm was unavailable).
  return { entries: JSON.parse(new TextDecoder().decode(buf)), pointer };
}

async function doHydrate() {
  await core.coreReady();
  // Guarded: hydration must survive unavailable/blocked IndexedDB (falls back
  // to the legacy localStorage tree, then the seeder).
  const pointer = await idbGet('kv', POINTER_KEY).catch(() => null);
  let loaded = null;
  if (pointer) loaded = await readSnapshot(pointer).catch(() => null);
  if (!loaded && pointer?.prevKey) {
    loaded = await readSnapshot({ ...pointer, key: pointer.prevKey, hash: null }).catch(() => null);
  }
  if (loaded) {
    tree = loaded.entries;
    hadData = true;
    lastStats = loaded.pointer;
  } else if (pointer?.key) {
    hadData = true; // data existed but was unreadable — seeder may still reconcile
  }

  // Legacy migration: the old synchronous localStorage tree.
  if (!loaded) {
    const legacy = storage.get('fs', null);
    if (Array.isArray(legacy) && legacy.length > 0) {
      tree = legacy;
      hadData = true;
    }
  }

  if (seeder) {
    const seeded = seeder(tree, hadData);
    if (seeded) tree = seeded;
  }
  if (tree === null) tree = [];

  hydrated = true;
  window.dispatchEvent(new Event('lithium:fs-changed'));
  if (hadData || tree.length) persistNow().catch(() => {}); // migrate legacy / commit seed
  return tree;
}

/* ---------- mutation + persistence ---------- */

export function setTree(next, { persist = true } = {}) {
  tree = next;
  window.dispatchEvent(new Event('lithium:fs-changed'));
  if (persist) scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNow().catch(() => {}), SAVE_DEBOUNCE);
}

export async function persistNow() {
  if (!hydrated && !tree) return null;
  const entries = tree || [];
  const jsonBytes = new TextEncoder().encode(JSON.stringify(entries));

  let payload = jsonBytes;
  let raw = true;
  let binary = false;
  if (core.hasWasm()) {
    const bin = await core.snapshotEncode(new TextDecoder().decode(jsonBytes));
    if (bin) {
      binary = true;
      const compressed = await core.wasmCompress(bin);
      if (compressed) {
        payload = compressed;
        raw = false;
      } else {
        payload = bin;
      }
    }
  }

  const hash = await core.wasmHash(payload);
  const key = SNAP_PREFIX + Date.now();
  const previous = await idbGet('kv', POINTER_KEY);

  // Blob wrapper so storage accounting measures exact bytes.
  await putBlob(key, new Blob([payload]), { name: 'lithium-fs-snapshot' });
  const pointer = {
    key,
    prevKey: previous?.key || null,
    raw,
    binary,
    hash,
    rawSize: jsonBytes.length,
    compSize: payload.length,
    engine: binary ? (raw ? 'wasm-bin' : 'wasm-bin+lz4') : 'json',
    at: Date.now(),
  };
  await idbPut('kv', POINTER_KEY, pointer);
  if (pointer.prevKey && pointer.prevKey !== key) {
    await deleteBlob(pointer.prevKey).catch(() => {});
  }
  storage.remove('fs'); // legacy mirror no longer needed
  lastStats = pointer;
  return pointer;
}

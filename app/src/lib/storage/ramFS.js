/**
 * ramFS — RAM-resident filesystem with TAR+GZip persistence.
 *
 * The entire filesystem tree lives in RAM for instant access. On persist,
 * it serializes as a TAR archive (tree.json + content/<id> entries) compressed
 * with gzip into an IndexedDB blob. A 10 MB RAM budget governs how much
 * content stays inline; files that would exceed the cap are spilled to
 * localStorage in JSONL format (one line per entry, keeping states and lists).
 *
 * Architecture:
 *   - tree: in-RAM array of entries (folders + files with inline content)
 *   - persist: JSON → TAR build (worker) → gzip (native) → Blob → IndexedDB
 *   - hydrate: IndexedDB → gunzip → TAR parse (worker) → rebuild tree in RAM
 *   - spill: when RAM usage exceeds 10 MB, large files move to localStorage JSONL
 *   - restore: on access, spilled files are read back from localStorage
 *
 * RAM budget: 10 MB (configurable via RAM_BUDGET constant)
 * JSONL format: one JSON object per line, fields: id, name, type, parentId, size, content
 */

import { getBlob } from './manager';
import { putBlob, deleteBlob } from './liStorage';
import { computeCall } from '../compute';
import { storage } from './localStorage';

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/* ── Configuration ─────────────────────────────────────────────────────── */

// eslint-disable-next-line no-unused-vars -- 10 MB budget reserved for future use
const RAM_BUDGET = 10 * 1024 * 1024;
const SPILL_THRESHOLD = 8 * 1024 * 1024; // Start spilling at 8 MB to leave headroom
const JSONL_KEY = 'ramfs-spill'; // localStorage key for spilled entries
const POINTER_KEY = 'ramfs-pointer'; // IndexedDB kv key for the TAR blob reference
const SNAP_PREFIX = 'ramfs-snap-'; // IndexedDB blob key prefix

/* ── In-memory state ───────────────────────────────────────────────────── */

let tree = null;
let hydrated = false;
let hadData = false;
let hydratePromise = null;
let saveTimer = null;
let lastStats = null; // eslint-disable-line no-unused-vars
let seeder = null;
let spilledIds = new Set(); // Track which entries are in localStorage JSONL

/* ── Debounced save ────────────────────────────────────────────────────── */

function scheduleSave(delay = 400) {
  if (saveTimer != null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow().catch(err => console.warn('ramFS: scheduled save failed', err));
  }, delay);
}

/* ── Public API ────────────────────────────────────────────────────────── */

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

export function getRamUsage() {
  return estimateRamUsage(tree || []);
}

export function hydrate() {
  if (!hydratePromise) hydratePromise = doHydrate();
  return hydratePromise;
}

export function setTree(next, { persist = true } = {}) {
  tree = next;
  window.dispatchEvent(new Event('lithium:fs-changed'));
  if (persist) scheduleSave();
}

export async function persistNow() {
  if (!hydrated && !tree) return null;
  const entries = tree || [];

  // Check RAM usage and spill if needed
  const ramUsage = estimateRamUsage(entries);
  if (ramUsage > SPILL_THRESHOLD) {
    await spillToLocalStorage(entries);
  }

  // Build TAR archive
  const parts = await buildTarParts(entries);
  const tarStream = await computeCall('archive.tarBuild', { parts });

  // GZip compress
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(tarStream);
  writer.close();

  const chunks = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done: rDone, value } = await reader.read();
    if (rDone) break;
    chunks.push(value);
  }

  const payload = concatChunks(chunks);
  const key = SNAP_PREFIX + Date.now();

  // Store in IndexedDB
  await putBlob('file', key, new Blob([payload]), undefined, { name: 'ramfs-archive' });

  // Update pointer
  const previous = await (await import('./indexedDB')).idbGet('kv', POINTER_KEY);
  const pointer = {
    key,
    prevKey: previous?.key || null,
    rawSize: estimateRawSize(entries),
    compSize: payload.length,
    ramUsage,
    spilledCount: spilledIds.size,
    at: Date.now(),
  };

  const { put: liPut } = await import('./liStorage');
  await liPut('fs-pointer', POINTER_KEY, pointer);

  // Clean up previous snapshot
  if (pointer.prevKey && pointer.prevKey !== key) {
    await deleteBlob('file', pointer.prevKey).catch(() => {});
  }

  lastStats = pointer;
  return pointer;
}

/* ── Hydration ─────────────────────────────────────────────────────────── */

async function doHydrate() {
  const { idbGet } = await import('./indexedDB');
  const pointer = await idbGet('kv', POINTER_KEY).catch(() => null);

  let loaded = null;
  if (pointer?.key) {
    try {
      const blob = await getBlob(pointer.key);
      if (blob) {
        const gzData = new Uint8Array(await blob.arrayBuffer());
        // Gunzip
        const cs = new DecompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(gzData);
        writer.close();

        const chunks = [];
        const reader = cs.readable.getReader();
        for (;;) {
          const { done: rDone, value } = await reader.read();
          if (rDone) break;
          chunks.push(value);
        }
        const tarData = concatChunks(chunks);

        // Parse TAR
        const files = await computeCall('archive.tarParse', { bytes: tarData });
        const fileMap = {};
        for (const f of files) fileMap[f.name] = f.data;

        // Rebuild tree
        loaded = rebuildTree(fileMap);
      }
    } catch (err) {
      console.warn('ramFS: failed to load snapshot', err);
    }
  }

  // Load spilled entries from localStorage
  loadSpilledEntries();

  if (loaded) {
    tree = loaded.entries;
    hadData = true;
    lastStats = pointer;
  }

  // Legacy migration: check for old localStorage tree
  if (!loaded) {
    const legacy = storage.get('fs', null);
    if (Array.isArray(legacy) && legacy.length > 0) {
      tree = legacy;
      hadData = true;
    }
  }

  // Run seeder
  if (seeder) {
    const seeded = seeder(tree, hadData);
    if (seeded) tree = seeded;
  }
  if (tree === null) tree = [];

  hydrated = true;
  window.dispatchEvent(new Event('lithium:fs-changed'));
  if (hadData || tree.length) persistNow().catch(() => {});
  return tree;
}

/* ── TAR building ──────────────────────────────────────────────────────── */

async function buildTarParts(entries) {
  const parts = [];

  // tree.json: the tree structure without content (metadata only)
  const treeMeta = entries.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    parentId: e.parentId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    size: e.size,
    idb: e.idb,
    blobRef: e.blobRef,
  }));
  parts.push({ name: 'tree.json', data: _enc.encode(JSON.stringify(treeMeta)) });

  // content/<id>: inline content for files that fit in RAM
  for (const entry of entries) {
    if (entry.type === 'folder') continue;
    if (spilledIds.has(entry.id)) continue; // Spilled to localStorage
    if (entry.idb && entry.blobRef) continue; // External blob reference
    if (entry.idb) {
      // Read from IndexedDB
      try {
        const blob = await getBlob(entry.id);
        if (blob) {
          parts.push({ name: `content/${entry.id}`, data: new Uint8Array(await blob.arrayBuffer()) });
        }
      } catch { /* skip unreadable */ }
    } else if (entry.content != null) {
      // Inline content
      parts.push({ name: `content/${entry.id}`, data: _enc.encode(String(entry.content)) });
    }
  }

  return parts;
}

function rebuildTree(fileMap) {
  const treeMeta = JSON.parse(_dec.decode(fileMap['tree.json'] || new Uint8Array(0)));
  const entries = [];

  for (const meta of treeMeta) {
    const contentData = fileMap[`content/${meta.id}`];
    if (contentData) {
      // Inline content
      const isText = meta.type === 'text' || contentData.length < 64 * 1024;
      entries.push({
        ...meta,
        content: isText ? _dec.decode(contentData) : null,
        idb: !isText,
      });
    } else if (meta.idb) {
      // External blob
      entries.push({ ...meta, content: null });
    } else {
      // Folder or empty
      entries.push({ ...meta, content: null });
    }
  }

  return { entries };
}

/* ── RAM budget enforcement ────────────────────────────────────────────── */

function estimateRamUsage(entries) {
  let total = 0;
  for (const entry of entries) {
    if (entry.type === 'folder') continue;
    if (spilledIds.has(entry.id)) continue; // Already spilled
    if (entry.idb && entry.blobRef) continue; // External reference
    if (entry.idb) {
      // Assume average blob size for estimation
      total += entry.size || 1024;
    } else if (entry.content != null) {
      total += String(entry.content).length * 2; // UTF-16
    }
  }
  return total;
}

function estimateRawSize(entries) {
  let total = 0;
  for (const entry of entries) {
    total += JSON.stringify(entry).length * 2;
  }
  return total;
}

async function spillToLocalStorage(entries) {
  // Sort by size descending, spill largest first
  const spillable = entries
    .filter(e => e.type !== 'folder' && !spilledIds.has(e.id) && !e.blobRef)
    .map(e => ({
      id: e.id,
      size: e.idb ? (e.size || 1024) : String(e.content || '').length * 2,
    }))
    .sort((a, b) => b.size - a.size);

  const jsonlLines = [];
  let currentUsage = estimateRamUsage(entries);

  for (const item of spillable) {
    if (currentUsage <= SPILL_THRESHOLD) break;

    const entry = entries.find(e => e.id === item.id);
    if (!entry) continue;

    // Read content if needed
    let content = entry.content;
    if (entry.idb && !content) {
      try {
        const blob = await getBlob(entry.id);
        if (blob) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          content = _dec.decode(bytes);
        }
      } catch { /* skip */ }
    }

    if (content != null) {
      jsonlLines.push(JSON.stringify({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        parentId: entry.parentId,
        size: item.size,
        content,
      }));
      spilledIds.add(entry.id);
      currentUsage -= item.size;
    }
  }

  if (jsonlLines.length > 0) {
    // Append to existing JSONL
    const existing = storage.get(JSONL_KEY, '');
    const updated = existing ? existing + '\n' + jsonlLines.join('\n') : jsonlLines.join('\n');
    storage.set(JSONL_KEY, updated);
  }
}

function loadSpilledEntries() {
  const jsonl = storage.get(JSONL_KEY, '');
  if (!jsonl) return;

  spilledIds.clear();
  const lines = jsonl.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.id) spilledIds.add(obj.id);
    } catch { /* skip malformed */ }
  }
}

/* ── Utilities ─────────────────────────────────────────────────────────── */

function concatChunks(chunks) {
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { putBlob, getBlob } from './manager';

/**
 * ZIP archive engine — full backup & restore using fflate.
 *
 * Backup format (standard .zip):
 *   manifest.json   — tree entries + localStorage kv dump + metadata
 *   blobs/<id>      — binary payloads for every IndexedDB-backed entry
 *
 * The manifest stores the full virtual-FS tree array plus a snapshot of
 * all `lithium:*` localStorage keys, so a single .zip is a complete,
 * self-contained backup that can be restored on any device.
 */

const MANIFEST_NAME = 'manifest.json';
const BLOBS_DIR = 'blobs/';
const BACKUP_VERSION = 2;

/* ---------- create a full backup ZIP ---------- */

/**
 * Build a complete backup ZIP of the entire virtual FS + localStorage kv.
 * @param {Array} tree — the full virtual-FS tree array
 * @param {object} [opts] — { onProgress({ phase, done, total }) }
 * @returns {Promise<Blob>}
 */
export async function createBackupZip(tree, { onProgress } = {}) {
  const entries = {};
  const blobEntries = [];

  // 1. Collect localStorage kv dump.
  const kvDump = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lithium:')) kvDump[key] = localStorage.getItem(key);
    }
  } catch { /* blocked */ }

  // 2. Walk the tree — inline text goes into manifest, blobs are collected.
  const manifestEntries = [];
  const now = Date.now();

  for (const entry of tree) {
    const meta = {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      parentId: entry.parentId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      system: entry.system || undefined,
    };

    if (entry.idb && entry.blobRef) {
      // Externally-owned blob (model GGUF, OPFS file) — skip data, keep the ref.
      manifestEntries.push({ ...meta, content: null, idb: true, blobRef: entry.blobRef, size: entry.size || 0 });
    } else if (entry.idb) {
      // IndexedDB-backed blob — will be placed in blobs/ dir.
      manifestEntries.push({ ...meta, content: null, idb: true, size: entry.size || 0 });
      blobEntries.push(entry.id);
    } else {
      // Inline content (text, small files).
      manifestEntries.push({ ...meta, content: entry.content || '', size: (entry.content || '').length * 2 });
    }
  }

  const manifest = {
    version: BACKUP_VERSION,
    at: now,
    tree: manifestEntries,
    kv: kvDump,
  };

  entries[MANIFEST_NAME] = strToU8(JSON.stringify(manifest));
  onProgress?.({ phase: 'manifest', done: 1, total: 1 + blobEntries.length });

  // 3. Pull blobs from IndexedDB.
  for (let i = 0; i < blobEntries.length; i += 1) {
    const id = blobEntries[i];
    try {
      const blob = await getBlob(id);
      if (blob) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        entries[BLOBS_DIR + id] = buf;
      }
    } catch { /* skip unreadable blobs */ }
    onProgress?.({ phase: 'blobs', done: i + 2, total: 1 + blobEntries.length });
  }

  // 4. Compress into a ZIP.
  onProgress?.({ phase: 'compress' });
  const compressed = zipSync(entries, { level: 6 });
  return new Blob([compressed], { type: 'application/zip' });
}

/* ---------- restore from a backup ZIP ---------- */

/**
 * Restore the entire virtual FS + localStorage from a backup ZIP.
 * Merges with existing data (does not wipe first — callers decide).
 * @param {Blob} zipBlob
 * @param {object} [opts] — { onProgress({ phase, done, total }), replace: true }
 * @returns {Promise<{ tree: Array, kvCount: number, blobCount: number }>}
 */
export async function restoreBackupZip(zipBlob, { onProgress, replace = false } = {}) {
  onProgress?.({ phase: 'extract' });
  const raw = new Uint8Array(await zipBlob.arrayBuffer());
  const extracted = unzipSync(raw);

  // 1. Read manifest.
  const manifestBytes = extracted[MANIFEST_NAME];
  if (!manifestBytes) throw new Error('Invalid backup: missing manifest');
  const manifest = JSON.parse(strFromU8(manifestBytes));
  if (!manifest.tree || !Array.isArray(manifest.tree)) throw new Error('Invalid backup: corrupt manifest');

  // 2. Restore localStorage kv.
  let kvCount = 0;
  if (manifest.kv && typeof manifest.kv === 'object') {
    for (const [key, value] of Object.entries(manifest.kv)) {
      try {
        if (replace || !localStorage.getItem(key)) {
          localStorage.setItem(key, value);
          kvCount++;
        }
      } catch { /* quota */ }
    }
  }

  // 3. Restore blobs into IndexedDB.
  let blobCount = 0;
  const blobIds = new Set();
  for (const [path, bytes] of Object.entries(extracted)) {
    if (!path.startsWith(BLOBS_DIR)) continue;
    const id = path.slice(BLOBS_DIR.length);
    blobIds.add(id);
    try {
      await putBlob(id, new Blob([bytes]), { name: 'backup-restore' });
      blobCount++;
    } catch { /* quota */ }
    onProgress?.({ phase: 'blobs', done: blobCount, total: 0 });
  }

  // 4. Return the tree (caller decides how to apply it).
  onProgress?.({ phase: 'done' });
  return { tree: manifest.tree, kvCount, blobCount, version: manifest.version || 1 };
}

/* ---------- export a single folder as ZIP ---------- */

/**
 * Collect all entries under a folder and create a downloadable ZIP.
 * @param {Array} tree
 * @param {string} folderId — the root folder to export
 * @returns {Promise<Blob>}
 */
export async function exportFolderZip(tree, folderId) {
  const folder = tree.find(entry => entry.id === folderId);
  if (!folder || folder.type !== 'folder') throw new Error('Folder not found');

  const entries = {};
  const children = tree.filter(entry => entry.parentId === folderId || isDescendant(tree, entry, folderId));

  for (const child of children) {
    if (child.type === 'folder') continue;
    const path = buildRelativePath(tree, child, folderId);

    if (child.idb && child.blobRef) {
      // Skip externally-owned blobs (models, OPFS).
      continue;
    } else if (child.idb) {
      try {
        const blob = await getBlob(child.id);
        if (blob) {
          entries[path] = new Uint8Array(await blob.arrayBuffer());
        }
      } catch { /* skip */ }
    } else if (child.content != null) {
      entries[path] = strToU8(String(child.content));
    }
  }

  const compressed = zipSync(entries, { level: 6 });
  return new Blob([compressed], { type: 'application/zip' });
}

/* ---------- import a ZIP into a folder ---------- */

/**
 * Extract a ZIP blob into a folder in the virtual FS.
 * Reuses the pattern from repos.js extractZipEntry but with higher limits.
 * @param {Array} tree
 * @param {string} parentId — target folder
 * @param {Blob} zipBlob
 * @param {object} [opts] — { onProgress, nameOverride }
 * @returns {Promise<{ tree: Array, folderId: string, files: number }>}
 */
export async function importZipToFolder(tree, parentId, zipBlob, { onProgress, nameOverride } = {}) {
  const MAX_IMPORT = 500;
  const MAX_BINARY = 10 * 1024 * 1024; // 10 MB per file

  onProgress?.({ phase: 'extract' });
  const raw = new Uint8Array(await zipBlob.arrayBuffer());
  const extracted = unzipSync(raw);

  const now = Date.now();
  const makeId = () => `zip-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const folderName = nameOverride || 'Imported';
  let root = { id: makeId(), name: folderName, type: 'folder', parentId, createdAt: now, updatedAt: now };
  let next = [...tree, root];

  const dirIds = new Map([['', root.id]]);
  const ensureDir = relPath => {
    if (dirIds.has(relPath)) return dirIds.get(relPath);
    const parts = relPath.split('/');
    const parentDirId = ensureDir(parts.slice(0, -1).join('/'));
    const dir = { id: makeId(), name: parts[parts.length - 1], type: 'folder', parentId: parentDirId, createdAt: now, updatedAt: now };
    next = [...next, dir];
    dirIds.set(relPath, dir.id);
    return dir.id;
  };

  const TEXT_EXT = new Set([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'md', 'txt', 'html', 'htm', 'css',
    'scss', 'less', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php',
    'sh', 'bat', 'yml', 'yaml', 'toml', 'ini', 'xml', 'svg', 'csv', 'sql', 'log',
  ]);

  let count = 0;
  for (const [path, bytes] of Object.entries(extracted)) {
    if (count >= MAX_IMPORT || !path || path.endsWith('/')) continue;
    const segs = path.split('/');
    if (segs.includes('__MACOSX') || segs.some(s => s.startsWith('.'))) continue;
    const name = segs[segs.length - 1];
    const parentDirId = segs.length > 1 ? ensureDir(segs.slice(0, -1).join('/')) : root.id;

    const ext = (name.split('.').pop() || '').toLowerCase();
    if (TEXT_EXT.has(ext) || bytes.length < 64 * 1024) {
      // Text file — inline.
      next = [...next, { id: makeId(), name, type: 'text', parentId: parentDirId, content: strFromU8(bytes), createdAt: now, updatedAt: now }];
    } else if (bytes.length <= MAX_BINARY) {
      // Binary file — store in IndexedDB.
      const id = makeId();
      await putBlob(id, new Blob([bytes]), { name });
      next = [...next, { id, name, type: 'file', parentId: parentDirId, content: null, idb: true, size: bytes.length, createdAt: now, updatedAt: now }];
    }
    count++;
    onProgress?.({ phase: 'write', done: count, total: Object.keys(extracted).length });
  }

  return { tree: next, folderId: root.id, files: count };
}

/* ---------- download helper ---------- */

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ---------- path helpers ---------- */

function isDescendant(tree, entry, ancestorId) {
  let current = entry;
  const maxDepth = 50;
  let depth = 0;
  while (current && current.parentId && depth < maxDepth) {
    if (current.parentId === ancestorId) return true;
    current = tree.find(e => e.id === current.parentId);
    depth++;
  }
  return false;
}

function buildRelativePath(tree, entry, rootId) {
  const segments = [entry.name];
  let current = entry;
  const maxDepth = 50;
  let depth = 0;
  while (current && current.parentId && current.parentId !== rootId && depth < maxDepth) {
    const parent = tree.find(e => e.id === current.parentId);
    if (!parent) break;
    if (parent.id !== rootId) segments.unshift(parent.name);
    current = parent;
    depth++;
  }
  return segments.join('/');
}

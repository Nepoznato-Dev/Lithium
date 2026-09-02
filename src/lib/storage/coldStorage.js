import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { putBlob, getBlob, deleteBlob } from './manager';

/**
 * Cold storage tier — compresses idle files into ZIP archives in IndexedDB.
 *
 * When a folder (or selection) is "archived", every file inside is packed
 * into a single ZIP blob stored under the `cold:<archiveId>` key in the
 * IndexedDB `blobs` store. Each tree entry is then marked `cold: true` with
 * a `coldRef` pointing at its path inside the archive. The tree metadata
 * (name, type, parentId, timestamps) stays intact so the UI never changes.
 *
 * Reading a cold entry transparently extracts it from the ZIP on demand.
 * Decompressing restores the entry to its original inline/idb form.
 *
 * Benefits:
 *  - Many small files compress far better together than individually
 *  - IndexedDB usage drops significantly for large document trees
 *  - The whole archive is a single IndexedDB read (sequential I/O)
 */

const COLD_PREFIX = 'cold:';

/* ---------- archive creation ---------- */

/**
 * Compress a set of tree entries into a cold ZIP archive.
 * Entries with blobRef (models, OPFS) are skipped — they're already external.
 * @param {Array} tree — full virtual-FS tree
 * @param {string[]} entryIds — ids of entries to archive (files only; folders are traversed)
 * @param {object} [opts] — { onProgress({ phase, done, total }) }
 * @returns {Promise<{ tree: Array, archiveId: string, filesArchived: number, compressedSize: number }>}
 */
export async function coldArchive(tree, entryIds, { onProgress } = {}) {
  const now = Date.now();
  const archiveId = `cold-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Collect all file entries to archive (expand folders).
  const targets = [];
  const idSet = new Set(entryIds);
  for (const entry of tree) {
    if (!idSet.has(entry.id) && !idSet.has(entry.parentId)) continue;
    if (entry.type === 'folder') continue; // folders themselves aren't archived
    if (entry.blobRef) continue; // externally-owned — skip
    if (entry.cold) continue; // already cold
    if (entry.idb) {
      targets.push(entry);
    } else if (typeof entry.content === 'string' && entry.content.length > 0) {
      targets.push(entry);
    }
  }

  // Also include entries whose ancestor is in the idSet (deep folder archive).
  for (const entry of tree) {
    if (targets.some(t => t.id === entry.id)) continue;
    if (entry.type === 'folder' || entry.blobRef || entry.cold) continue;
    if (isDescendantOf(tree, entry, idSet)) {
      if (entry.idb || (typeof entry.content === 'string' && entry.content.length > 0)) {
        targets.push(entry);
      }
    }
  }

  if (targets.length === 0) return { tree, archiveId, filesArchived: 0, compressedSize: 0 };

  // Build the ZIP contents.
  onProgress?.({ phase: 'compress' });
  const zipEntries = {};
  for (const entry of targets) {
    const path = buildColdPath(tree, entry);
    if (entry.idb) {
      try {
        const blob = await getBlob(entry.id);
        if (blob) {
          zipEntries[path] = new Uint8Array(await blob.arrayBuffer());
        }
      } catch { /* skip unreadable */ }
    } else {
      zipEntries[path] = strToU8(entry.content || '');
    }
  }

  const compressed = zipSync(zipEntries, { level: 9 });
  const zipBlob = new Blob([compressed], { type: 'application/octet-stream' });

  // Store the ZIP in IndexedDB.
  const coldKey = COLD_PREFIX + archiveId;
  await putBlob(coldKey, zipBlob, { name: `cold-archive-${archiveId}`, coldArchive: true });

  // Update tree entries to point at the cold archive.
  let next = tree;
  let filesArchived = 0;
  for (const entry of targets) {
    const path = buildColdPath(tree, entry);
    next = next.map(e => {
      if (e.id !== entry.id) return e;
      filesArchived++;
      return {
        ...e,
        content: null,
        cold: true,
        coldRef: `${archiveId}/${path}`,
        coldOrigSize: e.idb ? (e.size || 0) : (e.content || '').length * 2,
        idb: false, // content now lives in the cold ZIP, not as a standalone blob
      };
    });
  }

  // If we moved idb entries, clean up their standalone blobs.
  for (const entry of targets) {
    if (entry.idb && !entry.blobRef) {
      await deleteBlob(entry.id).catch(() => {});
    }
  }

  onProgress?.({ phase: 'done' });
  return {
    tree: next,
    archiveId,
    filesArchived,
    compressedSize: compressed.length,
  };
}

/* ---------- decompression ---------- */

/**
 * Restore a single cold entry back to its original inline/idb form.
 * @param {Array} tree
 * @param {string} entryId
 * @returns {Promise<{ tree: Array, restored: boolean }>}
 */
export async function coldRestore(tree, entryId) {
  const entry = tree.find(e => e.id === entryId);
  if (!entry || !entry.cold) return { tree, restored: false };

  const [archiveId, ...pathParts] = entry.coldRef.split('/');
  const path = pathParts.join('/');
  const coldKey = COLD_PREFIX + archiveId;

  const blob = await getBlob(coldKey);
  if (!blob) return { tree, restored: false };

  const raw = new Uint8Array(await blob.arrayBuffer());
  const extracted = unzipSync(raw);
  const bytes = extracted[path];
  if (!bytes) return { tree, restored: false };

  // Determine if this should go back inline or to IndexedDB.
  const INLINE_LIMIT = 300000;
  let next = tree;
  if (bytes.length < INLINE_LIMIT) {
    const text = strFromU8(bytes);
    next = next.map(e => e.id === entryId
      ? { ...e, content: text, cold: false, coldRef: undefined, coldOrigSize: undefined, idb: false, size: text.length * 2 }
      : e
    );
  } else {
    await putBlob(entryId, new Blob([bytes]), { name: entry.name });
    next = next.map(e => e.id === entryId
      ? { ...e, content: null, cold: false, coldRef: undefined, coldOrigSize: undefined, idb: true, size: bytes.length }
      : e
    );
  }

  // Check if the archive has any remaining entries; if not, delete it.
  const remaining = tree.filter(e => e.cold && e.coldRef?.startsWith(archiveId + '/') && e.id !== entryId);
  if (remaining.length === 0) {
    await deleteBlob(coldKey).catch(() => {});
  }

  return { tree: next, restored: true };
}

/**
 * Restore all entries in a cold archive at once.
 * @param {Array} tree
 * @param {string} archiveId
 * @returns {Promise<{ tree: Array, restored: number }>}
 */
export async function coldRestoreAll(tree, archiveId) {
  const coldKey = COLD_PREFIX + archiveId;
  const blob = await getBlob(coldKey);
  if (!blob) return { tree, restored: 0 };

  const raw = new Uint8Array(await blob.arrayBuffer());
  const extracted = unzipSync(raw);
  const INLINE_LIMIT = 300000;

  let next = tree;
  let restored = 0;
  const blobWrites = [];

  for (const entry of tree) {
    if (!entry.cold || !entry.coldRef?.startsWith(archiveId + '/')) continue;
    const path = entry.coldRef.slice(archiveId.length + 1);
    const bytes = extracted[path];
    if (!bytes) continue;

    if (bytes.length < INLINE_LIMIT) {
      const text = strFromU8(bytes);
      next = next.map(e => e.id === entry.id
        ? { ...e, content: text, cold: false, coldRef: undefined, coldOrigSize: undefined, idb: false, size: text.length * 2 }
        : e
      );
    } else {
      blobWrites.push({ id: entry.id, bytes, name: entry.name });
      next = next.map(e => e.id === entry.id
        ? { ...e, content: null, cold: false, coldRef: undefined, coldOrigSize: undefined, idb: true, size: bytes.length }
        : e
      );
    }
    restored++;
  }

  // Batch-write all blobs.
  for (const { id, bytes, name } of blobWrites) {
    await putBlob(id, new Blob([bytes]), { name }).catch(() => {});
  }

  // Delete the cold archive.
  await deleteBlob(coldKey).catch(() => {});

  return { tree: next, restored };
}

/* ---------- reading cold entries ---------- */

/**
 * Read the content of a cold-stored entry (transparent extraction from ZIP).
 * Returns a string for text, or a Blob for binary.
 * @param {object} entry — a tree entry with cold: true
 * @returns {Promise<string|Blob|null>}
 */
export async function readColdEntry(entry) {
  if (!entry.cold || !entry.coldRef) return null;
  const [archiveId, ...pathParts] = entry.coldRef.split('/');
  const path = pathParts.join('/');
  const coldKey = COLD_PREFIX + archiveId;

  const blob = await getBlob(coldKey);
  if (!blob) return null;

  const raw = new Uint8Array(await blob.arrayBuffer());
  const extracted = unzipSync(raw);
  const bytes = extracted[path];
  if (!bytes) return null;

  // Heuristic: if the original entry was text-like, return as string.
  if (entry.type === 'text' || entry.type === 'markdown' || bytes.length < 64 * 1024) {
    return strFromU8(bytes);
  }
  return new Blob([bytes]);
}

/* ---------- introspection ---------- */

/**
 * Total bytes consumed by all cold archives in IndexedDB.
 * @returns {Promise<{ archives: number, compressedBytes: number, originalBytes: number, entries: number }>}
 */
export async function coldStorageUsage() {
  const { idbKeys } = await import('./indexedDB');
  const keys = await idbKeys('blobs');
  let archives = 0;
  let compressedBytes = 0;
  let originalBytes = 0;
  let entries = 0;

  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(COLD_PREFIX)) continue;
    archives++;
    try {
      const record = await getBlob(key);
      if (record) compressedBytes += record.size || 0;
    } catch { /* skip */ }
  }

  // Count cold entries in the tree (from unifiedStore).
  try {
    const { getTree } = await import('./unifiedStore');
    const tree = getTree();
    for (const entry of tree) {
      if (entry.cold) {
        entries++;
        originalBytes += entry.coldOrigSize || 0;
      }
    }
  } catch { /* tree not hydrated */ }

  return { archives, compressedBytes, originalBytes, entries };
}

/**
 * List all cold archives with metadata.
 * @returns {Promise<Array<{ archiveId: string, compressedSize: number, entries: number, createdAt: number }>>}
 */
export async function listColdArchives() {
  const { idbKeys } = await import('./indexedDB');
  const keys = await idbKeys('blobs');
  const archives = [];

  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(COLD_PREFIX)) continue;
    const archiveId = key.slice(COLD_PREFIX.length);
    let compressedSize = 0;
    try {
      const record = await getBlob(key);
      if (record) compressedSize = record.size || 0;
    } catch { /* skip */ }
    archives.push({ archiveId, coldKey: key, compressedSize });
  }

  // Count entries per archive from the tree.
  try {
    const { getTree } = await import('./unifiedStore');
    const tree = getTree();
    for (const entry of tree) {
      if (!entry.cold || !entry.coldRef) continue;
      const aid = entry.coldRef.split('/')[0];
      const arch = archives.find(a => a.archiveId === aid);
      if (arch) {
        arch.entries = (arch.entries || 0) + 1;
        arch.originalSize = (arch.originalSize || 0) + (entry.coldOrigSize || 0);
      }
    }
  } catch { /* tree not hydrated */ }

  return archives;
}

/* ---------- helpers ---------- */

function isDescendantOf(tree, entry, ancestorIds) {
  let current = entry;
  const maxDepth = 50;
  let depth = 0;
  while (current && current.parentId && depth < maxDepth) {
    if (ancestorIds.has(current.parentId)) return true;
    current = tree.find(e => e.id === current.parentId);
    depth++;
  }
  return false;
}

/** Build a filesystem-like path inside the cold archive for an entry. */
function buildColdPath(tree, entry) {
  const segments = [entry.name];
  let current = entry;
  const maxDepth = 50;
  let depth = 0;
  while (current && current.parentId && depth < maxDepth) {
    const parent = tree.find(e => e.id === current.parentId);
    if (!parent) break;
    segments.unshift(parent.name || 'root');
    current = parent;
    depth++;
  }
  return segments.join('/');
}

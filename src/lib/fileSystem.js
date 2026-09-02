import { useCallback, useEffect, useState } from 'react';
import { deleteBlob, getBlob, putBlob } from './storage/manager';
import { getTree, hydrate, registerSeeder, setTree } from './storage/unifiedStore';
import { fsOpSync } from './core';

/**
 * Virtual file system. The tree lives in the unified store (memory-first,
 * wasm-compressed binary snapshots in IndexedDB); heavy tree transforms
 * (remove/duplicate/move/path) run in the Rust core.
 * Entries: { id, name, type: 'folder' | 'text' | 'image' | 'video', parentId, content, createdAt, updatedAt }
 */

const SYNC_EVENT = 'lithium:fs-changed';

/** Text under this size stays inline in the snapshot; bigger payloads go to IndexedDB. */
export const INLINE_LIMIT = 300000;

function defaultTree() {
  const now = Date.now();
  const root = { id: 'root', name: 'Home', type: 'folder', parentId: null, createdAt: now, updatedAt: now };
  const folders = ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos', 'Notes', 'Models', 'Projects'].map(name => ({
    id: `default-${name.toLowerCase()}`,
    name,
    type: 'folder',
    parentId: 'root',
    createdAt: now,
    updatedAt: now,
  }));
  folders.push({ id: 'default-trash', name: 'Recycle Bin', type: 'folder', parentId: 'root', createdAt: now, updatedAt: now, system: true });
  const welcome = {
    id: 'default-readme',
    name: 'Welcome.txt',
    type: 'text',
    parentId: 'default-documents',
    content: 'Welcome to Lithium!\n\nThis is your personal file space. Everything here is stored\nlocally in this browser — create folders, write notes, and\nsave photos from the Photos app.',
    createdAt: now,
    updatedAt: now,
  };
  // The Notes vault lives inside Documents so it also appears at C:\Documents\Notes.
  const notesFolder = folders.find(folder => folder.name === 'Notes');
  if (notesFolder) notesFolder.parentId = 'default-documents';
  // User widgets live at Documents/Widgets and are executed by widgetRuntime.
  folders.push({
    id: 'default-widgets',
    name: 'Widgets',
    type: 'folder',
    parentId: 'default-documents',
    createdAt: now,
    updatedAt: now,
  });
  return [root, ...folders, welcome];
}

export function loadTree() {
  return getTree();
}

export function saveTree(tree) {
  setTree(tree);
}

// Seed first-run defaults and reconcile migrations inside the unified store.
registerSeeder((current, hadData) => {
  if (!hadData && (!current || current.length === 0)) return defaultTree();
  if (!Array.isArray(current) || current.length === 0) return null;
  const now = Date.now();
  let changed = false;
  const next = [...current];
  for (const entry of defaultTree()) {
    if (entry.type === 'folder' && entry.id !== 'root' && !next.some(item => item.id === entry.id)) {
      next.push({ ...entry, createdAt: now, updatedAt: now });
      changed = true;
    }
  }
  const notesIndex = next.findIndex(entry => entry.id === 'default-notes');
  if (notesIndex >= 0 && next[notesIndex].parentId === 'root') {
    next[notesIndex] = { ...next[notesIndex], parentId: 'default-documents' };
    changed = true;
  }
  // Migrate: ensure Recycle Bin exists.
  if (!next.some(entry => entry.id === TRASH_ID)) {
    next.push({ id: TRASH_ID, name: 'Recycle Bin', type: 'folder', parentId: 'root', createdAt: now, updatedAt: now, system: true });
    changed = true;
  }
  return changed ? next : null;
});

/** React hook: synced tree state shared across all open windows/apps. */
export function useFileSystem() {
  const [tree, setTreeState] = useState(getTree);

  useEffect(() => {
    const onSync = () => setTreeState(getTree());
    window.addEventListener(SYNC_EVENT, onSync);
    hydrate();
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const commit = useCallback(next => {
    setTree(next);
  }, []);

  return [tree, commit];
}

export function getEntry(tree, id) {
  return fsOpSync({ op: 'entry', tree, id }) || null;
}

export function childrenOf(tree, folderId) {
  return fsOpSync({ op: 'children', tree, id: folderId }) || [];
}

export function pathOf(tree, id) {
  return fsOpSync({ op: 'path', tree, id }) || [];
}

function makeId() {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEntry(tree, { name, type, parentId, content = '' }) {
  const now = Date.now();
  const entry = { id: makeId(), name, type, parentId, content, createdAt: now, updatedAt: now };
  return [...tree, entry];
}

export function updateEntry(tree, id, changes) {
  return tree.map(entry => (entry.id === id ? { ...entry, ...changes, updatedAt: Date.now() } : entry));
}

/** Remove an entry and everything inside it (for folders). */
export function removeEntry(tree, id) {
  return fsOpSync({ op: 'remove', tree, id }) || tree;
}

/** Deep-copy an entry (and folder contents) into a new parent with fresh ids.
 *  Returns { tree, idMap } so callers can copy IndexedDB payloads too. */
export function duplicateSubtree(tree, id, parentId, suffix = ' (copy)') {
  const native = fsOpSync({
    op: 'duplicate',
    tree,
    id,
    parentId,
    suffix,
    seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    now: Date.now(),
  });
  if (native) return { tree: native.tree, idMap: new Map(Object.entries(native.idMap)) };
  return { tree, idMap: new Map() };
}

/** duplicateSubtree + copies any IndexedDB blobs to the new entry ids.
 *  Entries with a blobRef keep sharing the externally-owned blob. */
export async function duplicateSubtreeDeep(tree, id, parentId, suffix) {
  const { tree: next, idMap } = duplicateSubtree(tree, id, parentId, suffix);
  await Promise.all(
    [...idMap.entries()].map(async ([oldId, newId]) => {
      const entry = getEntry(tree, oldId);
      if (entry?.idb && !entry.blobRef) {
        const blob = await getBlob(oldId);
        if (blob) await putBlob(newId, blob, { name: entry.name });
      }
    })
  );
  return next;
}

/** Reparent an entry (guards against moving a folder into itself). */
export function canMoveInto(tree, id, parentId) {
  if (id === parentId) return false;
  return !doomedList(tree, id).has(parentId);
}

export function moveEntry(tree, id, parentId) {
  if (!canMoveInto(tree, id, parentId)) return tree;
  return fsOpSync({ op: 'move', tree, id, parentId, now: Date.now() }) || tree;
}

/** Collect all folder ids inside a subtree (used to avoid paste loops). */
export function subtreeFolderIds(tree, id) {
  return fsOpSync({ op: 'folders', tree, id }) || [];
}

/** Array form of doomedIds (wasm-first) for blob cleanup paths. */
function doomedList(tree, id) {
  return new Set(fsOpSync({ op: 'doomed', tree, id }) || []);
}

/* ---------- Content tiering: localStorage (small) vs IndexedDB (large) ---------- */

/** Storage usage of the virtual FS in bytes (approximate). */
export function usedBytes(tree) {
  const result = fsOpSync({ op: 'used_bytes', tree });
  return (result && typeof result.total === 'number') ? result.total : 0;
}

/** Decide where content lives; returns the entry updated accordingly. */
export async function storeEntryContent(entry, content) {
  if (content && (entry.type === 'image' || entry.type === 'video' || entry.type === 'file' || content.length > INLINE_LIMIT)) {
    await putBlob(entry.id, content, { name: entry.name });
    return { ...entry, content: null, idb: true, size: content.length * 2 };
  }
  return { ...entry, content: content || '', idb: false, size: (content || '').length * 2 };
}

export async function readEntryContent(entry) {
  // Cold-stored entries live inside a ZIP archive in IndexedDB.
  if (entry.cold) {
    const { readColdEntry } = await import('./storage/coldStorage');
    return (await readColdEntry(entry)) || '';
  }
  // blobRef entries point at an externally-owned blob (e.g. model GGUFs).
  if (entry.idb) {
    const ref = String(entry.blobRef || '');
    if (ref.startsWith('model:')) {
      // Model blobs may live in OPFS (large downloads) or IndexedDB.
      const { getModelBlob } = await import('./ai/models');
      return (await getModelBlob(ref.slice('model:'.length))) || '';
    }
    if (ref.startsWith('opfs:')) {
      const { opfsGetFile } = await import('./storage/indexedDB');
      return (await opfsGetFile(ref.slice('opfs:'.length)).catch(() => null)) || '';
    }
    return (await getBlob(entry.blobRef || entry.id)) || '';
  }
  return entry.content || '';
}

/** Remove entries plus any IndexedDB payloads they own (blobRef blobs are
 *  externally owned and left intact; cold entries clean up their archive). */
export async function removeEntryDeep(tree, id) {
  const doomed = doomedList(tree, id);
  // Clean up standalone IDB blobs.
  await Promise.all(
    tree.filter(entry => doomed.has(entry.id) && entry.idb && !entry.blobRef).map(entry => deleteBlob(entry.id))
  );
  // Clean up cold archives that become empty.
  const coldArchiveIds = new Set();
  for (const entry of tree) {
    if (doomed.has(entry.id) && entry.cold && entry.coldRef) {
      coldArchiveIds.add(entry.coldRef.split('/')[0]);
    }
  }
  const remaining = tree.filter(entry => !doomed.has(entry.id));
  for (const archiveId of coldArchiveIds) {
    const stillCold = remaining.filter(e => e.cold && e.coldRef?.startsWith(archiveId + '/'));
    if (stillCold.length === 0) {
      await deleteBlob(`cold:${archiveId}`).catch(() => {});
    }
  }
  return remaining;
}

/* ---------- Recycle Bin ---------- */

/** Recycle bin lives at root as a system folder; we materialise it lazily
 *  because older trees predate the feature. */
export const TRASH_ID = 'default-trash';

export function ensureTrashFolder(tree) {
  if (tree.some(entry => entry.id === TRASH_ID)) return tree;
  const now = Date.now();
  return [...tree, { id: TRASH_ID, name: 'Recycle Bin', type: 'folder', parentId: 'root', createdAt: now, updatedAt: now, system: true }];
}

export function isTrashed(entry) {
  return Boolean(entry && entry.parentId === TRASH_ID);
}

export function trashedItems(tree) {
  return tree.filter(entry => entry.parentId === TRASH_ID);
}

/** Move an entry (and its children for folders) into the Recycle Bin. */
export function trashEntry(tree, id) {
  const withTrash = ensureTrashFolder(tree);
  return fsOpSync({ op: 'trash', tree: withTrash, id, trashId: TRASH_ID, now: Date.now() }) || withTrash;
}

/** Restore a trashed entry back to its original parent (or root if missing). */
export function restoreEntry(tree, id) {
  const target = getEntry(tree, id);
  if (!target || !isTrashed(target)) return tree;
  return fsOpSync({ op: 'restore', tree, id, now: Date.now() }) || tree;
}

/** Permanently delete everything in the Recycle Bin. Returns the next tree
 *  (IndexedDB blobs owned by purged entries are deleted too; cold archives
 *  that become empty are cleaned up). */
export async function purgeTrash(tree) {
  const doomed = trashedItems(tree);
  if (doomed.length === 0) return tree;
  await Promise.all(
    doomed.filter(entry => entry.idb && !entry.blobRef).map(entry => deleteBlob(entry.id))
  );
  // Clean up cold archives that become empty after trash purge.
  const coldArchiveIds = new Set();
  for (const entry of doomed) {
    if (entry.cold && entry.coldRef) coldArchiveIds.add(entry.coldRef.split('/')[0]);
  }
  const doomedIds = new Set(doomed.map(entry => entry.id));
  const remaining = tree.filter(entry => !doomedIds.has(entry.id));
  for (const archiveId of coldArchiveIds) {
    const stillCold = remaining.filter(e => e.cold && e.coldRef?.startsWith(archiveId + '/'));
    if (stillCold.length === 0) {
      await deleteBlob(`cold:${archiveId}`).catch(() => {});
    }
  }
  return remaining;
}

/** One-time migration: move oversized inline content into IndexedDB. */
export async function migrateTree(tree, commit) {
  const oversized = tree.filter(entry => !entry.idb && typeof entry.content === 'string' && entry.content.length > INLINE_LIMIT);
  if (!oversized.length) return;
  let next = tree;
  for (const entry of oversized) {
    try {
      const updated = await storeEntryContent(entry, entry.content);
      next = next.map(item => (item.id === entry.id ? updated : item));
    } catch { /* keep inline if IDB is unavailable */ }
  }
  commit(next);
}

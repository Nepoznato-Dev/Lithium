/**
 * Local provider — wraps fileSystem.js tree operations and routes
 * heavy computation through Rust via explorerOpSync.
 */
import { fsOpSync, explorerOpSync } from '../../core.js';
import {
  childrenOf, getEntry, createEntry, updateEntry,
  moveEntry as fsMoveEntry, trashEntry, removeEntryDeep,
  duplicateSubtreeDeep, readEntryContent, pathOf,
  TRASH_ID,
} from '../../fileSystem.js';
import { sortField, sortDirection, showHiddenFiles } from '../state/signals.jsx';

/** Top-level folders in the tree. */
export function enumerateRoots(tree) {
  return childrenOf(tree, 'root');
}

/** Children of a folder, sorted and filtered via Rust. */
export function enumerateChildren(tree, folderId) {
  const field = sortField.value;
  const direction = sortDirection.value;
  const hidden = showHiddenFiles.value;

  const result = explorerOpSync({
    op: 'sort_filter', tree, folderId,
    field, direction, showHidden: hidden,
  });
  if (result && Array.isArray(result)) return result;

  // JS fallback
  return childrenOf(tree, folderId);
}

/** Read a single entry by ID. */
export function readEntry(tree, pidl) {
  return getEntry(tree, pidl);
}

/** Create a new folder entry. Returns the new tree. */
export function createFolder(tree, parentId, name) {
  return createEntry(tree, { name, type: 'folder', parentId });
}

/** Delete an entry (trash or permanent). Returns the new tree. */
export async function deleteEntry(tree, pidl, permanent = false) {
  if (permanent) return await removeEntryDeep(tree, pidl);
  return trashEntry(tree, pidl);
}

/** Rename an entry. Returns the new tree. */
export function renameEntry(tree, pidl, name) {
  return updateEntry(tree, pidl, { name });
}

/** Move an entry to a new parent. Returns the new tree. */
export function moveEntry(tree, pidl, destId) {
  return fsMoveEntry(tree, pidl, destId);
}

/** Copy an entry (deep) to a new parent. Returns the new tree. */
export async function copyEntry(tree, pidl, destId) {
  return await duplicateSubtreeDeep(tree, pidl, destId);
}

/** Read file content. */
export async function readFile(tree, pidl) {
  const entry = getEntry(tree, pidl);
  if (!entry) return '';
  return await readEntryContent(entry);
}

/** Build breadcrumb path for an entry. */
export function getBreadcrumbs(tree, pidl) {
  return pathOf(tree, pidl) || [];
}

/** Check if a folder is the Recycle Bin. */
export function isTrash(folderId) {
  return folderId === TRASH_ID;
}

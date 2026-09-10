/**
 * Computed selectors that derive data from the tree + signals.
 * Heavy computation (sort, filter, search) is delegated to Rust via explorerOpSync.
 * Each function has a JS fallback for when WASM isn't loaded.
 */
import { explorerOpSync } from '../../core.js';
import { childrenOf, getEntry } from '../../fileSystem.js';
import { sortField, sortDirection, showHiddenFiles } from './signals';

// ── JS fallback sort (folders-first, then by field) ──

function jsSort(entries, field, direction) {
  const sorted = [...entries].sort((a, b) => {
    const ta = a.type || '';
    const tb = b.type || '';
    if (ta === 'folder' && tb !== 'folder') return -1;
    if (ta !== 'folder' && tb === 'folder') return 1;

    let cmp = 0;
    switch (field) {
      case 'size': cmp = (a.size || 0) - (b.size || 0); break;
      case 'modified': cmp = (a.updatedAt || 0) - (b.updatedAt || 0); break;
      case 'type': cmp = ta.localeCompare(tb); break;
      default: cmp = (a.name || '').localeCompare(b.name || '');
    }
    return direction === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

function jsFilter(entries, showHidden, typeFilter) {
  return entries.filter(e => {
    if (!showHidden && e.name?.startsWith('.')) return false;
    if (typeFilter && e.type !== typeFilter) return false;
    return true;
  });
}

// ── Public selectors ──

/**
 * Sorted + filtered children of a folder.
 * Hot path: called on every navigation. Uses Rust when available.
 */
export function sortedFilteredChildren(tree, folderId) {
  const field = sortField.value;
  const direction = sortDirection.value;
  const hidden = showHiddenFiles.value;

  const result = explorerOpSync({
    op: 'sort_filter', tree, folderId,
    field, direction, showHidden: hidden,
  });
  if (result && Array.isArray(result)) return result;

  // JS fallback
  const children = childrenOf(tree, folderId);
  return jsSort(jsFilter(children, hidden), field, direction);
}

/**
 * Search the tree by name substring.
 * Returns [{id, name, type, path}, ...].
 */
export function searchTree(tree, query, scopeId, typeFilter, limit = 100) {
  const result = explorerOpSync({
    op: 'search', tree, query,
    scopeId: scopeId || undefined,
    typeFilter: typeFilter || undefined,
    limit,
  });
  if (result && Array.isArray(result)) return result;

  // JS fallback
  const q = query.toLowerCase();
  const results = [];
  for (const entry of tree) {
    if (results.length >= limit) break;
    if (!entry.id || entry.id === 'root') continue;
    if (typeFilter && entry.type !== typeFilter) continue;
    if (q && !entry.name?.toLowerCase().includes(q)) continue;
    results.push({ id: entry.id, name: entry.name, type: entry.type, path: '' });
  }
  return results;
}

/**
 * Last N modified non-folder entries.
 */
export function recentFiles(tree, limit = 12) {
  const result = explorerOpSync({ op: 'recent', tree, limit });
  if (result && Array.isArray(result)) return result;

  // JS fallback
  return tree
    .filter(e => e.type !== 'folder' && e.id && e.id !== 'root')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit)
    .map(e => ({ id: e.id, name: e.name, type: e.type, size: e.size, updatedAt: e.updatedAt, path: '' }));
}

/**
 * All image entries sorted by modified date desc.
 */
export function galleryFiles(tree, limit = 200) {
  const result = explorerOpSync({ op: 'gallery', tree, limit });
  if (result && Array.isArray(result)) return result;

  // JS fallback
  return tree
    .filter(e => e.type === 'image')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit)
    .map(e => ({ id: e.id, name: e.name, path: '', size: e.size, updatedAt: e.updatedAt }));
}

/**
 * Detect MIME type from file name.
 * Returns { mime, category }.
 */
export function detectMime(name) {
  const result = explorerOpSync({ op: 'mime', name });
  if (result) return result;

  // JS fallback — small lookup table
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', txt: 'text/plain', md: 'text/markdown',
    html: 'text/html', json: 'application/json', pdf: 'application/pdf',
    zip: 'application/zip', gguf: 'application/x-gguf',
  };
  const mime = map[ext] || 'application/octet-stream';
  const category = mime.split('/')[0];
  return { mime, category };
}

/**
 * Check for name collisions in a destination folder.
 * Returns { conflicts: [{name, existingId}], clean: [string] }.
 */
export function checkConflicts(tree, names, destId) {
  const result = explorerOpSync({ op: 'conflict', tree, names, destId });
  if (result) return result;

  // JS fallback
  const existing = new Map(
    tree
      .filter(e => e.parentId === destId)
      .map(e => [(e.name || '').toLowerCase(), e.id])
  );
  const conflicts = [];
  const clean = [];
  for (const name of names) {
    const existingId = existing.get(name.toLowerCase());
    if (existingId) conflicts.push({ name, existingId });
    else clean.push(name);
  }
  return { conflicts, clean };
}

/**
 * Build breadcrumb path for an entry.
 */
export function breadcrumbsFor(tree, entryId) {
  if (!entryId || entryId === 'root') return [{ id: 'root', name: 'Local Disk (C:)' }];
  const entry = getEntry(tree, entryId);
  if (!entry) return [{ id: 'root', name: 'Local Disk (C:)' }];
  const crumbs = [{ id: entry.id, name: entry.name }];
  let current = entry.parentId;
  let guard = tree.length + 1;
  while (current && current !== 'root' && guard > 0) {
    guard--;
    const parent = getEntry(tree, current);
    if (!parent) break;
    crumbs.unshift({ id: parent.id, name: parent.name });
    current = parent.parentId;
  }
  crumbs.unshift({ id: 'root', name: 'Local Disk (C:)' });
  return crumbs;
}

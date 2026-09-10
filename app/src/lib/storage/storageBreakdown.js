import { getTree } from './unifiedStore';
import { idbKeys, idbGet } from './indexedDB';
import { formatBytes } from './manager';

/**
 * StorageBreakdown — WizTree-style storage analysis engine.
 *
 * Computes detailed breakdowns of storage consumption by:
 *   1. Folder hierarchy (which folders consume the most space)
 *   2. File type (images, videos, text, models, archives, etc.)
 *   3. Storage tier (inline vs IndexedDB vs cold vs OPFS vs blobRef)
 *   4. Top N largest files
 *
 * All calculations are optimized for speed — the engine caches intermediate
 * results and only recomputes when the tree changes.
 */

const TYPE_COLORS = {
  image: '#f472b6',
  video: '#a78bfa',
  text: '#60a5fa',
  markdown: '#60a5fa',
  file: '#f59e0b',
  model: '#22c55e',
  archive: '#ef4444',
  folder: '#38bdf8',
  other: '#94a3b8',
};

let cachedBreakdown = null;
let cachedTreeRef = null;
let computePromise = null;

/**
 * Estimate the byte size of a single tree entry.
 * Uses entry.size if available, otherwise estimates from content length.
 */
function estimateEntrySize(entry) {
  if (entry.type === 'folder') return 0;
  if (typeof entry.size === 'number' && entry.size > 0) return entry.size;
  if (entry.coldOrigSize) return entry.coldOrigSize;
  if (entry.idb && !entry.content) return 0;
  if (typeof entry.content === 'string') return entry.content.length * 2;
  return 0;
}

/**
 * Classify an entry into a storage type category.
 */
function classifyEntry(entry) {
  if (entry.type === 'folder') return 'folder';
  if (entry.blobRef?.startsWith('model:')) return 'model';
  if (entry.blobRef?.startsWith('opfs:')) return 'opfs';
  if (entry.cold) return 'cold';
  if (entry.idb) return 'indexedDB';
  if (entry.blobRef) return 'blobRef';
  return 'inline';
}

/**
 * Classify an entry into a file-type category for visualization.
 */
function classifyFileType(entry) {
  if (entry.type === 'image') return 'image';
  if (entry.type === 'video') return 'video';
  if (entry.type === 'text' || entry.type === 'markdown') return 'text';
  if (entry.blobRef?.startsWith('model:')) return 'model';
  const name = (entry.name || '').toLowerCase();
  if (/\.(zip|tar|gz|rar|7z)$/i.test(name)) return 'archive';
  if (/\.(gguf|bin|onnx)$/i.test(name)) return 'model';
  if (entry.type === 'file') return 'file';
  return 'other';
}

/**
 * Build a folder-tree breakdown with aggregated sizes.
 * Returns a nested structure where each folder contains its children's totals.
 */
function buildFolderTree(entries) {
  const entryMap = new Map();
  const folderNodes = new Map();

  for (const entry of entries) {
    entryMap.set(entry.id, entry);
  }

  for (const entry of entries) {
    if (entry.type !== 'folder') continue;
    folderNodes.set(entry.id, {
      id: entry.id,
      name: entry.name,
      parentId: entry.parentId,
      selfSize: 0,
      totalSize: 0,
      fileCount: 0,
      folderCount: 0,
      typeBreakdown: {},
      tierBreakdown: { inline: 0, indexedDB: 0, cold: 0, opfs: 0, model: 0, blobRef: 0 },
      children: [],
      depth: 0,
    });
  }

  for (const entry of entries) {
    if (entry.type === 'folder') continue;
    const size = estimateEntrySize(entry);
    const fileType = classifyFileType(entry);
    const tier = classifyEntry(entry);

    let currentFolderId = entry.parentId;
    const visited = new Set();
    while (currentFolderId && folderNodes.has(currentFolderId) && !visited.has(currentFolderId)) {
      visited.add(currentFolderId);
      const node = folderNodes.get(currentFolderId);
      node.totalSize += size;
      node.fileCount += 1;
      node.typeBreakdown[fileType] = (node.typeBreakdown[fileType] || 0) + size;
      node.tierBreakdown[tier] = (node.tierBreakdown[tier] || 0) + size;
      if (currentFolderId === entry.parentId) {
        node.selfSize += size;
      }
      currentFolderId = entryMap.get(currentFolderId)?.parentId;
    }
  }

  for (const node of folderNodes.values()) {
    if (node.parentId && folderNodes.has(node.parentId)) {
      folderNodes.get(node.parentId).children.push(node.id);
      folderNodes.get(node.parentId).folderCount += 1;
    }
  }

  for (const node of folderNodes.values()) {
    let depth = 0;
    let pid = node.parentId;
    const seen = new Set();
    while (pid && folderNodes.has(pid) && !seen.has(pid)) {
      seen.add(pid);
      depth++;
      pid = folderNodes.get(pid).parentId;
    }
    node.depth = depth;
  }

  return folderNodes;
}

/**
 * Compute the full storage breakdown.
 * @param {Array} [tree] — optional tree override (defaults to current hydrated tree)
 * @returns {Promise<object>} breakdown result
 */
export async function computeBreakdown(tree) {
  const currentTree = tree || getTree();
  if (cachedTreeRef === currentTree && cachedBreakdown) return cachedBreakdown;
  if (computePromise) return computePromise;

  computePromise = (async () => {
    const files = currentTree.filter(e => e.type !== 'folder');
    const folders = currentTree.filter(e => e.type === 'folder');

    let totalSize = 0;
    let totalFiles = files.length;
    let totalFolders = folders.length;
    const typeTotals = {};
    const tierTotals = {};
    const fileSizes = [];

    for (const entry of files) {
      const size = estimateEntrySize(entry);
      totalSize += size;
      const fileType = classifyFileType(entry);
      const tier = classifyEntry(entry);
      typeTotals[fileType] = (typeTotals[fileType] || 0) + size;
      tierTotals[tier] = (tierTotals[tier] || 0) + size;
      fileSizes.push({ id: entry.id, name: entry.name, type: fileType, size, tier, parentId: entry.parentId, updatedAt: entry.updatedAt });
    }

    fileSizes.sort((a, b) => b.size - a.size);

    const folderTree = buildFolderTree(currentTree);

    const rootFolder = folderTree.get('root');
    const topFolders = [...folderTree.values()]
      .filter(n => n.id !== 'root')
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 20)
      .map(n => ({
        id: n.id,
        name: n.name,
        totalSize: n.totalSize,
        selfSize: n.selfSize,
        fileCount: n.fileCount,
        folderCount: n.folderCount,
        depth: n.depth,
        typeBreakdown: n.typeBreakdown,
      }));

    const typeBreakdown = Object.entries(typeTotals)
      .map(([type, bytes]) => ({ type, bytes, color: TYPE_COLORS[type] || TYPE_COLORS.other, pct: totalSize > 0 ? (bytes / totalSize) * 100 : 0 }))
      .sort((a, b) => b.bytes - a.bytes);

    const tierBreakdown = Object.entries(tierTotals)
      .map(([tier, bytes]) => ({ tier, bytes, pct: totalSize > 0 ? (bytes / totalSize) * 100 : 0 }))
      .sort((a, b) => b.bytes - a.bytes);

    let idbBlobCount = 0;
    let coldArchiveCount = 0;
    let opfsCount = 0;
    try {
      const keys = await idbKeys('blobs');
      for (const key of keys) {
        if (typeof key !== 'string') continue;
        if (key.startsWith('cold:')) coldArchiveCount++;
        else if (key.startsWith('opfs:')) opfsCount++;
        else idbBlobCount++;
      }
    } catch {}

    const result = {
      totalSize,
      totalFiles,
      totalFolders,
      topFolders,
      typeBreakdown,
      tierBreakdown,
      topFiles: fileSizes.slice(0, 50),
      folderTree,
      idbBlobCount,
      coldArchiveCount,
      opfsCount,
      computedAt: Date.now(),
    };

    cachedBreakdown = result;
    cachedTreeRef = currentTree;
    computePromise = null;
    return result;
  })();

  return computePromise;
}

/**
 * Get the breakdown for a specific folder (flat children + aggregated).
 */
export function getFolderBreakdown(breakdown, folderId) {
  if (!breakdown?.folderTree) return null;
  const node = breakdown.folderTree.get(folderId);
  if (!node) return null;
  return {
    ...node,
    typeBreakdown: Object.entries(node.typeBreakdown)
      .map(([type, bytes]) => ({ type, bytes, color: TYPE_COLORS[type] || TYPE_COLORS.other }))
      .sort((a, b) => b.bytes - a.bytes),
    tierBreakdown: Object.entries(node.tierBreakdown)
      .map(([tier, bytes]) => ({ tier, bytes }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

/**
 * Invalidate the cached breakdown (call after tree mutations).
 */
export function invalidateBreakdown() {
  cachedBreakdown = null;
  cachedTreeRef = null;
}

/**
 * Generate a treemap layout for rectangular visualization.
 * Uses a simple slice-and-dice algorithm for fast rendering.
 * @param {Array<{id, name, size, color}>} items — items to lay out
 * @param {{x, y, w, h}} rect — bounding rectangle
 * @returns {Array<{id, name, x, y, w, h, color, label, sizeLabel}>}
 */
export function computeTreemap(items, rect) {
  if (!items.length) return [];
  const total = items.reduce((sum, item) => sum + (item.size || 0), 0);
  if (total === 0) return [];

  const sorted = [...items].sort((a, b) => (b.size || 0) - (a.size || 0));
  const result = [];
  layoutSliceDice(sorted, rect, total, result);
  return result;
}

function layoutSliceDice(items, rect, total, result) {
  if (items.length === 0 || total === 0) return;
  if (items.length === 1) {
    const item = items[0];
    result.push({
      id: item.id,
      name: item.name,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      color: item.color || '#94a3b8',
      label: item.name,
      sizeLabel: formatBytes(item.size || 0),
      size: item.size || 0,
    });
    return;
  }

  const horizontal = rect.w >= rect.h;
  let offset = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const fraction = (item.size || 0) / total;
    if (fraction <= 0) continue;

    if (horizontal) {
      const w = Math.max(1, Math.round(rect.w * fraction));
      result.push({
        id: item.id,
        name: item.name,
        x: rect.x + offset,
        y: rect.y,
        w: Math.min(w, rect.w - offset),
        h: rect.h,
        color: item.color || '#94a3b8',
        label: item.name,
        sizeLabel: formatBytes(item.size || 0),
        size: item.size || 0,
      });
      offset += w;
    } else {
      const h = Math.max(1, Math.round(rect.h * fraction));
      result.push({
        id: item.id,
        name: item.name,
        x: rect.x,
        y: rect.y + offset,
        w: rect.w,
        h: Math.min(h, rect.h - offset),
        color: item.color || '#94a3b8',
        label: item.name,
        sizeLabel: formatBytes(item.size || 0),
        size: item.size || 0,
      });
      offset += h;
    }
  }
}

export { TYPE_COLORS };

import { computeCall } from '../compute';
import { getBlob } from './manager';
import { putBlob } from './liStorage';

const _enc = new TextEncoder();
const _dec = new TextDecoder();

/**
 * TAR + GZip archive engine — folder export & import using native CompressionStream.
 *
 * TAR format: POSIX/USTAR with 512-byte blocks.
 * GZip layer: browser-native CompressionStream('gzip') / DecompressionStream('gzip').
 *
 * TAR byte math runs in the shared compute Web Worker (archive.tarBuild /
 * archive.tarParse). JS on this thread owns the I/O boundary: IndexedDB blob
 * reads, CompressionStream gzip, Blob construction, and tree entry creation.
 */

/* ---------- create a TAR+GZip of a folder ---------- */

/**
 * Collect all entries under a folder and create a .tar.gz Blob.
 * @param {Array} tree
 * @param {string} folderId — the root folder to export
 * @param {object} [opts] — { onProgress({ phase, done, total }) }
 * @returns {Promise<Blob>}
 */
export async function exportFolderTar(tree, folderId, { onProgress } = {}) {
  const folder = tree.find(entry => entry.id === folderId);
  if (!folder || folder.type !== 'folder') throw new Error('Folder not found');

  const children = tree.filter(entry =>
    entry.parentId === folderId || isDescendant(tree, entry, folderId),
  );

  // Collect file entries
  const fileChildren = children.filter(c => c.type !== 'folder');
  const parts = [];
  let done = 0;

  for (const child of fileChildren) {
    const relPath = buildRelativePath(tree, child, folderId);
    let bytes;

    if (child.idb && child.blobRef) {
      // Skip externally-owned blobs (models, OPFS).
      done++;
      continue;
    } else if (child.idb) {
      try {
        const blob = await getBlob(child.id);
        if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
      } catch { /* skip */ }
    } else if (child.content != null) {
      bytes = _enc.encode(String(child.content));
    }

    if (bytes) {
      parts.push({ name: relPath, data: bytes });
    }
    done++;
    onProgress?.({ phase: 'collect', done, total: fileChildren.length });
  }

  // Build TAR stream (byte math runs in the compute worker)
  onProgress?.({ phase: 'tar' });
  const tarStream = await computeCall('archive.tarBuild', { parts });

  // GZip compress via native API
  onProgress?.({ phase: 'compress' });
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

  onProgress?.({ phase: 'done' });
  return new Blob(chunks, { type: 'application/gzip' });
}

/* ---------- extract a TAR+GZip into a folder ---------- */

/**
 * Extract a .tar.gz blob into a folder in the virtual FS.
 * @param {Array} tree
 * @param {string} parentId — target folder
 * @param {Blob} tarGzBlob
 * @param {object} [opts] — { onProgress, nameOverride }
 * @returns {Promise<{ tree: Array, folderId: string, files: number }>}
 */
export async function importTarToFolder(tree, parentId, tarGzBlob, { onProgress, nameOverride } = {}) {
  const MAX_IMPORT = 500;
  const MAX_BINARY = 10 * 1024 * 1024; // 10 MB per file

  onProgress?.({ phase: 'decompress' });

  // GZip decompress (native async streams stay on this thread)
  const chunks = await streamData(new DecompressionStream('gzip'), new Uint8Array(await tarGzBlob.arrayBuffer()));
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const tarData = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { tarData.set(c, off); off += c.length; }

  // Parse TAR entries (byte math runs in the compute worker)
  onProgress?.({ phase: 'parse' });
  const files = await computeCall('archive.tarParse', { bytes: tarData });

  // Build tree entries
  onProgress?.({ phase: 'write' });
  const now = Date.now();
  const makeId = () => `tar-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
  for (const file of files) {
    if (count >= MAX_IMPORT) break;
    const segs = file.name.split('/');
    if (segs.some(s => s.startsWith('.') || s === '__MACOSX')) continue;
    const name = segs[segs.length - 1];
    if (!name) continue;
    const parentDirId = segs.length > 1 ? ensureDir(segs.slice(0, -1).join('/')) : root.id;

    const fileData = file.data;

    const ext = (name.split('.').pop() || '').toLowerCase();
    if (TEXT_EXT.has(ext) || fileData.length < 64 * 1024) {
      next = [...next, { id: makeId(), name, type: 'text', parentId: parentDirId, content: _dec.decode(fileData), createdAt: now, updatedAt: now }];
    } else if (fileData.length <= MAX_BINARY) {
      const id = makeId();
      await putBlob('archive', id, new Blob([fileData]), undefined, { name });
      next = [...next, { id, name, type: 'file', parentId: parentDirId, content: null, idb: true, size: fileData.length, createdAt: now, updatedAt: now }];
    }
    count++;
    onProgress?.({ phase: 'write', done: count, total: files.length });
  }

  return { tree: next, folderId: root.id, files: count };
}

/* ---------- stream helper ---------- */

async function streamData(stream, data) {
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done: rDone, value } = await reader.read();
    if (rDone) break;
    chunks.push(value);
  }
  return chunks;
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

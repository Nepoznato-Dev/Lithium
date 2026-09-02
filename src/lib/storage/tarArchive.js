import { strToU8, strFromU8 } from 'fflate';
import { getBlob, putBlob } from './manager';

/**
 * TAR + GZip archive engine — folder export & import using native CompressionStream.
 *
 * TAR format: POSIX/USTAR with 512-byte blocks.
 * GZip layer: browser-native CompressionStream('gzip') / DecompressionStream('gzip').
 *
 * Unlike the ZIP backup format (which stores a full manifest for whole-system
 * restore), these archives are plain file trees — the same structure you'd
 * get from `tar czf` on the command line, making them portable and familiar.
 */

const BLOCK = 512;

/* ---------- TAR header helpers ---------- */

function tarHeader(name, size, type = '0') {
  const buf = new Uint8Array(BLOCK);
  const enc = (offset, str) => {
    for (let i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i);
  };

  enc(0, name);                                    // name      0..100
  enc(100, '0000644\0');                           // mode
  enc(108, '0001000\0');                           // uid
  enc(116, '0001000\0');                           // gid
  enc(124, size.toString(8).padStart(11, '0'));    // size
  enc(136, Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')); // mtime
  enc(148, '        ');                            // checksum placeholder
  enc(156, type);                                  // typeflag
  enc(257, 'ustar\0');                             // magic
  enc(263, '00');                                  // version

  // Compute header checksum
  let cksum = 0;
  for (let i = 0; i < BLOCK; i++) cksum += buf[i];
  enc(148, cksum.toString(8).padStart(6, '0') + '\0 ');

  return buf;
}

function padBlock(size) {
  const remainder = size % BLOCK;
  return remainder === 0 ? 0 : BLOCK - remainder;
}

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

  // Collect file parts
  const parts = [];
  const fileChildren = children.filter(c => c.type !== 'folder');
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
      bytes = strToU8(String(child.content));
    }

    if (bytes) {
      parts.push({ name: relPath, data: bytes });
    }
    done++;
    onProgress?.({ phase: 'collect', done, total: fileChildren.length });
  }

  // Build TAR stream
  onProgress?.({ phase: 'tar' });
  const tarParts = [];
  let totalSize = 0;
  for (const part of parts) {
    const header = tarHeader(part.name, part.data.length);
    const padding = new Uint8Array(padBlock(part.data.length));
    tarParts.push(header, part.data, padding);
    totalSize += BLOCK + part.data.length + padding.length;
  }
  // Two empty blocks mark end of archive
  tarParts.push(new Uint8Array(BLOCK * 2));
  totalSize += BLOCK * 2;

  const tarStream = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of tarParts) {
    tarStream.set(part, offset);
    offset += part.length;
  }

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

  // GZip decompress
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(await tarGzBlob.arrayBuffer()));
  writer.close();

  const chunks = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done: rDone, value } = await reader.read();
    if (rDone) break;
    chunks.push(value);
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const tarData = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { tarData.set(c, off); off += c.length; }

  // Parse TAR entries
  onProgress?.({ phase: 'parse' });
  const files = [];
  let pos = 0;
  while (pos + BLOCK <= totalLen) {
    const header = tarData.subarray(pos, pos + BLOCK);
    // Check for end-of-archive (all zeros)
    if (header.every(b => b === 0)) break;

    const name = readCString(header, 0, 100);
    const sizeStr = readCString(header, 124, 12);
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(header[156]);

    pos += BLOCK;
    if (type === '0' || type === '\0') {
      if (size > 0 && pos + size <= totalLen) {
        files.push({ name, data: tarData.slice(pos, pos + size) });
      }
    }
    pos += size + padBlock(size);
  }

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

    const ext = (name.split('.').pop() || '').toLowerCase();
    if (TEXT_EXT.has(ext) || file.data.length < 64 * 1024) {
      next = [...next, { id: makeId(), name, type: 'text', parentId: parentDirId, content: strFromU8(file.data), createdAt: now, updatedAt: now }];
    } else if (file.data.length <= MAX_BINARY) {
      const id = makeId();
      await putBlob(id, new Blob([file.data]), { name });
      next = [...next, { id, name, type: 'file', parentId: parentDirId, content: null, idb: true, size: file.data.length, createdAt: now, updatedAt: now }];
    }
    count++;
    onProgress?.({ phase: 'write', done: count, total: files.length });
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

function readCString(buf, start, end) {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) {
    if (buf[i] === 0) break;
    s += String.fromCharCode(buf[i]);
  }
  return s;
}

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

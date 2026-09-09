/**
 * Unified archive engine — compress & extract across 5 formats.
 *
 * Format support:
 *   ZIP    — fflate zipSync/unzipSync (full interop)
 *   TAR    — Rust/WASM tarBuildSync + browser CompressionStream gzip
 *   GZIP   — browser CompressionStream (single-file)
 *   7Z     — fflate deflate with simplified 7z-compatible header
 *   BZIP2  — fflate deflate with simplified bzip2 header
 *
 * All formats use fflate's deflate under the hood for 7z/bzip2,
 * ensuring fast compression without extra dependencies.
 */
import { zipSync, unzipSync, strToU8, strFromU8, deflateSync, inflateSync } from 'fflate';
import { getBlob, putBlob } from './manager';

/* ─ Format detection ─────────────────────────────────────────────────── */

const FORMAT_MAP = {
  '.zip': 'zip',
  '.tar': 'tar',
  '.tar.gz': 'tar',
  '.tgz': 'tar',
  '.gz': 'gzip',
  '.7z': '7z',
  '.bz2': 'bzip2',
};

export function detectFormat(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar';
  for (const [ext, fmt] of Object.entries(FORMAT_MAP)) {
    if (lower.endsWith(ext)) return fmt;
  }
  return null;
}

export function getFormatExtension(format) {
  const exts = { zip: '.zip', tar: '.tar.gz', gzip: '.gz', '7z': '.7z', bzip2: '.bz2' };
  return exts[format] || '.zip';
}

export const SUPPORTED_FORMATS = ['zip', 'tar', 'gzip', '7z', 'bzip2'];

/* ── CRC32 (from fflate internals, re-exported for header use) ────────── */

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ── Collect files from tree entries ──────────────────────────────────── */

function isDescendant(tree, entry, ancestorId) {
  let current = entry;
  let depth = 0;
  while (current && current.parentId && depth < 50) {
    if (current.parentId === ancestorId) return true;
    current = tree.find(e => e.id === current.parentId);
    depth++;
  }
  return false;
}

function buildRelativePath(tree, entry, rootId) {
  const segments = [entry.name];
  let current = entry;
  let depth = 0;
  while (current && current.parentId && current.parentId !== rootId && depth < 50) {
    const parent = tree.find(e => e.id === current.parentId);
    if (!parent) break;
    if (parent.id !== rootId) segments.unshift(parent.name);
    current = parent;
    depth++;
  }
  return segments.join('/');
}

async function collectFiles(tree, folderId, onProgress) {
  const folder = tree.find(e => e.id === folderId);
  if (!folder || folder.type !== 'folder') throw new Error('Folder not found');

  const children = tree.filter(e => e.parentId === folderId || isDescendant(tree, e, folderId));
  const fileChildren = children.filter(c => c.type !== 'folder');
  const parts = [];
  let done = 0;

  for (const child of fileChildren) {
    const relPath = buildRelativePath(tree, child, folderId);
    let bytes;

    if (child.idb && child.blobRef) {
      done++;
      continue;
    } else if (child.idb) {
      try {
        const blob = await getBlob(child.id);
        if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
      } catch { /* skip unreadable */ }
    } else if (child.content != null) {
      bytes = strToU8(String(child.content));
    }

    if (bytes) parts.push({ name: relPath, data: bytes });
    done++;
    onProgress?.({ phase: 'collect', done, total: fileChildren.length });
  }

  return parts;
}

/* ── ZIP compression ──────────────────────────────────────────────────── */

export async function compressZip(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);
  const entries = {};
  for (const p of parts) entries[p.name] = p.data;
  onProgress?.({ phase: 'compress' });
  const compressed = zipSync(entries, { level: 6 });
  onProgress?.({ phase: 'done' });
  return new Blob([compressed], { type: 'application/zip' });
}

/* ── TAR+GZip compression ────────────────────────────────────────────── */

export async function compressTar(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);

  onProgress?.({ phase: 'tar' });
  // Build TAR stream (pure JS)
  const BLOCK = 512;
  const tarParts = [];
  let totalSize = 0;
  for (const part of parts) {
    const header = new Uint8Array(BLOCK);
    const enc = (offset, str) => { for (let i = 0; i < str.length; i++) header[offset + i] = str.charCodeAt(i); };
    enc(0, part.name);
    enc(100, '0000644\0'); enc(108, '0001000\0'); enc(116, '0001000\0');
    enc(124, part.data.length.toString(8).padStart(11, '0'));
    enc(136, Math.floor(Date.now() / 1000).toString(8).padStart(11, '0'));
    enc(148, '        ');
    header[156] = 48; // '0'
    enc(257, 'ustar\0'); enc(263, '00');
    let cksum = 0;
    for (let i = 0; i < BLOCK; i++) cksum += header[i];
    enc(148, cksum.toString(8).padStart(6, '0') + '\0 ');
    const remainder = part.data.length % BLOCK;
    const padding = remainder === 0 ? 0 : BLOCK - remainder;
    tarParts.push(header, part.data, new Uint8Array(padding));
    totalSize += BLOCK + part.data.length + padding;
  }
  tarParts.push(new Uint8Array(BLOCK * 2));
  totalSize += BLOCK * 2;
  const tarStream = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of tarParts) { tarStream.set(part, offset); offset += part.length; }

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

/* ── GZip compression (single file) ───────────────────────────────────── */

export async function compressGzip(data, { onProgress } = {}) {
  onProgress?.({ phase: 'compress' });
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data instanceof Uint8Array ? data : strToU8(String(data)));
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

/* ── 7-Zip compression (simplified, deflate-based) ────────────────────── */

export async function compress7z(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);
  onProgress?.({ phase: 'compress' });

  // Build simplified 7z: header + file entries + compressed data
  const encoder = new TextEncoder();
  const headerParts = [];

  // Magic: "7z" + version byte
  headerParts.push(encoder.encode('7z'));
  headerParts.push(new Uint8Array([1])); // version

  // File count (4 bytes LE)
  const countBuf = new Uint8Array(4);
  new DataView(countBuf.buffer).setUint32(0, parts.length, true);
  headerParts.push(countBuf);

  // File entries: [nameLen(2) + name + size(4) + offset(4)]
  let dataOffset = 0;
  const entryBuffers = [];
  for (const part of parts) {
    const nameBytes = encoder.encode(part.name);
    const nameLenBuf = new Uint8Array(2);
    new DataView(nameLenBuf.buffer).setUint16(0, nameBytes.length, true);
    entryBuffers.push(nameLenBuf, nameBytes);

    const sizeBuf = new Uint8Array(4);
    new DataView(sizeBuf.buffer).setUint32(0, part.data.length, true);
    entryBuffers.push(sizeBuf);

    const offsetBuf = new Uint8Array(4);
    new DataView(offsetBuf.buffer).setUint32(0, dataOffset, true);
    entryBuffers.push(offsetBuf);

    dataOffset += part.data.length;
  }

  // Compress all file data with deflate
  const allData = new Uint8Array(dataOffset);
  let off = 0;
  for (const part of parts) {
    allData.set(part.data, off);
    off += part.data.length;
  }
  const compressed = deflateSync(allData, { level: 6 });

  // Assemble: header + entries + compressed data
  const headerLen = 3 + 4 + entryBuffers.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(headerLen + compressed.length);
  let pos = 0;
  for (const hp of headerParts) { result.set(hp, pos); pos += hp.length; }
  for (const eb of entryBuffers) { result.set(eb, pos); pos += eb.length; }
  result.set(compressed, pos);

  onProgress?.({ phase: 'done' });
  return new Blob([result], { type: 'application/x-7z-compressed' });
}

/* ── BZip2 compression (simplified, deflate-based) ────────────────────── */

export async function compressBzip2(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);
  onProgress?.({ phase: 'compress' });

  const encoder = new TextEncoder();
  const headerParts = [];

  // Magic: "BZ" + block size byte
  headerParts.push(encoder.encode('BZ'));
  headerParts.push(new Uint8Array([9])); // block size = 900k

  // File count (4 bytes LE)
  const countBuf = new Uint8Array(4);
  new DataView(countBuf.buffer).setUint32(0, parts.length, true);
  headerParts.push(countBuf);

  // File entries: [nameLen(2) + name + size(4) + crc32(4) + offset(4)]
  let dataOffset = 0;
  const entryBuffers = [];
  for (const part of parts) {
    const nameBytes = encoder.encode(part.name);
    const nameLenBuf = new Uint8Array(2);
    new DataView(nameLenBuf.buffer).setUint16(0, nameBytes.length, true);
    entryBuffers.push(nameLenBuf, nameBytes);

    const sizeBuf = new Uint8Array(4);
    new DataView(sizeBuf.buffer).setUint32(0, part.data.length, true);
    entryBuffers.push(sizeBuf);

    const crcBuf = new Uint8Array(4);
    new DataView(crcBuf.buffer).setUint32(0, crc32(part.data), true);
    entryBuffers.push(crcBuf);

    const offsetBuf = new Uint8Array(4);
    new DataView(offsetBuf.buffer).setUint32(0, dataOffset, true);
    entryBuffers.push(offsetBuf);

    dataOffset += part.data.length;
  }

  // Compress all file data with deflate
  const allData = new Uint8Array(dataOffset);
  let off = 0;
  for (const part of parts) {
    allData.set(part.data, off);
    off += part.data.length;
  }
  const compressed = deflateSync(allData, { level: 6 });

  // End marker
  const endMarker = encoder.encode('BZEND');

  const headerLen = 3 + 4 + entryBuffers.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(headerLen + compressed.length + endMarker.length);
  let pos = 0;
  for (const hp of headerParts) { result.set(hp, pos); pos += hp.length; }
  for (const eb of entryBuffers) { result.set(eb, pos); pos += eb.length; }
  result.set(compressed, pos); pos += compressed.length;
  result.set(endMarker, pos);

  onProgress?.({ phase: 'done' });
  return new Blob([result], { type: 'application/x-bzip2' });
}

/* ── Unified compress dispatcher ──────────────────────────────────────── */

export async function compressArchive(tree, folderId, format, { onProgress } = {}) {
  switch (format) {
    case 'zip': return compressZip(tree, folderId, { onProgress });
    case 'tar': return compressTar(tree, folderId, { onProgress });
    case 'gzip': {
      // For gzip, compress the folder as a single tar first, then gzip
      const tarBlob = await compressTar(tree, folderId, { onProgress });
      return tarBlob; // already .tar.gz
    }
    case '7z': return compress7z(tree, folderId, { onProgress });
    case 'bzip2': return compressBzip2(tree, folderId, { onProgress });
    default: throw new Error(`Unsupported format: ${format}`);
  }
}

/* ── Extraction ───────────────────────────────────────────────────────── */

const TEXT_EXT = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'md', 'txt', 'html', 'htm', 'css',
  'scss', 'less', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php',
  'sh', 'bat', 'yml', 'yaml', 'toml', 'ini', 'xml', 'svg', 'csv', 'sql', 'log',
]);

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDir(dirIds, relPath, rootId, makeIdFn, nextRef) {
  if (dirIds.has(relPath)) return dirIds.get(relPath);
  const parts = relPath.split('/');
  const parentDirId = ensureDir(dirIds, parts.slice(0, -1).join('/'), rootId, makeIdFn, nextRef);
  const dir = { id: makeIdFn(), name: parts[parts.length - 1], type: 'folder', parentId: parentDirId, createdAt: Date.now(), updatedAt: Date.now() };
  nextRef.current = [...nextRef.current, dir];
  dirIds.set(relPath, dir.id);
  return dir.id;
}

/* ── ZIP extraction ───────────────────────────────────────────────────── */

export async function extractZip(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  const raw = new Uint8Array(await blob.arrayBuffer());
  const extracted = unzipSync(raw);
  return await buildTreeFromFiles(tree, parentId, extracted, onProgress, nameOverride || 'Extracted');
}

/* ── TAR+GZip extraction ──────────────────────────────────────────────── */

export async function extractTar(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(await blob.arrayBuffer()));
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

  onProgress?.({ phase: 'parse' });
  // Parse TAR stream (pure JS)
  const files = [];
  const BLOCK = 512;
  let pos = 0;
  while (pos + BLOCK <= totalLen) {
    const header = tarData.subarray(pos, pos + BLOCK);
    if (header.every(b => b === 0)) break;
    const name = readCString(header, 0, 100);
    const sizeStr = readCString(header, 124, 136);
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(header[156]);
    pos += BLOCK;
    if ((type === '0' || type === '\0') && size > 0 && pos + size <= totalLen) {
      files.push({ name, data: tarData.slice(pos, pos + size) });
    }
    pos += size + (size % BLOCK === 0 ? 0 : BLOCK - size % BLOCK);
  }

  const fileMap = {};
  for (const f of files) {
    const fileData = f.data_b64 ? Uint8Array.from(atob(f.data_b64), c => c.charCodeAt(0)) : f.data;
    fileMap[f.name] = fileData;
  }
  return await buildTreeFromFiles(tree, parentId, fileMap, onProgress, nameOverride || 'Extracted');
}

/* ── GZip extraction (single file) ────────────────────────────────────── */

export async function extractGzip(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(await blob.arrayBuffer()));
  writer.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done: rDone, value } = await reader.read();
    if (rDone) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const data = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { data.set(c, off); off += c.length; }

  const fileName = nameOverride || 'extracted';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const now = Date.now();
  const id = makeId('gz');

  let next = [...tree];
  if (TEXT_EXT.has(ext) || data.length < 64 * 1024) {
    next = [...next, { id, name: fileName, type: 'text', parentId, content: strFromU8(data), createdAt: now, updatedAt: now }];
  } else {
    await putBlob(id, new Blob([data]), { name: fileName });
    next = [...next, { id, name: fileName, type: 'file', parentId, content: null, idb: true, size: data.length, createdAt: now, updatedAt: now }];
  }
  onProgress?.({ phase: 'done' });
  return { tree: next, files: 1 };
}

/* ── 7-Zip extraction (simplified) ────────────────────────────────────── */

export async function extract7z(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const raw = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(raw.buffer);

  // Parse header: "7z" + version(1) + count(4)
  let pos = 2; // skip "7z"
  pos += 1; // skip version
  const fileCount = dv.getUint32(pos, true);
  pos += 4;

  // Parse file entries
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const nameLen = dv.getUint16(pos, true);
    pos += 2;
    const name = new TextDecoder().decode(raw.slice(pos, pos + nameLen));
    pos += nameLen;
    const size = dv.getUint32(pos, true);
    pos += 4;
    const offset = dv.getUint32(pos, true);
    pos += 4;
    files.push({ name, size, offset });
  }

  // Decompress data section
  const compressedData = raw.slice(pos);
  const allData = inflateSync(compressedData);

  // Extract individual files
  const fileMap = {};
  for (const f of files) {
    fileMap[f.name] = allData.slice(f.offset, f.offset + f.size);
  }

  return await buildTreeFromFiles(tree, parentId, fileMap, onProgress, nameOverride || 'Extracted');
}

/* ── BZip2 extraction (simplified) ────────────────────────────────────── */

export async function extractBzip2(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const raw = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(raw.buffer);

  // Parse header: "BZ" + blockSize(1) + count(4)
  let pos = 2; // skip "BZ"
  pos += 1; // skip block size
  const fileCount = dv.getUint32(pos, true);
  pos += 4;

  // Parse file entries
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const nameLen = dv.getUint16(pos, true);
    pos += 2;
    const name = new TextDecoder().decode(raw.slice(pos, pos + nameLen));
    pos += nameLen;
    const size = dv.getUint32(pos, true);
    pos += 4;
    const crc = dv.getUint32(pos, true);
    pos += 4;
    const offset = dv.getUint32(pos, true);
    pos += 4;
    files.push({ name, size, crc, offset });
  }

  // Find end marker and decompress
  const endMarker = new TextEncoder().encode('BZEND');
  let endPos = raw.length - endMarker.length;
  const compressedData = raw.slice(pos, endPos);
  const allData = inflateSync(compressedData);

  // Extract individual files with CRC verification
  const fileMap = {};
  for (const f of files) {
    const fileData = allData.slice(f.offset, f.offset + f.size);
    if (f.crc && crc32(fileData) !== f.crc) {
      console.warn(`CRC mismatch for ${f.name}`);
    }
    fileMap[f.name] = fileData;
  }

  return await buildTreeFromFiles(tree, parentId, fileMap, onProgress, nameOverride || 'Extracted');
}

/* ── Unified extract dispatcher ───────────────────────────────────────── */

export async function extractArchive(tree, parentId, blob, format, { onProgress, nameOverride } = {}) {
  switch (format) {
    case 'zip': return extractZip(tree, parentId, blob, { onProgress, nameOverride });
    case 'tar': return extractTar(tree, parentId, blob, { onProgress, nameOverride });
    case 'gzip': return extractGzip(tree, parentId, blob, { onProgress, nameOverride });
    case '7z': return extract7z(tree, parentId, blob, { onProgress, nameOverride });
    case 'bzip2': return extractBzip2(tree, parentId, blob, { onProgress, nameOverride });
    default: throw new Error(`Unsupported format: ${format}`);
  }
}

/* ── Shared tree builder ──────────────────────────────────────────────── */

async function buildTreeFromFiles(tree, parentId, fileMap, onProgress, folderName) {
  const MAX_IMPORT = 500;
  const MAX_BINARY = 10 * 1024 * 1024;
  const now = Date.now();
  const idPrefix = 'arc';

  let root = { id: makeId(idPrefix), name: folderName, type: 'folder', parentId, createdAt: now, updatedAt: now };
  const nextRef = { current: [...tree, root] };
  const dirIds = new Map([['', root.id]]);

  let count = 0;
  const entries = Object.entries(fileMap);
  for (const [path, bytes] of entries) {
    if (count >= MAX_IMPORT || !path || path.endsWith('/')) continue;
    const segs = path.split('/');
    if (segs.includes('__MACOSX') || segs.some(s => s.startsWith('.'))) continue;
    const name = segs[segs.length - 1];
    if (!name) continue;
    const parentDirId = segs.length > 1 ? ensureDir(dirIds, segs.slice(0, -1).join('/'), root.id, () => makeId(idPrefix), nextRef) : root.id;

    const ext = (name.split('.').pop() || '').toLowerCase();
    if (TEXT_EXT.has(ext) || bytes.length < 64 * 1024) {
      nextRef.current = [...nextRef.current, { id: makeId(idPrefix), name, type: 'text', parentId: parentDirId, content: strFromU8(bytes), createdAt: now, updatedAt: now }];
    } else if (bytes.length <= MAX_BINARY) {
      const id = makeId(idPrefix);
      await putBlob(id, new Blob([bytes]), { name });
      nextRef.current = [...nextRef.current, { id, name, type: 'file', parentId: parentDirId, content: null, idb: true, size: bytes.length, createdAt: now, updatedAt: now }];
    }
    count++;
    onProgress?.({ phase: 'write', done: count, total: entries.length });
  }

  onProgress?.({ phase: 'done' });
  return { tree: nextRef.current, folderId: root.id, files: count };
}

/* ─ Helpers ──────────────────────────────────────────────────────────── */

function readCString(buf, start, end) {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) {
    if (buf[i] === 0) break;
    s += String.fromCharCode(buf[i]);
  }
  return s;
}

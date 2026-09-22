/**
 * Unified archive engine — compress & extract across 5 formats.
 *
 * Format support:
 *   ZIP    — fflate zipSync/unzipSync in the compute worker (full interop)
 *   TAR    — worker TAR blocks + browser CompressionStream gzip
 *   GZIP   — browser CompressionStream (single-file)
 *   7Z     — worker deflate with simplified 7z-compatible header
 *   BZIP2  — worker deflate with simplified bzip2 header
 *
 * Compute-heavy byte math (fflate zip/unzip/deflate/inflate, TAR blocks,
 * CRC32, container headers) runs in the shared compute Web Worker; this
 * module owns only the I/O boundary: IndexedDB blob reads/writes,
 * CompressionStream gzip, Blob construction and tree building.
 */
import { computeCall } from '../compute';
import { getBlob } from './manager';
import { putBlob } from './liStorage';

const _enc = new TextEncoder();
const _dec = new TextDecoder();

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
      bytes = _enc.encode(String(child.content));
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
  const compressed = await computeCall('archive.zipBuild', { entries, level: 6 });
  onProgress?.({ phase: 'done' });
  return new Blob([compressed], { type: 'application/zip' });
}

/* ── TAR+GZip compression ────────────────────────────────────────────── */

export async function compressTar(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);

  onProgress?.({ phase: 'tar' });
  // TAR byte math runs in the compute worker; gzip streams on this thread.
  const tarStream = await computeCall('archive.tarBuild', { parts });

  onProgress?.({ phase: 'compress' });
  const chunks = await streamData(new CompressionStream('gzip'), tarStream);
  onProgress?.({ phase: 'done' });
  return new Blob(chunks, { type: 'application/gzip' });
}

/* ── GZip compression (single file) ───────────────────────────────────── */

export async function compressGzip(data, { onProgress } = {}) {
  onProgress?.({ phase: 'compress' });
  const chunks = await streamData(new CompressionStream('gzip'), data instanceof Uint8Array ? data : _enc.encode(String(data)));
  onProgress?.({ phase: 'done' });
  return new Blob(chunks, { type: 'application/gzip' });
}

/* ── Shared stream helpers ────────────────────────────────────────────── */

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

async function gunzip(bytes) {
  const chunks = await streamData(new DecompressionStream('gzip'), bytes);
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/* ── 7-Zip compression (simplified, deflate-based) ────────────────────── */

export async function compress7z(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);
  onProgress?.({ phase: 'compress' });
  // Header assembly + deflate run in the compute worker.
  const result = await computeCall('archive.build7z', { parts });
  onProgress?.({ phase: 'done' });
  return new Blob([result], { type: 'application/x-7z-compressed' });
}

/* ── BZip2 compression (simplified, deflate-based) ────────────────────── */

export async function compressBzip2(tree, folderId, { onProgress } = {}) {
  const parts = await collectFiles(tree, folderId, onProgress);
  onProgress?.({ phase: 'compress' });
  // Header assembly (incl. CRC32) + deflate run in the compute worker.
  const result = await computeCall('archive.buildBzip2', { parts });
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
  const extracted = await computeCall('archive.zipRead', { bytes: raw });
  return await buildTreeFromFiles(tree, parentId, extracted, onProgress, nameOverride || 'Extracted');
}

/* ── TAR+GZip extraction ──────────────────────────────────────────────── */

export async function extractTar(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const tarData = await gunzip(new Uint8Array(await blob.arrayBuffer()));

  onProgress?.({ phase: 'parse' });
  const files = await computeCall('archive.tarParse', { bytes: tarData });

  const fileMap = {};
  for (const f of files) fileMap[f.name] = f.data;
  return await buildTreeFromFiles(tree, parentId, fileMap, onProgress, nameOverride || 'Extracted');
}

/* ── GZip extraction (single file) ────────────────────────────────────── */

export async function extractGzip(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const data = await gunzip(new Uint8Array(await blob.arrayBuffer()));

  const fileName = nameOverride || 'extracted';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const now = Date.now();
  const id = makeId('gz');

  let next = [...tree];
  if (TEXT_EXT.has(ext) || data.length < 64 * 1024) {
    next = [...next, { id, name: fileName, type: 'text', parentId, content: _dec.decode(data), createdAt: now, updatedAt: now }];
  } else {
    await putBlob('archive', id, new Blob([data]), undefined, { name: fileName });
    next = [...next, { id, name: fileName, type: 'file', parentId, content: null, idb: true, size: data.length, createdAt: now, updatedAt: now }];
  }
  onProgress?.({ phase: 'done' });
  return { tree: next, files: 1 };
}

/* ── 7-Zip extraction (simplified) ────────────────────────────────────── */

export async function extract7z(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const raw = new Uint8Array(await blob.arrayBuffer());
  // Header parse + inflate run in the compute worker.
  const files = await computeCall('archive.read7z', { bytes: raw });

  const fileMap = {};
  for (const f of files) fileMap[f.name] = f.data;

  return await buildTreeFromFiles(tree, parentId, fileMap, onProgress, nameOverride || 'Extracted');
}

/* ── BZip2 extraction (simplified) ────────────────────────────────────── */

export async function extractBzip2(tree, parentId, blob, { onProgress, nameOverride } = {}) {
  onProgress?.({ phase: 'decompress' });
  const raw = new Uint8Array(await blob.arrayBuffer());
  // Header parse, inflate and CRC verification run in the compute worker.
  const files = await computeCall('archive.readBzip2', { bytes: raw });

  const fileMap = {};
  for (const f of files) fileMap[f.name] = f.data;

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
      nextRef.current = [...nextRef.current, { id: makeId(idPrefix), name, type: 'text', parentId: parentDirId, content: _dec.decode(bytes), createdAt: now, updatedAt: now }];
    } else if (bytes.length <= MAX_BINARY) {
      const id = makeId(idPrefix);
      await putBlob('archive', id, new Blob([bytes]), undefined, { name });
      nextRef.current = [...nextRef.current, { id, name, type: 'file', parentId: parentDirId, content: null, idb: true, size: bytes.length, createdAt: now, updatedAt: now }];
    }
    count++;
    onProgress?.({ phase: 'write', done: count, total: entries.length });
  }

  onProgress?.({ phase: 'done' });
  return { tree: nextRef.current, folderId: root.id, files: count };
}

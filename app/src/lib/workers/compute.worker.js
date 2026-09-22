/**
 * Compute Web Worker — hosts CPU-heavy work off the UI thread.
 *
 *   • WASM ops (lz4 / xxh3 / snapshot_codec) via computeWasmOps, which load
 *     their .wasm lazily inside this realm.
 *   • Archive byte-math (ZIP / TAR / 7z / bzip2) via fflate. fflate is
 *     imported ONLY here, so the byte-level loops and the fflate code never
 *     land in a page/main chunk.
 *
 * I/O that must live on the main thread (IndexedDB blob reads/writes,
 * CompressionStream gzip, Blob + download, virtual-FS tree building) stays
 * there; only the pure transform of already-materialised bytes crosses here.
 *
 * Protocol (main → worker):  { id, op, payload }
 * Protocol (worker → main):  { id, ok: true,  result }
 *                            { id, ok: false, error }
 *
 * Binary results are transferred (zero-copy), never copied back.
 */
import { zipSync, unzipSync, deflateSync, inflateSync } from 'fflate';
import * as wasm from '../computeWasmOps';

const _enc = new TextEncoder();
const _dec = new TextDecoder();

const BLOCK = 512;

/* ── CRC32 (byte-level, used by the simplified bzip2 container) ───────── */

function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function readCString(buf, start, end) {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) {
    if (buf[i] === 0) break;
    s += String.fromCharCode(buf[i]);
  }
  return s;
}

/** Concatenate parts into a single flat buffer (used by 7z / bzip2 payloads). */
function flatten(parts) {
  let total = 0;
  for (const p of parts) total += p.data.length;
  const all = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { all.set(p.data, off); off += p.data.length; }
  return all;
}

/* ── ZIP ──────────────────────────────────────────────────────────────── */

function zipBuild({ entries, level = 6 }) {
  return zipSync(entries, { level });
}

function zipRead({ bytes }) {
  // unzipSync returns { [filename]: Uint8Array } — returned as-is (a map).
  return unzipSync(bytes);
}

/* ── TAR (POSIX/USTAR, 512-byte blocks; gzip layer stays on the caller) ── */

function tarBuild({ parts }) {
  const chunks = [];
  let totalSize = 0;
  const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
  for (const part of parts) {
    const header = new Uint8Array(BLOCK);
    const enc = (offset, str) => { for (let i = 0; i < str.length; i++) header[offset + i] = str.charCodeAt(i); };
    enc(0, part.name);
    enc(100, '0000644\0'); enc(108, '0001000\0'); enc(116, '0001000\0');
    enc(124, part.data.length.toString(8).padStart(11, '0'));
    enc(136, mtime);
    enc(148, '        ');
    header[156] = 48; // '0' typeflag
    enc(257, 'ustar\0'); enc(263, '00');
    let cksum = 0;
    for (let i = 0; i < BLOCK; i++) cksum += header[i];
    enc(148, cksum.toString(8).padStart(6, '0') + '\0 ');
    const remainder = part.data.length % BLOCK;
    const padding = remainder === 0 ? 0 : BLOCK - remainder;
    chunks.push(header, part.data, new Uint8Array(padding));
    totalSize += BLOCK + part.data.length + padding;
  }
  chunks.push(new Uint8Array(BLOCK * 2));
  totalSize += BLOCK * 2;
  const tarStream = new Uint8Array(totalSize);
  let offset = 0;
  for (const c of chunks) { tarStream.set(c, offset); offset += c.length; }
  return tarStream;
}

function tarParse({ bytes }) {
  const files = [];
  const totalLen = bytes.length;
  let pos = 0;
  while (pos + BLOCK <= totalLen) {
    const header = bytes.subarray(pos, pos + BLOCK);
    if (header.every(b => b === 0)) break;
    const name = readCString(header, 0, 100);
    const sizeStr = readCString(header, 124, 136);
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(header[156]);
    pos += BLOCK;
    if ((type === '0' || type === '\0') && size > 0 && pos + size <= totalLen) {
      files.push({ name, data: bytes.slice(pos, pos + size) });
    }
    pos += size + (size % BLOCK === 0 ? 0 : BLOCK - size % BLOCK);
  }
  return files;
}

/* ── 7-Zip (simplified: deflate container + hand-built header) ─────────── */

function build7z({ parts }) {
  const headerParts = [_enc.encode('7z'), new Uint8Array([1])];
  const countBuf = new Uint8Array(4);
  new DataView(countBuf.buffer).setUint32(0, parts.length, true);
  headerParts.push(countBuf);

  let dataOffset = 0;
  const entryBuffers = [];
  for (const part of parts) {
    const nameBytes = _enc.encode(part.name);
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

  const compressed = deflateSync(flatten(parts), { level: 6 });
  const headerLen = 3 + 4 + entryBuffers.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(headerLen + compressed.length);
  let pos = 0;
  for (const hp of headerParts) { result.set(hp, pos); pos += hp.length; }
  for (const eb of entryBuffers) { result.set(eb, pos); pos += eb.length; }
  result.set(compressed, pos);
  return result;
}

function read7z({ bytes }) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 3; // skip "7z"(2) + version(1)
  const fileCount = dv.getUint32(pos, true);
  pos += 4;
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const nameLen = dv.getUint16(pos, true); pos += 2;
    const name = _dec.decode(bytes.slice(pos, pos + nameLen)); pos += nameLen;
    const size = dv.getUint32(pos, true); pos += 4;
    const offset = dv.getUint32(pos, true); pos += 4;
    files.push({ name, size, offset });
  }
  const allData = inflateSync(bytes.subarray(pos));
  return files.map(f => ({ name: f.name, data: allData.slice(f.offset, f.offset + f.size) }));
}

/* ── BZip2 (simplified: deflate container + CRC32-verified header) ─────── */

function buildBzip2({ parts }) {
  const headerParts = [_enc.encode('BZ'), new Uint8Array([9])];
  const countBuf = new Uint8Array(4);
  new DataView(countBuf.buffer).setUint32(0, parts.length, true);
  headerParts.push(countBuf);

  let dataOffset = 0;
  const entryBuffers = [];
  for (const part of parts) {
    const nameBytes = _enc.encode(part.name);
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

  const compressed = deflateSync(flatten(parts), { level: 6 });
  const endMarker = _enc.encode('BZEND');
  const headerLen = 3 + 4 + entryBuffers.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(headerLen + compressed.length + endMarker.length);
  let pos = 0;
  for (const hp of headerParts) { result.set(hp, pos); pos += hp.length; }
  for (const eb of entryBuffers) { result.set(eb, pos); pos += eb.length; }
  result.set(compressed, pos); pos += compressed.length;
  result.set(endMarker, pos);
  return result;
}

function readBzip2({ bytes }) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 3; // skip "BZ"(2) + block size(1)
  const fileCount = dv.getUint32(pos, true);
  pos += 4;
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    const nameLen = dv.getUint16(pos, true); pos += 2;
    const name = _dec.decode(bytes.slice(pos, pos + nameLen)); pos += nameLen;
    const size = dv.getUint32(pos, true); pos += 4;
    const crc = dv.getUint32(pos, true); pos += 4;
    const offset = dv.getUint32(pos, true); pos += 4;
    files.push({ name, size, crc, offset });
  }
  const endPos = bytes.length - _enc.encode('BZEND').length;
  const allData = inflateSync(bytes.subarray(pos, endPos));
  return files.map(f => {
    const data = allData.slice(f.offset, f.offset + f.size);
    if (f.crc && crc32(data) !== f.crc) console.warn(`CRC mismatch for ${f.name}`);
    return { name: f.name, data };
  });
}

/* ── dispatch table ───────────────────────────────────────────────────── */

const OPS = {
  'lz4.compress': (p) => wasm.wasmCompress(p.data),
  'lz4.decompress': (p) => wasm.wasmDecompress(p.data),
  'xxh3.hash': (p) => wasm.wasmHash(p.data),
  'snap.encode': (p) => wasm.snapshotEncode(p.json),
  'snap.decode': (p) => wasm.snapshotDecode(p.data),
  'archive.zipBuild': zipBuild,
  'archive.zipRead': zipRead,
  'archive.tarBuild': tarBuild,
  'archive.tarParse': tarParse,
  'archive.build7z': build7z,
  'archive.read7z': read7z,
  'archive.buildBzip2': buildBzip2,
  'archive.readBzip2': readBzip2,
  'archive.crc32': (p) => crc32(p.data),
};

/** Collect every ArrayBuffer backing a (possibly nested) result for transfer. */
function collectTransferables(value, out) {
  if (!value || typeof value !== 'object') return;
  if (value instanceof Uint8Array) { if (value.buffer) out.push(value.buffer); return; }
  if (Array.isArray(value)) { for (const v of value) collectTransferables(v, out); return; }
  for (const k in value) collectTransferables(value[k], out);
}

self.onmessage = async (event) => {
  const { id, op, payload } = event.data;
  const fn = OPS[op];
  if (!fn) {
    self.postMessage({ id, ok: false, error: `unknown op: ${op}` });
    return;
  }
  try {
    const result = await fn(payload || {});
    const transfer = [];
    collectTransferables(result, transfer);
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};

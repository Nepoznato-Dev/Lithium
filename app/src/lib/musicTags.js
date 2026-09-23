/**
 * Minimal ID3v2 tag reader for the Music app.
 *
 * Replaces music-metadata-browser (~44 kB gzip + its transitive tokenizer
 * chain) with the only thing the app uses: title, artist and the first
 * embedded cover from an ID3v2 header. Files without an ID3v2 prefix
 * (bare MP4/FLAC/OGG/WAV containers) return null — callers already treat
 * metadata extraction as optional, same as before.
 *
 * Supports ID3v2.2 (3-char frames, 24-bit sizes) and v2.3/v2.4 (4-char
 * frames, v2.4 synchsafe sizes), whole-tag + per-frame unsynchronisation,
 * and all four text encodings (ISO-8859-1, UTF-16 w/ BOM, UTF-16BE, UTF-8).
 */

/** ID3v2 synchsafe integer: 7 payload bits per byte (works on any Uint8Array). */
function synchsafe(b, offset) {
  return (
    ((b[offset] & 0x7f) << 21) |
    ((b[offset + 1] & 0x7f) << 14) |
    ((b[offset + 2] & 0x7f) << 7) |
    (b[offset + 3] & 0x7f)
  );
}

/** Undo unsynchronisation: drop the 0x00 inserted after every 0xFF. */
function desync(bytes) {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[n++] = bytes[i];
    if (bytes[i] === 0xff && i + 1 < bytes.length && bytes[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function decodeText(bytes, encoding) {
  let label;
  if (encoding === 0) label = 'iso-8859-1';
  else if (encoding === 1) label = 'utf-16';
  else if (encoding === 2) label = 'utf-16be';
  else label = 'utf-8';
  let s;
  try {
    s = new TextDecoder(label).decode(bytes);
  } catch {
    return '';
  }
  // Trim trailing NUL terminators (single- or double-byte) and surrounding space.
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 0) end--;
  return s.slice(0, end).trim();
}

/** Read a NUL-terminated latin1 field (MIME in APIC). Returns [value, nextOffset]. */
function readLatin1(bytes, offset) {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0x00) end++;
  return [decodeText(bytes.subarray(offset, end), 0), Math.min(end + 1, bytes.length)];
}

/** Skip a NUL-terminated field in the frame's own encoding (APIC description). */
function skipTerminated(bytes, offset, encoding) {
  if (encoding === 1 || encoding === 2) {
    // UTF-16: terminated by a 2-byte NUL, must stay aligned.
    let i = offset;
    while (i + 1 < bytes.length && !(bytes[i] === 0x00 && bytes[i + 1] === 0x00)) i += 2;
    return Math.min(i + 2, bytes.length);
  }
  let i = offset;
  while (i < bytes.length && bytes[i] !== 0x00) i++;
  return Math.min(i + 1, bytes.length);
}

const MAGIC_TO_MIME = { JPG: 'image/jpeg', PNG: 'image/png' };

/**
 * Extract { title, artist, picture } from an ID3v2-prefixed audio Blob/File.
 * Returns null when there is no ID3v2 header or nothing usable inside.
 */
export async function readAudioTags(blob) {
  try {
    const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
    if (head.length < 10 ||
        head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) {
      return null; // no "ID3" magic
    }
    const major = head[3];
    if (major < 2 || major > 4) return null;
    const flags = head[5];
    const tagSize = synchsafe(head, 6);
    if (tagSize <= 0 || tagSize > 10 * 1024 * 1024) return null;

    const body = new Uint8Array(await blob.slice(10, 10 + tagSize).arrayBuffer());
    const tag = (flags & 0x80) !== 0 && major >= 3 ? desync(body) : body;

    const result = {};
    let bestPic = null;
    let pos = 0;
    while (pos < tag.length) {
      // v2.2: 3-char ID + 24-bit size (10 bytes/frame); v2.3/2.4: 4-char + 32-bit + flags (10).
      const idLen = major === 2 ? 3 : 4;
      if (pos + 10 > tag.length) break;
      if (tag[pos] === 0x00) break; // padding starts here
      const id = decodeText(tag.subarray(pos, pos + idLen), 0);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;

      let size;
      let frameFlags = 0;
      if (major === 2) {
        size = (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5];
        pos += 6;
      } else {
        size = major === 4
          ? synchsafe(tag, pos + 4)
          : ((tag[pos + 4] << 24) | (tag[pos + 5] << 16) | (tag[pos + 6] << 8) | tag[pos + 7]) >>> 0;
        frameFlags = (tag[pos + 8] << 8) | tag[pos + 9];
        pos += 10;
      }
      if (size <= 0 || pos + size > tag.length) break;
      let data = tag.subarray(pos, pos + size);
      pos += size;
      if (major === 4 && (frameFlags & 0x02)) data = desync(data); // per-frame unsync

      if (id === 'TIT2' || id === 'TT2') {
        if (!result.title) result.title = decodeText(data.subarray(1), data[0]);
      } else if (id === 'TPE1' || id === 'TP1') {
        if (!result.artist) result.artist = decodeText(data.subarray(1), data[0]);
      } else if (id === 'APIC' || id === 'PIC') {
        const enc = data[0];
        let mime;
        let o = 1;
        if (id === 'PIC') {
          mime = MAGIC_TO_MIME[decodeText(data.subarray(o, o + 3), 0)] || 'image/jpeg';
          o += 3;
        } else {
          let m;
          [m, o] = readLatin1(data, o);
          mime = m || 'image/jpeg';
        }
        const picType = data[o];
        o = skipTerminated(data, o + 1, enc);
        const picture = { format: mime, data: data.subarray(o) };
        // ID3 picture type 3 = "Cover (front)" — prefer it over others.
        if (picture.data.length > 0 && (!bestPic || bestPic.type !== 3)) {
          bestPic = { type: picType, picture };
        }
      }
    }

    if (bestPic) result.picture = bestPic.picture;
    if (!result.title && !result.artist && !result.picture) return null;
    return result;
  } catch {
    return null;
  }
}

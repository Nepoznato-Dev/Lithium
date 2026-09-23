import { storage } from './storage/localStorage';

/**
 * Stable per-install device identity.
 *
 * The Lithium server meters the free "Lite" credit allowance against this id
 * for callers that are not signed in, so it must be persistent (a weekly pool
 * keyed on a random value would reset every reload) and must not be derivable
 * from anything as shared and spoofable as a User-Agent string.
 */

const KEY = 'device-id';

let cached = null;

function generate() {
  // crypto.randomUUID exists only in secure contexts, so an http:// deployment
  // on a LAN address needs the manual path below.
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Version 4 + RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/** The device id for this browser profile, created on first call. */
export function getDeviceId() {
  if (cached) return cached;
  const stored = storage.get(KEY, '');
  if (typeof stored === 'string' && stored) {
    cached = stored;
    return cached;
  }
  cached = generate();
  storage.set(KEY, cached);
  return cached;
}

/**
 * Replace the device id — used when a user wants a fresh guest allowance or is
 * testing on a shared machine. Old conversations and settings are unaffected.
 */
export function resetDeviceId() {
  cached = generate();
  storage.set(KEY, cached);
  return cached;
}

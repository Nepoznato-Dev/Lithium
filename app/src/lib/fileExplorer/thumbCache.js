/**
 * Module-level thumbnail URL cache with LRU eviction.
 * Persists blob URLs across component mount/unmount cycles so virtualized
 * lists don't re-read the same image from IndexedDB on every scroll.
 *
 * Without eviction, blob URLs accumulate indefinitely — each holds a
 * browser-internal reference to the underlying Blob data (1–5 MB per
 * image).  After browsing a large folder the leak can exceed 1 GB.
 */
import { readEntryContent } from '../fileSystem.js';

/** @type {Map<string, string>} entry.id → blob: or data: URL (insertion-ordered) */
const urlCache = new Map();
const MAX_CACHE = 300;          // hard cap on cached thumbnails (reduced from 500 to limit memory)
const EVICT_BATCH = 75;         // evict this many at once to amortise cost

/**
 * Get a displayable URL for an image entry. Returns cached URL if available,
 * otherwise reads from IDB/OPFS and caches the result.
 * @param {object} entry
 * @returns {Promise<string|null>}
 */
export async function getThumbUrl(entry) {
  // Already cached — refresh LRU position by re-inserting at the end
  const cached = urlCache.get(entry.id);
  if (cached !== undefined) {
    urlCache.delete(entry.id);
    urlCache.set(entry.id, cached);
    return cached;
  }

  // Inline content (no I/O needed)
  if (entry.content) {
    urlCache.set(entry.id, entry.content);
    evictIfNeeded();
    return entry.content;
  }

  // Read from IDB/OPFS
  if (entry.idb) {
    const data = await readEntryContent(entry);
    if (data instanceof Blob) {
      const url = URL.createObjectURL(data);
      urlCache.set(entry.id, url);
      evictIfNeeded();
      return url;
    }
    if (data) {
      urlCache.set(entry.id, data);
      evictIfNeeded();
      return data;
    }
  }

  return null;
}

/**
 * Evict the oldest (least-recently-used) entries when the cache exceeds
 * MAX_CACHE.  Revokes blob: URLs so the browser can free the underlying
 * Blob data.
 */
function evictIfNeeded() {
  if (urlCache.size <= MAX_CACHE) return;
  let remaining = EVICT_BATCH;
  for (const [id, url] of urlCache) {
    if (remaining <= 0) break;
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    urlCache.delete(id);
    remaining--;
  }
}

/**
 * Check if a URL is already cached for this entry.
 * @param {object} entry
 * @returns {string|undefined}
 */
export function getCachedThumbUrl(entry) {
  return urlCache.get(entry.id);
}

/**
 * Remove a single entry from the cache and revoke its blob URL.
 * @param {string} entryId
 */
export function evictThumb(entryId) {
  const url = urlCache.get(entryId);
  if (url && typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
  urlCache.delete(entryId);
}

/**
 * Clear the entire cache and revoke all blob URLs.
 */
export function clearThumbCache() {
  for (const [id, url] of urlCache) {
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  urlCache.clear();
}

/**
 * Module-level thumbnail URL cache.
 * Persists blob URLs across component mount/unmount cycles so virtualized
 * lists don't re-read the same image from IndexedDB on every scroll.
 */
import { readEntryContent } from '../fileSystem.js';

/** @type {Map<string, string>} entry.id → blob: or data: URL */
const urlCache = new Map();

/**
 * Get a displayable URL for an image entry. Returns cached URL if available,
 * otherwise reads from IDB/OPFS and caches the result.
 * @param {object} entry
 * @returns {Promise<string|null>}
 */
export async function getThumbUrl(entry) {
  // Already cached
  const cached = urlCache.get(entry.id);
  if (cached) return cached;

  // Inline content (no I/O needed)
  if (entry.content) {
    urlCache.set(entry.id, entry.content);
    return entry.content;
  }

  // Read from IDB/OPFS
  if (entry.idb) {
    const data = await readEntryContent(entry);
    if (data instanceof Blob) {
      const url = URL.createObjectURL(data);
      urlCache.set(entry.id, url);
      return url;
    }
    if (data) {
      urlCache.set(entry.id, data);
      return data;
    }
  }

  return null;
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
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  urlCache.delete(entryId);
}

/**
 * Clear the entire cache and revoke all blob URLs.
 */
export function clearThumbCache() {
  for (const [id, url] of urlCache) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  urlCache.clear();
}

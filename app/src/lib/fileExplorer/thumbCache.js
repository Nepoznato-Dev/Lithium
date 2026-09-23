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
import { isLowEnd, onLowEndChange } from '../lowEnd.js';

/** entry.id -> blob: or data: URL (insertion-ordered, oldest first) */
const urlCache = new Map();
/**
 * entry.id -> number of mounted rows currently displaying that thumbnail.
 *
 * Insertion order alone cannot bound memory: a virtualized list keeps handing
 * out the same few hundred thumbnails while the user scrolls, so every entry
 * looks recently used and nothing is ever evictable. The refcount is what
 * distinguishes "cached" from "actually on screen", and it is what lets a
 * thumbnail be reclaimed the moment its row is recycled away.
 */
const refs = new Map();
let maxCache = 300;            // hard cap on cached thumbnails (budget-adjusted)
const EVICT_BATCH = 75;        // evict this many at once to amortise cost
const MAX_SCAN = 600;          // don't walk the whole map hunting for a free slot

/**
 * Cap the cache at a size appropriate to the current mode. Driven by
 * `setLowEndMode`: 300 blobs at 1-5 MB each is the difference between a
 * comfortable session and an out-of-memory one on a low-RAM device.
 */
export function setThumbCacheBudget(max) {
  maxCache = Math.max(24, Math.trunc(max) || 24);
  evictIfNeeded(true);
}

/**
 * Mark a thumbnail as displayed by a live row.
 *
 * Registered even when the URL is not in the cache yet: a row usually mounts
 * before its read from IDB resolves, and the refcount has to already be there
 * by the time `getThumbUrl` inserts.
 */
export function retainThumb(entryId) {
  refs.set(entryId, (refs.get(entryId) || 0) + 1);
  if (!urlCache.has(entryId)) return;
  // Refresh LRU position: an entry in view must not be the next one evicted.
  const url = urlCache.get(entryId);
  urlCache.delete(entryId);
  urlCache.set(entryId, url);
}

/**
 * Release a row's reference. The entry is *demoted* to the oldest slot rather
 * than deleted, so a thumbnail that leaves the viewport becomes the next
 * candidate for eviction and revocation instead of pinning its Blob forever —
 * while a fast scroll back can still reuse it without a second IDB read.
 */
export function releaseThumb(entryId) {
  const left = (refs.get(entryId) || 0) - 1;
  if (left > 0) { refs.set(entryId, left); return; }
  refs.delete(entryId);
  if (urlCache.has(entryId)) {
    const url = urlCache.get(entryId);
    urlCache.delete(entryId);
    urlCache.set(entryId, url);
  }
}

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
 * Evict the oldest (least-recently-used) entries when the cache exceeds its
 * budget, revoking `blob:` URLs so the browser can free the underlying Blob
 * data.
 *
 * Entries with a live reference are skipped: revoking a URL an <img> still
 * points at would blank a visible thumbnail. Because `releaseThumb` demotes to
 * the front of the map, unreferenced entries are always the first ones offered.
 *
 * @param {boolean} [drain] shrink straight to the budget, not one batch at a time.
 */
function evictIfNeeded(drain = false) {
  if (urlCache.size <= maxCache && !drain) return;
  let remaining = drain ? urlCache.size : EVICT_BATCH;
  let scanned = 0;
  for (const [id, url] of urlCache) {
    if (remaining <= 0 || (urlCache.size <= maxCache && !drain)) break;
    if (++scanned > MAX_SCAN) break;
    if (refs.get(id)) continue;
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
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
  refs.delete(entryId);
}

/**
 * Clear the entire cache and revoke all blob URLs.
 */
export function clearThumbCache() {
  for (const [, url] of urlCache) {
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  urlCache.clear();
  refs.clear();
}

/* Low-end mode is precisely the mode where 300 live Blobs cannot be afforded,
 * and the mode is framework-neutral by design so the budget follows it rather
 * than a component's mount order. `lowEnd.js` imports nothing, so subscribing
 * here cannot form a cycle. */
const THUMB_BUDGET_NORMAL = 300;
const THUMB_BUDGET_LOW_END = 96;

onLowEndChange(on => setThumbCacheBudget(on ? THUMB_BUDGET_LOW_END : THUMB_BUDGET_NORMAL));
setThumbCacheBudget(isLowEnd() ? THUMB_BUDGET_LOW_END : THUMB_BUDGET_NORMAL);

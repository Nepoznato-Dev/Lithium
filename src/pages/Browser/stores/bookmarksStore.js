/**
 * Bookmarks state — flat bookmark array with tree building via Rust.
 * Persisted to localStorage by the I/O layer.
 */
import { signal, computed } from '@preact/signals';
import * as core from '../../../lib/core';

/** Flat bookmark array: [{ title, url, folder? }]. */
export const bookmarks = signal([]);

/** Search query for bookmarks page. */
export const bookmarkQuery = signal('');

/** Computed: bookmark tree built via Rust (or JS fallback). */
export const bookmarkTree = computed(() => {
  const result = core.browserBookmarkTreeSync(bookmarks.value);
  if (result) return result;
  // JS fallback: single "Bookmarks Bar" folder with all items
  return [{ name: 'Bookmarks Bar', children: [], items: bookmarks.value }];
});

/** Computed: filtered bookmarks matching query. */
export const filteredBookmarks = computed(() => {
  const q = bookmarkQuery.value.toLowerCase();
  if (!q) return bookmarks.value;
  const result = core.browserBookmarkSearchSync(bookmarks.value, q);
  if (result) return result;
  // JS fallback
  return bookmarks.value.filter(b =>
    b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
  );
});

/** Check if a URL is bookmarked. */
export function isBookmarked(url) {
  return bookmarks.value.some(b => b.url === url);
}

/* ---------- Actions ---------- */

export function addBookmark(title, url, folder) {
  const entry = { title: title || url, url };
  if (folder) entry.folder = folder;
  bookmarks.value = [...bookmarks.value, entry];
}

export function removeBookmark(url) {
  bookmarks.value = bookmarks.value.filter(b => b.url !== url);
}

export function toggleBookmark(title, url) {
  if (isBookmarked(url)) {
    removeBookmark(url);
  } else {
    addBookmark(title, url);
  }
}

export function updateBookmark(oldUrl, newTitle, newUrl) {
  bookmarks.value = bookmarks.value.map(b =>
    b.url === oldUrl ? { ...b, title: newTitle || b.title, url: newUrl || b.url } : b
  );
}

/** Load bookmarks from persisted data. */
export function loadBookmarks(data) {
  bookmarks.value = data || [];
}

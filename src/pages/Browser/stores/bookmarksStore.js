/**
 * Bookmarks state — flat bookmark array with tree building via Rust.
 * Persisted to localStorage by the I/O layer.
 */
import { signal, computed } from '@preact/signals';
/** Flat bookmark array: [{ title, url, folder? }]. */
export const bookmarks = signal([]);

/** Search query for bookmarks page. */
export const bookmarkQuery = signal('');

/** Computed: bookmark tree built from flat array. */
export const bookmarkTree = computed(() => {
  const bookmarksArr = bookmarks.value;
  if (!Array.isArray(bookmarksArr)) return [{ name: 'Bookmarks Bar', children: [], items: [] }];
  const folders = new Map();
  const unfiled = [];
  for (const b of bookmarksArr) {
    if (!b.folder) unfiled.push(b);
    else {
      if (!folders.has(b.folder)) folders.set(b.folder, []);
      folders.get(b.folder).push(b);
    }
  }
  const result = [{ name: 'Bookmarks Bar', children: [], items: unfiled.map(b => ({ title: b.title || '', url: b.url || '' })) }];
  for (const [name, items] of folders) {
    result.push({ name, children: [], items: items.map(b => ({ title: b.title || '', url: b.url || '' })) });
  }
  return result;
});

/** Computed: filtered bookmarks matching query. */
export const filteredBookmarks = computed(() => {
  const q = bookmarkQuery.value.toLowerCase();
  if (!q) return bookmarks.value;
  return bookmarks.value.filter(b =>
    (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q)
  ).map(b => ({ title: b.title || '', url: b.url || '' }));
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

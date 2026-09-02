/**
 * History state — browsing history with date grouping via Rust.
 * Persisted to IndexedDB by the I/O layer.
 */
import { signal, computed } from '@preact/signals';
import * as core from '../../../lib/core';

/** Flat history entries: [{ title, url, timestamp }]. Most recent first. */
export const historyEntries = signal([]);

/** Search query for history page. */
export const historyQuery = signal('');

/** Computed: history grouped by date via Rust. */
export const groupedHistory = computed(() => {
  const result = core.browserHistoryGroupSync(historyEntries.value, Date.now());
  if (result) return result;
  // JS fallback
  return [{ label: 'Today', entries: historyEntries.value }];
});

/** Computed: filtered history matching query. */
export const filteredHistory = computed(() => {
  const q = historyQuery.value.toLowerCase();
  if (!q) return historyEntries.value;
  const result = core.browserHistorySearchSync(historyEntries.value, q);
  if (result) return result;
  return historyEntries.value.filter(e =>
    e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
  );
});

/* ---------- Actions ---------- */

/** Add a history entry. */
export function addHistoryEntry(title, url) {
  if (!url) return;
  const entry = { title: title || url, url, timestamp: Date.now() };
  // Remove duplicate URLs, then prepend
  historyEntries.value = [entry, ...historyEntries.value.filter(e => e.url !== url)];
  // Cap at 5000 entries
  if (historyEntries.value.length > 5000) {
    historyEntries.value = historyEntries.value.slice(0, 5000);
  }
}

/** Remove a single history entry by URL. */
export function removeHistoryEntry(url) {
  historyEntries.value = historyEntries.value.filter(e => e.url !== url);
}

/** Remove multiple entries by URLs. */
export function removeHistoryEntries(urls) {
  const urlSet = new Set(urls);
  historyEntries.value = historyEntries.value.filter(e => !urlSet.has(e.url));
}

/** Clear all history. */
export function clearHistory() {
  historyEntries.value = [];
}

/** Clear history within a time range. */
export function clearHistoryRange(sinceTimestamp) {
  historyEntries.value = historyEntries.value.filter(e => e.timestamp < sinceTimestamp);
}

/** Load history from persisted data. */
export function loadHistory(data) {
  historyEntries.value = data || [];
}

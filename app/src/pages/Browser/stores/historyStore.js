/**
 * History state — browsing history with date grouping via Rust.
 * Persisted to IndexedDB by the I/O layer.
 */
import { signal, computed } from '@preact/signals';
/** Flat history entries: [{ title, url, timestamp }]. Most recent first. */
export const historyEntries = signal([]);

/** Search query for history page. */
export const historyQuery = signal('');

/** Computed: history grouped by date. */
export const groupedHistory = computed(() => {
  const entries = historyEntries.value;
  const now = Date.now();
  if (!Array.isArray(entries)) return [{ label: 'Today', entries: [] }];
  const msPerDay = 86400000;
  const nowDay = Math.floor(now / msPerDay);
  const buckets = { today: [], yesterday: [], week: [], month: [], older: [] };
  for (const e of entries) {
    const diff = nowDay - Math.floor((e.timestamp || 0) / msPerDay);
    const item = { title: e.title || '', url: e.url || '', timestamp: e.timestamp || 0 };
    if (diff === 0) buckets.today.push(item);
    else if (diff === 1) buckets.yesterday.push(item);
    else if (diff <= 7) buckets.week.push(item);
    else if (diff <= 30) buckets.month.push(item);
    else buckets.older.push(item);
  }
  const labels = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'Last 30 days'], ['older', 'Older']];
  return labels.filter(([k]) => buckets[k].length > 0).map(([k, label]) => ({ label, entries: buckets[k] }));
});

/** Computed: filtered history matching query. */
export const filteredHistory = computed(() => {
  const q = historyQuery.value.toLowerCase();
  if (!q) return historyEntries.value;
  return historyEntries.value.filter(e =>
    (e.title || '').toLowerCase().includes(q) || (e.url || '').toLowerCase().includes(q)
  ).map(e => ({ title: e.title || '', url: e.url || '', timestamp: e.timestamp || 0 }));
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

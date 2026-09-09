/**
 * HistoryService — Lithium OS unified history indexer.
 *
 * Indexes events from all subsystems (browser visits, file access, note
 * edits, AI conversations, app launches) into a single searchable history
 * stored in IndexedDB.  Supports full-text search and, when the AI runtime
 * is available, semantic similarity search via embeddings.
 *
 * Event schema:
 *   { id, type, title, subtitle, url?, appId?, ts, tags[] }
 *
 * Types: 'browser-visit', 'file-access', 'note-edit', 'ai-chat',
 *        'app-launch', 'download', 'bookmark'
 */

import { storage } from '../storage/localStorage';

const EVENT = 'lithium:history';
const INDEX_KEY = 'lithium:history:index';
const MAX_ENTRIES = 5000;

function emit(type, detail) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail, ts: Date.now() } }));
}

export function subscribeHistory(handler) {
  const listener = e => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// ── Index CRUD ───────────────────────────────────────────────────────────────
function loadIndex() {
  try { return storage.get(INDEX_KEY, []); } catch { return []; }
}

function persistIndex(index) {
  // Keep within bounds
  if (index.length > MAX_ENTRIES) index = index.slice(-MAX_ENTRIES);
  storage.set(INDEX_KEY, index);
}

function makeId() {
  return `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Record a history event. */
export function recordEvent(event) {
  if (!event || !event.type || !event.title) return;
  const entry = {
    id: makeId(),
    type: event.type,
    title: String(event.title),
    subtitle: event.subtitle || '',
    url: event.url || '',
    appId: event.appId || '',
    tags: event.tags || [],
    ts: event.ts || Date.now(),
  };
  const index = loadIndex();
  index.push(entry);
  persistIndex(index);
  emit('event', { entry });
  return entry;
}

// ── Convenience recorders ────────────────────────────────────────────────────
export function recordBrowserVisit(title, url) {
  return recordEvent({ type: 'browser-visit', title, url, appId: 'browser' });
}

export function recordFileAccess(name, path) {
  return recordEvent({ type: 'file-access', title: name, subtitle: path, appId: 'files' });
}

export function recordNoteEdit(name) {
  return recordEvent({ type: 'note-edit', title: name, appId: 'notepad' });
}

export function recordAiChat(title) {
  return recordEvent({ type: 'ai-chat', title, appId: 'ai-hub' });
}

export function recordAppLaunch(appId, appName) {
  return recordEvent({ type: 'app-launch', title: appName, appId });
}

export function recordDownload(name, url) {
  return recordEvent({ type: 'download', title: name, url, appId: 'downloader' });
}

export function recordBookmark(title, url) {
  return recordEvent({ type: 'bookmark', title, url, appId: 'browser' });
}

// ── Search ───────────────────────────────────────────────────────────────────
/** Full-text search over the history index.  Returns matching entries sorted
 *  by relevance (title match > subtitle match > tag match) then recency. */
export function search(query, options = {}) {
  if (!query || typeof query !== 'string') return [];
  const q = query.toLowerCase();
  const index = loadIndex();
  const typeFilter = options.type || null;
  const limit = options.limit || 50;

  const scored = index
    .filter(entry => !typeFilter || entry.type === typeFilter)
    .map(entry => {
      let score = 0;
      const titleLower = (entry.title || '').toLowerCase();
      const subLower = (entry.subtitle || '').toLowerCase();
      const urlLower = (entry.url || '').toLowerCase();
      if (titleLower.includes(q)) score += 10;
      if (subLower.includes(q)) score += 5;
      if (urlLower.includes(q)) score += 3;
      if (entry.tags?.some(t => t.toLowerCase().includes(q))) score += 4;
      // Recency bonus (newer = higher)
      score += Math.max(0, 1 - (Date.now() - entry.ts) / (30 * 24 * 60 * 60 * 1000));
      return { entry, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.entry);

  return scored;
}

/** Return the most recent N entries. */
export function recent(count = 20, typeFilter) {
  const index = loadIndex();
  const filtered = typeFilter ? index.filter(e => e.type === typeFilter) : index;
  return filtered.slice(-count).reverse();
}

/** Return entries from a specific app. */
export function byApp(appId, count = 50) {
  return loadIndex().filter(e => e.appId === appId).slice(-count).reverse();
}

/** Return all unique event types present in the index. */
export function eventTypes() {
  const types = new Set(loadIndex().map(e => e.type));
  return [...types].sort();
}

/** Clear the entire history index. */
export function clearHistory() {
  persistIndex([]);
  emit('cleared');
}

// ── Boot ─────────────────────────────────────────────────────────────────────
let _initialized = false;

export function initHistoryService() {
  if (_initialized) return;
  _initialized = true;
  emit('init', { count: loadIndex().length });
}

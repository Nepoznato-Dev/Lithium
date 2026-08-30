/**
 * Desktop notification bus + persistent history.
 *
 * `notify({...})` dispatches a `lithium:notify` CustomEvent for live toasts AND
 * appends an entry to a persistent history stored at `lithium:notifications`.
 * Components can subscribe to history changes via `subscribeToHistory` to
 * render a notification center (bell badge, tray panel, etc).
 *
 * Uses Rust/WASM for history filtering and manipulation when available.
 */

import { notifyFilterSync, notifyMarkAllReadSync, notifyMarkReadSync, notifyDismissSync, notifyUnreadCountSync } from '../core';

const EVENT_NAME = 'lithium:notify';
const HISTORY_EVENT = 'lithium:notify-history';
const STORAGE_KEY = 'lithium:notifications';
const MAX_HISTORY = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // drop anything older than 7 days

function readHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    
    // Try native filtering
    const cutoff = Date.now() - MAX_AGE_MS;
    const native = notifyFilterSync(raw, cutoff);
    if (native !== null) {
      const parsed = JSON.parse(native);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY);
    }
    
    // JS fallback
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && entry.id && entry.ts >= cutoff);
  } catch {
    return [];
  }
}

function writeHistory(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {
    // Storage full or unavailable — fail silently.
  }
}

function emitHistory() {
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function notify({ title, body = '', tone = 'info' } = {}) {
  if (!title) return;
  const entry = {
    id: makeId(),
    title: String(title),
    body: String(body || ''),
    tone: tone || 'info',
    ts: Date.now(),
    read: false,
  };
  // 1) Live event for toast subscribers.
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: entry }));
  // 2) Persist into history (newest first) and notify history subscribers.
  const next = [entry, ...readHistory()].slice(0, MAX_HISTORY);
  writeHistory(next);
  emitHistory();
}

export function subscribeToNotifications(handler) {
  const listener = event => handler(event.detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function subscribeToHistory(handler) {
  // Fire once with the current snapshot so subscribers can render immediately.
  handler(readHistory());
  const listener = () => handler(readHistory());
  window.addEventListener(HISTORY_EVENT, listener);
  // Cross-tab updates.
  const storageListener = event => {
    if (event.key === STORAGE_KEY) handler(readHistory());
  };
  window.addEventListener('storage', storageListener);
  return () => {
    window.removeEventListener(HISTORY_EVENT, listener);
    window.removeEventListener('storage', storageListener);
  };
}

export function getHistory() {
  return readHistory();
}

export function unreadCount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    
    // Try native count
    const native = notifyUnreadCountSync(raw);
    if (native !== null) return native;
    
    // JS fallback
    return readHistory().filter(entry => !entry.read).length;
  } catch {
    return 0;
  }
}

export function markAllRead() {
  const list = readHistory();
  if (list.every(entry => entry.read)) return;
  
  // Try native
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const native = notifyMarkAllReadSync(raw);
    if (native !== null) {
      try {
        writeHistory(JSON.parse(native));
        emitHistory();
        return;
      } catch { /* fall through to JS */ }
    }
  }
  
  // JS fallback
  writeHistory(list.map(entry => entry.read ? entry : { ...entry, read: true }));
  emitHistory();
}

export function markRead(id) {
  const list = readHistory();
  let changed = false;
  
  // Try native
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const native = notifyMarkReadSync(raw, id);
    if (native !== null) {
      try {
        writeHistory(JSON.parse(native));
        emitHistory();
        return;
      } catch { /* fall through to JS */ }
    }
  }
  
  // JS fallback
  const next = list.map(entry => {
    if (entry.id === id && !entry.read) {
      changed = true;
      return { ...entry, read: true };
    }
    return entry;
  });
  if (!changed) return;
  writeHistory(next);
  emitHistory();
}

export function dismissNotification(id) {
  // Try native
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const native = notifyDismissSync(raw, id);
    if (native !== null) {
      try {
        writeHistory(JSON.parse(native));
        emitHistory();
        return;
      } catch { /* fall through to JS */ }
    }
  }
  
  // JS fallback
  const list = readHistory();
  const next = list.filter(entry => entry.id !== id);
  if (next.length === list.length) return;
  writeHistory(next);
  emitHistory();
}

export function clearHistory() {
  if (readHistory().length === 0) return;
  writeHistory([]);
  emitHistory();
}

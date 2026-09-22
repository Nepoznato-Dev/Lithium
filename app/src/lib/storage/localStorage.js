const PREFIX = 'lithium:';
const pendingWrites = new Map();
let saveTimer;

/** Coalesce small UI snapshots, but never depend on a timer during page exit. */
export function scheduleStorageSave(key, value) {
  pendingWrites.set(key, value);
  clearTimeout(saveTimer);
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    flushStorageSaves();
  } else {
    saveTimer = setTimeout(flushStorageSaves, 200);
  }
}

export function flushStorageSaves() {
  clearTimeout(saveTimer);
  for (const [key, value] of pendingWrites) storage.set(key, value);
  pendingWrites.clear();
}

/** Discard queued snapshots before a deliberate data reset or backup restore. */
export function cancelStorageSaves() {
  clearTimeout(saveTimer);
  pendingWrites.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushStorageSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorageSaves();
  });
  if (import.meta.hot) import.meta.hot.dispose(flushStorageSaves);
}

/** Small, safe localStorage wrapper with JSON serialization. */
export const storage = {
  get(key, fallback = null) {
    try {
      if (pendingWrites.has(key)) return pendingWrites.get(key);
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    pendingWrites.delete(key);
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable — fail silently.
    }
  },
  remove(key) {
    pendingWrites.delete(key);
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // Ignore.
    }
  },
};

/**
 * WorkspaceStorageManager — crash-safe persistence for desktop workspace state.
 *
 * Uses a checkpoint + journal pattern on top of Lithium's existing IndexedDB:
 *   - Mutations are appended to a journal (fast, small writes).
 *   - Periodically the journal is folded into a compressed checkpoint (full snapshot).
 *   - On load: checkpoint is restored, then any journal entries after it are replayed.
 *   - On crash: at most one journal batch is lost; the checkpoint is always valid.
 *
 * This is ideal for workspace data (window positions, panel layouts, custom groups,
 * pinned apps, taskbar prefs) because:
 *   1. Writes are frequent but small — journal avoids rewriting the whole state.
 *   2. Crash safety matters — losing your desktop layout is frustrating.
 *   3. Reads are rare — only on page load — so checkpoint decompression is fine.
 *
 * Integrates with Lithium's existing `indexedDB.js` (openDB, idbGet, idbPut).
 */

import { openDB, idbGet, idbPut, idbDelete, idbKeys } from './indexedDB';

// ─── Configuration ─────────────────────────────────────────────────────────────

const CHECKPOINT_KEY = 'workspace-checkpoint';
const JOURNAL_PREFIX = 'workspace-journal-';
const CHECKPOINT_INTERVAL = 20; // Fold journal into checkpoint every N mutations.
const SETTINGS_PREFIX = 'lithium_';

// Workspace paths that are safe to persist (allowlist).
const ALLOWED_KEYS = new Set([
  'window-positions',
  'panel-layouts',
  'custom-groups',
  'pinned-taskbar',
  'taskbar-prefs',
  'desktop-wallpaper',
  'desktop-sound-level',
  'recent-apps',
  'split-snapshots',
  'accent-color',
  'dock-prefs',
  'widget-layout',
]);

// ─── Internal state ────────────────────────────────────────────────────────────

let cache = null; // In-memory mirror of the workspace state.
let mutationCount = 0;
let checkpointTimer = null;
let ready = false;

// ─── IndexedDB helpers ─────────────────────────────────────────────────────────

async function ensureDB() {
  await openDB(); // Ensures the 'kv' store exists.
}

async function readCheckpoint() {
  return idbGet('kv', CHECKPOINT_KEY).catch(() => null);
}

async function writeCheckpoint(data) {
  const payload = {
    version: 1,
    timestamp: Date.now(),
    data,
  };

  // Compress with gzip when available (most modern browsers).
  if (typeof CompressionStream !== 'undefined') {
    try {
      const json = JSON.stringify(payload);
      const stream = new Response(json).body.pipeThrough(new CompressionStream('gzip'));
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
      await idbPut('kv', CHECKPOINT_KEY, { compressed, compressed: true });
      return;
    } catch {
      // Fall through to uncompressed.
    }
  }

  await idbPut('kv', CHECKPOINT_KEY, payload);
}

async function readJournalEntries() {
  const keys = await idbKeys('kv').catch(() => []);
  const journalKeys = keys.filter(k => typeof k === 'string' && k.startsWith(JOURNAL_PREFIX));
  journalKeys.sort(); // Lexicographic sort = chronological order (timestamp suffix).

  const entries = [];
  for (const key of journalKeys) {
    const entry = await idbGet('kv', key).catch(() => null);
    if (entry) entries.push(entry);
  }
  return entries;
}

async function writeJournalEntry(mutations) {
  const key = JOURNAL_PREFIX + Date.now().toString(36).padStart(8, '0');
  await idbPut('kv', key, { mutations, timestamp: Date.now() });
}

async function clearJournal() {
  const keys = await idbKeys('kv').catch(() => []);
  for (const key of keys) {
    if (typeof key === 'string' && key.startsWith(JOURNAL_PREFIX)) {
      await idbDelete('kv', key).catch(() => {});
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the workspace storage manager.
 * Must be called once at app startup before any get/set calls.
 * @returns {Promise<Object>} The restored workspace state.
 */
export async function initWorkspaceStorage() {
  if (ready) return cache;

  await ensureDB();

  // 1. Read checkpoint.
  const checkpoint = await readCheckpoint();
  let state = {};

  if (checkpoint) {
    if (checkpoint.compressed) {
      // Decompress gzip checkpoint.
      try {
        const stream = new Response(checkpoint.compressed).body.pipeThrough(new DecompressionStream('gzip'));
        const json = await new Response(stream).text();
        const parsed = JSON.parse(json);
        state = parsed.data || {};
      } catch {
        state = {};
      }
    } else {
      state = checkpoint.data || {};
    }
  }

  // 2. Replay journal entries on top of checkpoint.
  const journal = await readJournalEntries();
  for (const entry of journal) {
    for (const mut of entry.mutations) {
      if (mut.type === 'set' && mut.value !== undefined) {
        state[mut.key] = mut.value;
      } else if (mut.type === 'delete') {
        delete state[mut.key];
      }
    }
  }

  cache = state;
  ready = true;

  // 3. Schedule periodic checkpoint folding.
  checkpointTimer = setInterval(() => {
    if (mutationCount >= CHECKPOINT_INTERVAL) {
      foldCheckpoint().catch(() => {});
    }
  }, 30_000);

  // 4. Flush on page unload.
  window.addEventListener('beforeunload', () => {
    if (mutationCount > 0) {
      foldCheckpoint().catch(() => {});
    }
  });

  return cache;
}

/**
 * Get a workspace value by key.
 * @param {string} key - One of the ALLOWED_KEYS.
 * @param {*} fallback - Default value if key doesn't exist.
 * @returns {*} The stored value or fallback.
 */
export function workspaceGet(key, fallback = null) {
  if (!ready) {
    console.warn('[WorkspaceStorage] Not initialized — call initWorkspaceStorage() first.');
    return fallback;
  }
  if (!ALLOWED_KEYS.has(key)) {
    console.warn(`[WorkspaceStorage] Key "${key}" not in allowlist.`);
    return fallback;
  }
  return key in cache ? cache[key] : fallback;
}

/**
 * Set a workspace value. The mutation is journaled immediately and the
 * checkpoint is folded periodically (every CHECKPOINT_INTERVAL mutations).
 * @param {string} key - One of the ALLOWED_KEYS.
 * @param {*} value - The value to store.
 */
export async function workspaceSet(key, value) {
  if (!ready) {
    console.warn('[WorkspaceStorage] Not initialized — call initWorkspaceStorage() first.');
    return;
  }
  if (!ALLOWED_KEYS.has(key)) {
    console.warn(`[WorkspaceStorage] Key "${key}" not in allowlist.`);
    return;
  }

  // Update in-memory cache instantly (UI never waits).
  cache[key] = value;

  // Journal the mutation.
  try {
    await writeJournalEntry([{ type: 'set', key, value }]);
    mutationCount++;

    // Auto-fold if threshold reached.
    if (mutationCount >= CHECKPOINT_INTERVAL) {
      foldCheckpoint().catch(() => {});
    }
  } catch (err) {
    console.error('[WorkspaceStorage] Failed to journal mutation:', err);
  }
}

/**
 * Delete a workspace value.
 * @param {string} key - One of the ALLOWED_KEYS.
 */
export async function workspaceDelete(key) {
  if (!ready) return;
  if (!ALLOWED_KEYS.has(key)) return;

  delete cache[key];

  try {
    await writeJournalEntry([{ type: 'delete', key }]);
    mutationCount++;
    if (mutationCount >= CHECKPOINT_INTERVAL) {
      foldCheckpoint().catch(() => {});
    }
  } catch (err) {
    console.error('[WorkspaceStorage] Failed to journal deletion:', err);
  }
}

/**
 * Fold the journal into a full checkpoint.
 * This is called automatically, but can be triggered manually (e.g., before unload).
 */
export async function foldCheckpoint() {
  if (!ready || mutationCount === 0) return;

  try {
    await writeCheckpoint(cache);
    await clearJournal();
    mutationCount = 0;
  } catch (err) {
    console.error('[WorkspaceStorage] Failed to fold checkpoint:', err);
  }
}

/**
 * Get a snapshot of the current workspace state (for debugging / storage accounting).
 */
export function workspaceSnapshot() {
  return { ...cache };
}

/**
 * Clear all workspace data (checkpoint + journal).
 */
export async function clearWorkspace() {
  cache = {};
  mutationCount = 0;
  await writeCheckpoint({}).catch(() => {});
  await clearJournal().catch(() => {});
}

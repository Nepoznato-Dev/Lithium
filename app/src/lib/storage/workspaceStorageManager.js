/**
 * WorkspaceStorageManager — checkpointed persistence for desktop workspace state.
 *
 * Checkpoint + journal pattern on a dedicated IndexedDB:
 *   1. Boot: load latest checkpoint (gzip-compressed full snapshot)
 *   2. Replay journal entries (individual key→value mutations) on top
 *   3. During use: mutations append to journal (cheap, single entries)
 *   4. Periodically: flush journal → create new checkpoint (full snapshot)
 *   5. On beforeunload: flush pending journal entries (fire-and-forget)
 *
 * Uses its own IndexedDB (`LithiumWorkspaceDB`) with two object stores
 * instead of scanning the shared `kv` store — no key-prefix scanning overhead.
 *
 * Lightweight design choices vs. the Nexus source:
 *   - No class wrapper — plain functions + module-level state (less overhead).
 *   - Single checkpoint row (`id:'latest'`) — no version juggling.
 *   - Journal auto-trimmed on every flush — bounded growth for free.
 *   - Gzip via CompressionStream (zero dependencies).
 */

// ─── Configuration ────────────────────────────────────────────────────────────

const DB_NAME = 'LithiumWorkspaceDB';
const DB_VERSION = 1;
const STORE_CP = 'checkpoints';
const STORE_JOURNAL = 'journal';
const FLUSH_DELAY_MS = 3000;
const CHECKPOINT_INTERVAL_MS = 180_000; // 3 min
const MAX_JOURNAL_ROWS = 2000;
const SETTINGS_PREFIX = 'lithium_';

// ─── Module state ─────────────────────────────────────────────────────────────

let db = null;
let cache = {};
let dirtyKeys = new Set();
let flushTimer = null;
let cpTimer = null;
let ready = false;

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

const now = () => Date.now();
const parse = (raw, fb = null) => { try { return JSON.parse(raw); } catch { return fb; } };

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return { enc: 'plain', data: text };
  const s = new CompressionStream('gzip');
  const w = s.writable.getWriter();
  w.write(new TextEncoder().encode(text));
  w.close();
  const buf = await new Response(s.readable).arrayBuffer();
  return { enc: 'gzip', data: Array.from(new Uint8Array(buf)) };
}

async function ungzip(blob) {
  if (!blob) return null;
  if (blob.enc === 'plain') return blob.data;
  if (blob.enc === 'gzip' && typeof DecompressionStream !== 'undefined') {
    const s = new DecompressionStream('gzip');
    const w = s.writable.getWriter();
    w.write(new Uint8Array(blob.data));
    w.close();
    return new TextDecoder().decode(new Uint8Array(await new Response(s.readable).arrayBuffer()));
  }
  return null;
}

// ─── IndexedDB plumbing ───────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE_CP))
        idb.createObjectStore(STORE_CP, { keyPath: 'id' });
      if (!idb.objectStoreNames.contains(STORE_JOURNAL)) {
        const js = idb.createObjectStore(STORE_JOURNAL, { keyPath: 'id', autoIncrement: true });
        js.createIndex('ts', 'ts');
      }
    };
  });
}

function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('tx aborted'));
  });
}

// ─── Core persistence ─────────────────────────────────────────────────────────

async function restore() {
  // 1. Load checkpoint.
  const cpReq = db.transaction(STORE_CP, 'readonly').objectStore(STORE_CP).get('latest');
  const cp = await new Promise(r => { cpReq.onsuccess = () => r(cpReq.result || null); });
  if (cp?.blob) {
    const text = await ungzip(cp.blob);
    const parsed = parse(text);
    if (parsed && typeof parsed === 'object') cache = parsed;
  }

  // 2. Replay journal.
  const journalTx = db.transaction(STORE_JOURNAL, 'readonly');
  const cursorReq = journalTx.objectStore(STORE_JOURNAL).openCursor();
  await new Promise((res, rej) => {
    cursorReq.onerror = () => rej(cursorReq.error);
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return res();
      if (c.value?.key != null) cache[c.value.key] = c.value.value;
      c.continue();
    };
  });
  await txDone(journalTx);
}

async function flushJournal() {
  if (!db || dirtyKeys.size === 0) return;
  const ts = now();
  const entries = [];
  dirtyKeys.forEach(k => entries.push({ ts, key: k, value: cache[k] }));
  dirtyKeys.clear();

  const tx = db.transaction(STORE_JOURNAL, 'readwrite');
  const store = tx.objectStore(STORE_JOURNAL);
  entries.forEach(e => store.add(e));
  await txDone(tx);
  await trimJournal();
}

async function trimJournal() {
  const tx = db.transaction(STORE_JOURNAL, 'readwrite');
  const store = tx.objectStore(STORE_JOURNAL);
  const rows = [];
  await new Promise((res, rej) => {
    const req = store.openCursor();
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return res();
      rows.push({ id: c.primaryKey, ts: c.value.ts });
      c.continue();
    };
  });
  if (rows.length > MAX_JOURNAL_ROWS) {
    rows.sort((a, b) => a.ts - b.ts);
    rows.slice(0, rows.length - MAX_JOURNAL_ROWS).forEach(r => store.delete(r.id));
  }
  await txDone(tx);
}

async function createCheckpoint(reason = 'manual') {
  const compressed = await gzip(JSON.stringify(cache));
  const tx = db.transaction(STORE_CP, 'readwrite');
  tx.objectStore(STORE_CP).put({ id: 'latest', ts: now(), reason, blob: compressed });
  await txDone(tx);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    try { await flushJournal(); } catch (e) { console.warn('[WorkspaceStorage] journal flush failed', e); }
  }, FLUSH_DELAY_MS);
}

// ─── Settings mirror (bounded, allowlisted localStorage keys) ─────────────────

function mirrorSettings() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(SETTINGS_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (typeof raw === 'string' && raw.length <= 4096) {
      cache[`_settings.${key}`] = parse(raw, raw);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the workspace storage manager.
 * Call once at app startup before any get/set calls.
 * @returns {Promise<Object>} The restored workspace state.
 */
export async function initWorkspaceStorage() {
  if (ready) return cache;
  db = await openDb();
  mirrorSettings();
  await restore();
  ready = true;

  // Periodic checkpoint every 3 min.
  cpTimer = setInterval(async () => {
    try { await flushJournal(); await createCheckpoint('periodic'); }
    catch (e) { console.warn('[WorkspaceStorage] periodic checkpoint failed', e); }
  }, CHECKPOINT_INTERVAL_MS);

  window.addEventListener('beforeunload', () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flushJournal().catch(() => {});
  });

  return cache;
}

/** Get a workspace value by key. */
export function workspaceGet(key, fallback = null) {
  if (!ready) { console.warn('[WorkspaceStorage] Not initialized'); return fallback; }
  return key in cache ? cache[key] : fallback;
}

/** Set a workspace value. Journaled asynchronously, checkpointed periodically. */
export async function workspaceSet(key, value) {
  if (!ready) { console.warn('[WorkspaceStorage] Not initialized'); return; }
  cache[key] = value;
  dirtyKeys.add(key);
  scheduleFlush();
}

/** Delete a workspace value. */
export async function workspaceDelete(key) {
  if (!ready) return;
  delete cache[key];
  dirtyKeys.add(key);
  scheduleFlush();
}

/** Fold journal into a full checkpoint immediately. */
export async function foldCheckpoint() {
  if (!ready || dirtyKeys.size === 0) return;
  try { await flushJournal(); await createCheckpoint('manual'); }
  catch (e) { console.error('[WorkspaceStorage] checkpoint fold failed', e); }
}

/** Snapshot of current workspace state (debug / storage accounting). */
export function workspaceSnapshot() { return { ...cache }; }

/** Clear all workspace data (checkpoint + journal). */
export async function clearWorkspace() {
  cache = {};
  dirtyKeys.clear();
  if (db) {
    try {
      const tx1 = db.transaction(STORE_CP, 'readwrite');
      tx1.objectStore(STORE_CP).clear();
      await txDone(tx1);
      const tx2 = db.transaction(STORE_JOURNAL, 'readwrite');
      tx2.objectStore(STORE_JOURNAL).clear();
      await txDone(tx2);
    } catch { /* best-effort */ }
  }
}

/* ================================================================
 *  IndexedDB — minimal promise wrapper (stores: blobs, kv, cacheLedger).
 * ================================================================ */

const DB_NAME = 'lithium-storage';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('cacheLedger')) db.createObjectStore('cacheLedger');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function withStore(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbGet = (store, key) => withStore(store, 'readonly', s => s.get(key));
export const idbPut = (store, key, value) => withStore(store, 'readwrite', s => s.put(value, key));
export const idbDelete = (store, key) => withStore(store, 'readwrite', s => s.delete(key));
export const idbKeys = store => withStore(store, 'readonly', s => s.getAllKeys());
export const idbAll = store => withStore(store, 'readonly', s => s.getAll());

/* ================================================================
 *  OPFS — Origin Private File System streaming storage for large downloads.
 * ================================================================ */

export function opfsAvailable() {
  return Boolean(navigator.storage?.getDirectory);
}

export async function opfsRoot() {
  return navigator.storage.getDirectory();
}

/** Stream a fetch response into an OPFS file; only one chunk in memory at a time. */
export async function opfsWriteStream(fileName, response, total, onProgress, signal) {
  const root = await opfsRoot();
  const handle = await root.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  let received = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.length;
      onProgress?.({ received, total });
    }
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    await root.removeEntry(fileName).catch(() => {});
    throw err;
  }
  return received;
}

/** Lazy File handle for a stored OPFS file (reads stay on disk). */
export async function opfsGetFile(fileName) {
  const root = await opfsRoot();
  const handle = await root.getFileHandle(fileName);
  return handle.getFile();
}

export async function opfsDelete(fileName) {
  if (!opfsAvailable()) return;
  const root = await opfsRoot().catch(() => null);
  await root?.removeEntry(fileName).catch(() => {});
}

export async function opfsExists(fileName) {
  if (!opfsAvailable()) return false;
  try {
    const root = await opfsRoot();
    await root.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

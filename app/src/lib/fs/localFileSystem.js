/**
 * File System Access API wrapper — lets the user pick a local directory
 * and read/write files through the browser's native file-system handles.
 *
 * Supported in Chromium-based browsers (Chrome, Edge, Opera).
 * Falls back gracefully: isSupported() returns false elsewhere.
 */

/** True when the browser supports the File System Access API. */
export function isSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Open the native directory picker. Returns a FileSystemDirectoryHandle
 * with readwrite access, or null if the user cancels.
 */
export async function pickDirectory() {
  if (!isSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });
    return handle;
  } catch (err) {
    // User cancelled or permission denied.
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Verify (and if necessary request) readwrite permission on a handle.
 * Returns true if permission was granted.
 */
export async function verifyPermission(handle, readWrite = true) {
  const opts = { mode: readWrite ? 'readwrite' : 'read' };
  // query() returns 'granted', 'prompt', or 'denied'.
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  // request() shows the OS permission dialog if the browser requires it.
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** Iterate all entries in a directory handle. Returns an array of
 *  { name, kind, handle } objects. */
export async function readDirectory(dirHandle) {
  const entries = [];
  for await (const [name, handle] of dirHandle) {
    entries.push({ name, kind: handle.kind, handle });
  }
  return entries;
}

/** Read a file handle's contents as a Blob. */
export async function readFile(fileHandle) {
  return await fileHandle.getFile();
}

/**
 * Write data to a file inside a directory. Creates the file if it doesn't
 * exist. `path` can be a nested relative path (e.g. "sub/file.txt").
 * `data` can be a string, Blob, ArrayBuffer, or Uint8Array.
 */
export async function writeFile(dirHandle, path, data) {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  let current = dirHandle;

  // Walk/create intermediate directories.
  for (const dirName of parts) {
    current = await current.getDirectoryHandle(dirName, { create: true });
  }

  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(data);
    await writable.close();
  } catch (err) {
    // Abort the writable stream on failure to avoid resource leaks.
    try { await writable.abort(); } catch { /* best effort */ }
    throw err;
  }
}

/** Delete a file or subdirectory from a directory handle. */
export async function deleteEntry(dirHandle, name) {
  await dirHandle.removeEntry(name, { recursive: true });
}

/**
 * Persist a directory handle in IndexedDB so it survives page reloads.
 * Handles are stored under a fixed key in the 'pwa-handles' store.
 */
const HANDLE_DB = 'lithium-pwa-handles';
const HANDLE_KEY = 'local-sync-dir';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save a directory handle for later retrieval. */
export async function saveDirectoryHandle(handle) {
  const db = await openHandleDb();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(handle, HANDLE_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Retrieve a previously saved directory handle, or null. */
export async function loadDirectoryHandle() {
  const db = await openHandleDb();
  const tx = db.transaction('handles', 'readonly');
  const req = tx.objectStore('handles').get(HANDLE_KEY);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** Clear the saved directory handle. */
export async function clearDirectoryHandle() {
  const db = await openHandleDb();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').delete(HANDLE_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Local FS sync bridge — connects a user-chosen local directory to
 * Lithium's IndexedDB storage, enabling bidirectional data sync.
 *
 * The bridge persists the directory handle across reloads via IndexedDB
 * and re-verifies permission on every page load (browsers revoke handle
 * permissions after restart).
 */

import {
  verifyPermission,
  writeFile,
  readFile,
  saveDirectoryHandle,
  loadDirectoryHandle,
  clearDirectoryHandle,
} from './localFileSystem';

const SETTINGS_KEY = 'lithium:local-sync';
const SYNC_SUBDIR = 'lithium-sync';

/** Read sync config from localStorage. */
function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Persist sync config. */
function saveConfig(cfg) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
}

/** Current bridge state — exposed via getSyncState(). */
let dirHandle = null;
let dirName = '';
let permissionGranted = false;
let autoSync = false;
let lastSync = 0;
let syncing = false;
const stateListeners = new Set();

function notifyListeners() {
  const state = getSyncState();
  for (const fn of stateListeners) fn(state);
}

/** Returns the current sync state snapshot. */
export function getSyncState() {
  return {
    bound: dirHandle !== null,
    dirName,
    permissionGranted,
    autoSync,
    lastSync,
    syncing,
  };
}

/** Subscribe to sync state changes. Returns an unsubscribe function. */
export function onSyncStateChange(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/**
 * Bind a directory for sync. Verifies permission, creates the sync
 * subdirectory, and persists the handle.
 */
export async function bindDirectory(handle) {
  const ok = await verifyPermission(handle, true);
  if (!ok) throw new Error('Permission denied for directory');

  dirHandle = handle;
  dirName = handle.name;
  permissionGranted = true;

  // Ensure the sync subdirectory exists.
  await handle.getDirectoryHandle(SYNC_SUBDIR, { create: true });

  await saveDirectoryHandle(handle);
  const cfg = loadConfig();
  cfg.bound = true;
  cfg.dirName = dirName;
  saveConfig(cfg);

  notifyListeners();
}

/** Unbind the current directory and clear persisted state. */
export async function unbindDirectory() {
  dirHandle = null;
  dirName = '';
  permissionGranted = false;
  autoSync = false;

  await clearDirectoryHandle();
  const cfg = loadConfig();
  cfg.bound = false;
  cfg.dirName = '';
  cfg.autoSync = false;
  saveConfig(cfg);

  notifyListeners();
}

/** Toggle auto-sync on/off. */
export function setAutoSync(enabled) {
  autoSync = enabled;
  const cfg = loadConfig();
  cfg.autoSync = enabled;
  saveConfig(cfg);
  notifyListeners();
}

/**
 * Export Lithium data to the bound directory. Writes a JSON snapshot
 * of localStorage keys and key IndexedDB stores.
 */
export async function syncToDisk() {
  if (!dirHandle || !permissionGranted) throw new Error('No bound directory');
  syncing = true;
  notifyListeners();

  try {
    const syncDir = await dirHandle.getDirectoryHandle(SYNC_SUBDIR, { create: true });

    // 1. Export localStorage (all lithium: keys).
    const lsData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('lithium:')) lsData[key] = localStorage.getItem(key);
    }
    await writeFile(syncDir, 'localStorage.json', JSON.stringify(lsData, null, 2));

    // 2. Export settings as a separate convenience file.
    const settingsRaw = localStorage.getItem('lithium:settings');
    if (settingsRaw) {
      await writeFile(syncDir, 'settings.json', settingsRaw);
    }

    // 3. Timestamp marker.
    await writeFile(syncDir, 'last-sync.json', JSON.stringify({
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      direction: 'to-disk',
    }));

    lastSync = Date.now();
    const cfg = loadConfig();
    cfg.lastSync = lastSync;
    saveConfig(cfg);
  } finally {
    syncing = false;
    notifyListeners();
  }
}

/**
 * Import data from the bound directory back into Lithium.
 * Reads the localStorage.json snapshot and restores keys.
 */
export async function syncFromDisk() {
  if (!dirHandle || !permissionGranted) throw new Error('No bound directory');
  syncing = true;
  notifyListeners();

  try {
    const syncDir = await dirHandle.getDirectoryHandle(SYNC_SUBDIR);

    // Read localStorage.json and restore.
    try {
      const fileHandle = await syncDir.getFileHandle('localStorage.json');
      const blob = await readFile(fileHandle);
      const text = await blob.text();
      const data = JSON.parse(text);
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('lithium:') && typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      }
    } catch {
      // File may not exist yet — that's fine.
    }

    // Update timestamp.
    try {
      await writeFile(syncDir, 'last-sync.json', JSON.stringify({
        timestamp: Date.now(),
        iso: new Date().toISOString(),
        direction: 'from-disk',
      }));
    } catch { /* best effort */ }

    lastSync = Date.now();
    const cfg = loadConfig();
    cfg.lastSync = lastSync;
    saveConfig(cfg);
  } finally {
    syncing = false;
    notifyListeners();
  }
}

/**
 * Initialize the bridge on page load — rehydrate the saved directory
 * handle and re-verify permission. Call once during app startup.
 */
export async function initSyncBridge() {
  const cfg = loadConfig();
  autoSync = Boolean(cfg.autoSync);

  if (!cfg.bound) return;

  try {
    const handle = await loadDirectoryHandle();
    if (!handle) return;

    // Re-verify permission (browsers revoke after restart).
    const ok = await verifyPermission(handle, true);
    if (!ok) {
      // Permission lost — keep the binding but flag it.
      dirHandle = handle;
      dirName = cfg.dirName || handle.name;
      permissionGranted = false;
      notifyListeners();
      return;
    }

    dirHandle = handle;
    dirName = cfg.dirName || handle.name;
    permissionGranted = true;
    lastSync = cfg.lastSync || 0;
    notifyListeners();
  } catch {
    // Handle may be stale or the IDB read failed — silently degrade.
  }
}

/**
 * liStorageSettings — User-configurable storage limits for the liStorage gateway.
 *
 * Reads/writes the `storage.maxUploadMB` setting that controls the maximum
 * size of a single IndexedDB write operation.  The liStorage gateway reads
 * this value on every putBlob call and rejects writes that exceed the limit.
 */

import { loadSettings, saveSettings } from '../settings';

const DEFAULT_MAX_UPLOAD_MB = 500;

/**
 * Return the current storage limits.
 * @returns {{ maxUploadMB: number }}
 */
export function getStorageLimits() {
  const s = loadSettings();
  return {
    maxUploadMB: s?.storage?.maxUploadMB ?? DEFAULT_MAX_UPLOAD_MB,
  };
}

/**
 * Update one or more storage limits.
 * @param {{ maxUploadMB?: number }} limits
 */
export function setStorageLimits(limits) {
  const s = loadSettings();
  const storage = { ...(s.storage || {}) };
  if (limits.maxUploadMB != null) {
    storage.maxUploadMB = Math.max(10, Math.min(5000, Math.round(limits.maxUploadMB)));
  }
  saveSettings({ ...s, storage });
}

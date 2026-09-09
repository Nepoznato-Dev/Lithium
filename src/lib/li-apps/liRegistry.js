/**
 * .li App Registry
 *
 * Persists installed .li app descriptors in localStorage so they
 * survive page reloads.  On boot the desktop shell merges these
 * with the built-in apps discovered by liParser.discoverApps().
 */

import { storage } from '../storage';

const STORE_KEY = 'li-apps';

/** Return all installed .li app manifests. */
export function getInstalledApps() {
  return storage.get(STORE_KEY, []);
}

/** Look up a single app by id. */
export function getApp(id) {
  return getInstalledApps().find(app => app.id === id) || null;
}

/** Register (or update) an app manifest. */
export function registerApp(manifest) {
  const apps = getInstalledApps();
  const idx = apps.findIndex(a => a.id === manifest.id);
  if (idx >= 0) apps[idx] = manifest;
  else apps.push(manifest);
  storage.set(STORE_KEY, apps);
}

/** Remove an app by id. */
export function unregisterApp(id) {
  const apps = getInstalledApps().filter(a => a.id !== id);
  storage.set(STORE_KEY, apps);
}

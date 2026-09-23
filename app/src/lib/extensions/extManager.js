/**
 * Extension Manager
 *
 * High-level orchestrator that wires discovery, loading, and lifecycle
 * together. Called once at app startup to initialize all enabled+approved
 * extensions. Re-exports registry/loader functions for the Settings UI.
 */

import { discoverExtensions, loadExtension, unloadExtension, reloadExtension, getLoadedExtensions, clearDiscoveryCache, isLoaded } from './extLoader';
import { getRegistry, getExtensionEntry, ensureEntry, setExtensionEnabled, setApprovedPermissions, removeExtension, hasApprovedPermission } from './extRegistry';

/**
 * Initialize the extension system at startup.
 * Discovers all extensions, loads those that are enabled and approved.
 * Safe to call multiple times — skips already-loaded extensions.
 */
export async function initExtensions() {
  try {
    const all = await discoverExtensions(true);
    const toLoad = [];

    for (const { manifest, registryEntry } of all) {
      if (!registryEntry || !registryEntry.enabled) continue;
      if (isLoaded(manifest.id)) continue;
      // Ensure entry exists so we have a reference
      ensureEntry(manifest.id);
      toLoad.push(loadExtension(manifest, registryEntry.approvedPermissions || [])
        .catch(err => {
          console.warn(`[Extension manager] Failed to load "${manifest.id}":`, err.message);
        }));
    }

    await Promise.all(toLoad);
  } catch (err) {
    console.warn('[Extension manager] Discovery failed:', err);
  }
}

/**
 * Enable an extension: ensure it has a registry entry, then load it.
 * The Settings UI is responsible for permission approval before calling this.
 *
 * @param {string} id  Extension id.
 * @param {string[]} permissions  Approved permission strings.
 */
export async function enableExtension(id, permissions) {
  setApprovedPermissions(id, permissions);
  setExtensionEnabled(id, true);
  clearDiscoveryCache();
  const all = await discoverExtensions(true);
  const entry = all.find(e => e.manifest.id === id);
  if (entry) {
    await loadExtension(entry.manifest, permissions);
  }
}

/**
 * Disable and unload an extension.
 * @param {string} id
 */
export function disableExtension(id) {
  unloadExtension(id);
  setExtensionEnabled(id, false);
}

/**
 * Fully uninstall an extension (unload + remove registry entry).
 * @param {string} id
 */
export function uninstallExtension(id) {
  unloadExtension(id);
  removeExtension(id);
  clearDiscoveryCache();
}

/* Re-export loader/registry functions for the Settings UI */
export {
  discoverExtensions,
  loadExtension,
  unloadExtension,
  reloadExtension,
  getLoadedExtensions,
  isLoaded,
  getRegistry,
  getExtensionEntry,
  ensureEntry,
  setExtensionEnabled,
  setApprovedPermissions,
  removeExtension,
  hasApprovedPermission,
};

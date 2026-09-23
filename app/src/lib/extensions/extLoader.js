/**
 * Extension Loader
 *
 * Discovers extensions from the /extensions/ directory, fetches their
 * manifests, and manages the load/unload lifecycle. Each extension's
 * entry JS is fetched, evaluated in the page context, and its `init(li)`
 * call receives a permission-gated API object.
 *
 * Extensions run unsandboxed — their JS is injected directly into the
 * host page via `new Function()` evaluation. Trust is established through
 * the granular permission system in extRegistry.js: an extension can only
 * call APIs the user has explicitly approved.
 */

import { loadExtManifest } from './extParser';
import { getRegistry } from './extRegistry';
import { buildExtensionAPI } from './extHostAPI';
import { unregisterAllPages } from './extSettingsRegistry';
import { unregisterAllProviderApis } from './extSecurity';

/** Track currently loaded extensions: Map<extId, { manifest, api, scriptEl }> */
const loaded = new Map();

/** Cache of discovered extension manifests (refreshed on demand). */
let discovered = null;

/* ------------------------------------------------------------------ */
/*  Discovery                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetch the directory listing from /extensions/ (provided by Vite middleware).
 * Returns an array of directory names.
 */
async function fetchDirectoryListing() {
  try {
    const res = await fetch('/extensions/');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.extensions) ? data.extensions : [];
  } catch {
    return [];
  }
}

/**
 * Discover all available extensions by scanning the /extensions/ directory.
 * Loads and validates each manifest, cross-references with the registry.
 *
 * @param {boolean} [force=false]  Bypass cache.
 * @returns {Promise<Array<object>>}  Array of { manifest, registryEntry }.
 */
export async function discoverExtensions(force = false) {
  if (discovered && !force) return discovered;

  const dirNames = await fetchDirectoryListing();
  const registry = getRegistry();
  const results = [];

  for (const dirName of dirNames) {
    try {
      const manifest = await loadExtManifest(dirName);
      const regEntry = registry.extensions.find(e => e.id === manifest.id) || null;
      results.push({ manifest, registryEntry: regEntry });
    } catch (err) {
      console.warn(`[Extension loader] Skipping "${dirName}": ${err.message}`);
    }
  }

  discovered = results;
  return results;
}

/** Clear the discovery cache so the next discoverExtensions() re-fetches. */
export function clearDiscoveryCache() {
  discovered = null;
}

/* ------------------------------------------------------------------ */
/*  Load / Unload                                                      */
/* ------------------------------------------------------------------ */

/**
 * Load and initialize a single extension.
 *
 * @param {object} manifest  Validated extension manifest.
 * @param {string[]} approvedPerms  Permissions the user has approved.
 * @returns {Promise<object>}  The extension API object.
 */
export async function loadExtension(manifest, approvedPerms) {
  const extId = manifest.id;

  // Already loaded?
  if (loaded.has(extId)) {
    return loaded.get(extId).api;
  }

  // Attach approved permissions to manifest for the API builder
  const fullManifest = { ...manifest, _approvedPermissions: approvedPerms || [] };

  // Build the permission-gated API
  const api = buildExtensionAPI(fullManifest);

  // Fetch the entry JS
  const entryUrl = `/extensions/${encodeURIComponent(manifest._sourceDir || extId)}/${encodeURIComponent(manifest.entry)}`;
  let entryCode;
  try {
    const res = await fetch(entryUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    entryCode = await res.text();
  } catch (err) {
    throw new Error(`Failed to load entry script for "${extId}": ${err.message}`);
  }

  // Evaluate the extension code in the page context.
  // The extension's JS is expected to define `function init(li) { ... }`
  // and optionally `function cleanup() { ... }`.
  // We wrap in an IIFE and expose init/cleanup via a registration callback.
  try {
    // Use Function constructor to evaluate in global-like scope
    const factory = new Function('registerExt', `
      "use strict";
      ${entryCode}
      // Extension must define init and optionally cleanup
      if (typeof init === 'function') {
        registerExt({ init, cleanup: typeof cleanup === 'function' ? cleanup : null });
      }
    `);

    let extModule = null;
    factory(mod => { extModule = mod; });

    if (!extModule) {
      throw new Error('Extension did not define an init(li) function');
    }

    // Call the extension's init with its permission-gated API
    extModule.init(api);

    // Track loaded state
    loaded.set(extId, {
      manifest: fullManifest,
      api,
      cleanup: extModule.cleanup,
    });

    return api;
  } catch (err) {
    throw new Error(`Error initializing extension "${extId}": ${err.message}`);
  }
}

/**
 * Unload a running extension: call its cleanup, remove CSS,
 * unregister settings pages, and delete from the loaded map.
 *
 * @param {string} extId
 */
export function unloadExtension(extId) {
  const entry = loaded.get(extId);
  if (!entry) return;

  try {
    // Call extension's own cleanup
    if (typeof entry.cleanup === 'function') {
      entry.cleanup();
    }
  } catch (err) {
    console.warn(`[Extension] cleanup() failed for "${extId}":`, err);
  }

  try {
    // Call API cleanup (removes event listeners, CSS, etc.)
    if (typeof entry.api?._cleanup === 'function') {
      entry.api._cleanup();
    }
  } catch { /* best effort */ }

  // Unregister all settings pages
  unregisterAllPages(extId);

  // RULE A — revoke any APIs this extension exposed to apps so a stale
  // handler can never be invoked after unload (defense-in-depth: the api's
  // own _cleanup does this too, but it runs best-effort inside a try/catch).
  unregisterAllProviderApis(extId);

  loaded.delete(extId);
  window.dispatchEvent(new CustomEvent('lithium:extensions-changed'));
}

/**
 * Reload an extension (unload + re-discover + load).
 * @param {string} extId
 */
export async function reloadExtension(extId) {
  unloadExtension(extId);
  clearDiscoveryCache();
  const all = await discoverExtensions(true);
  const entry = all.find(e => e.manifest.id === extId);
  if (entry?.registryEntry?.enabled) {
    await loadExtension(entry.manifest, entry.registryEntry.approvedPermissions);
  }
}

/**
 * Get a map of all currently loaded extension ids to their manifests.
 * @returns {Map<string, object>}
 */
export function getLoadedExtensions() {
  const result = new Map();
  for (const [id, { manifest }] of loaded) {
    result.set(id, manifest);
  }
  return result;
}

/**
 * Check if an extension is currently loaded.
 * @param {string} extId
 * @returns {boolean}
 */
export function isLoaded(extId) {
  return loaded.has(extId);
}

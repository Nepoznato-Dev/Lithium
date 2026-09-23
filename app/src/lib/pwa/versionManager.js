/**
 * Version Manager — manual PWA update system.
 *
 * Lets the user install any available version of Lithium, switch between
 * cached versions, roll back, or reset to the default (factory) build.
 *
 * Communication with the service worker happens via postMessage.
 * The SW handles caching version assets and switching the active version.
 *
 * State flow:
 *   fetchManifest() → list of available versions from /versions/manifest.json
 *   installVersion() → SW downloads + caches all assets for a version
 *   activateVersion() → SW sets active version in IDB, page reloads
 *   factoryReset() → clears active version + all version caches
 */

import { storage } from '../storage/localStorage';

const MANIFEST_URL = '/versions/manifest.json';
const LS_ACTIVE = 'lithium:active-version';
const LS_INSTALLED = 'lithium:installed-versions';
const VERSION_PREFIX = 'lithium-ver-';

// ── State ──────────────────────────────────────────────────────────────────
let _manifest = null;
let _activeVersion = null;
let _installedVersions = [];
let _installProgress = {}; // version → { loaded, total }
const _listeners = new Set();

function notify() {
  for (const fn of _listeners) fn(getState());
}

export function getState() {
  return {
    manifest: _manifest,
    activeVersion: _activeVersion,
    installedVersions: [..._installedVersions],
    installProgress: { ..._installProgress },
  };
}

export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getSW() {
  return navigator.serviceWorker?.controller;
}

function sendSW(msg) {
  const sw = getSW();
  if (sw) sw.postMessage(msg);
}

function loadInstalled() {
  try {
    return JSON.parse(storage.get(LS_INSTALLED, '[]'));
  } catch {
    return [];
  }
}

function saveInstalled(list) {
  storage.set(LS_INSTALLED, JSON.stringify(list));
  _installedVersions = list;
}

// ── SW message handler ─────────────────────────────────────────────────────

function onSWMessage(event) {
  const { data } = event;
  if (!data?.type) return;

  switch (data.type) {
    case 'cache-progress':
      _installProgress[data.version] = { loaded: data.loaded, total: data.total };
      notify();
      break;

    case 'cache-complete':
      delete _installProgress[data.version];
      if (!_installedVersions.includes(data.version)) {
        saveInstalled([..._installedVersions, data.version]);
      }
      notify();
      break;

    case 'version-switched':
      storage.set(LS_ACTIVE, data.version);
      _activeVersion = data.version;
      notify();
      // Reload to activate the version.
      window.location.reload();
      break;

    case 'version-deleted':
      saveInstalled(_installedVersions.filter(v => v !== data.version));
      notify();
      break;

    case 'factory-reset-done':
      storage.remove(LS_ACTIVE);
      saveInstalled([]);
      _activeVersion = null;
      notify();
      window.location.reload();
      break;

    case 'active-version':
      _activeVersion = data.version;
      if (data.version) storage.set(LS_ACTIVE, data.version);
      notify();
      break;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Fetch the version manifest from the server. */
export async function fetchManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest fetch failed');
    _manifest = await res.json();
    notify();
    return _manifest;
  } catch {
    return null;
  }
}

/** Install (download + cache) a specific version. Reports progress via state. */
export async function installVersion(version) {
  if (!_manifest) await fetchManifest();
  const entry = _manifest?.versions?.find(v => v.version === version);
  if (!entry) return false;

  // Fetch the version's own version.json to get the asset list.
  try {
    const metaRes = await fetch(entry.basePath + 'version.json', { cache: 'no-store' });
    if (!metaRes.ok) throw new Error('version.json fetch failed');
    const meta = await metaRes.json();

    _installProgress[version] = { loaded: 0, total: meta.assets.length };
    notify();

    sendSW({
      type: 'cache-version',
      version,
      basePath: entry.basePath,
      assets: meta.assets,
    });
    return true;
  } catch {
    delete _installProgress[version];
    notify();
    return false;
  }
}

/** Activate a cached version — the SW will serve from it after reload. */
export function activateVersion(version) {
  if (!_installedVersions.includes(version)) return false;
  storage.set(LS_ACTIVE, version);
  sendSW({ type: 'switch-version', version });
  return true;
}

/** Roll back to a previous cached version. Same as activateVersion. */
export function rollback(version) {
  return activateVersion(version);
}

/** Delete a cached version to free storage. */
export function deleteVersion(version) {
  if (version === _activeVersion) return false; // can't delete active
  sendSW({ type: 'delete-version', version });
  return true;
}

/** Factory reset — clear active version and all cached versions. */
export function factoryReset() {
  sendSW({ type: 'factory-reset' });
  return true;
}

/** Get the currently active version (or null if using default). */
export function getActiveVersion() {
  return _activeVersion;
}

/** Check if a version is installed (cached locally). */
export function isInstalled(version) {
  return _installedVersions.includes(version);
}

/** Estimate total download size for a version (from manifest). */
export async function getVersionSize(version) {
  if (!_manifest) await fetchManifest();
  const entry = _manifest?.versions?.find(v => v.version === version);
  if (!entry) return 0;
  try {
    const metaRes = await fetch(entry.basePath + 'version.json');
    if (!metaRes.ok) return 0;
    const meta = await metaRes.json();
    return meta.assets?.length || 0;
  } catch {
    return 0;
  }
}

/** Check Cache Storage for which versions are actually cached. */
export async function refreshInstalledVersions() {
  if (!('caches' in window)) return;
  const names = await caches.keys();
  const installed = names
    .filter(n => n.startsWith(VERSION_PREFIX))
    .map(n => n.slice(VERSION_PREFIX.length));
  saveInstalled(installed);
  notify();
}

// ── Init ───────────────────────────────────────────────────────────────────

let _initialized = false;

export function initVersionManager() {
  if (_initialized) return;
  _initialized = true;

  // Read active version from localStorage.
  _activeVersion = storage.get(LS_ACTIVE, null);
  _installedVersions = loadInstalled();

  // Listen for SW messages.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', onSWMessage);

    // Ask the SW for the active version (in case IDB differs from localStorage).
    // We do this after the SW is ready.
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg?.active) {
        reg.active.postMessage({ type: 'get-active-version' });
      }
    }).catch(() => {});
  }

  // Refresh installed versions from Cache Storage.
  refreshInstalledVersions();

  // Fetch the manifest in the background.
  fetchManifest();
}

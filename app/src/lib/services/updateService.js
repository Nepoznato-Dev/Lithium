/**
 * UpdateService — Lithium OS update detection and notification.
 *
 * Responsibilities:
 *   1. Detect when a new service worker version is available (SW lifecycle)
 *   2. Check the version manifest for newer releases (version manager)
 *   3. Notify the user via the notification system
 *   4. Provide an "apply update" action that reloads the page
 *   5. Track the current build version for display in Settings
 *
 * The heavy lifting of downloading and switching versions is done by
 * the version manager (lib/pwa/versionManager.js). This service focuses
 * on detection and user notification.
 */

import { BUILD_VERSION } from '../settings';
import { getActiveVersion } from '../pwa/versionManager';

const EVENT = 'lithium:update';

function emit(type, detail) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { type, ...detail, ts: Date.now() } }));
}

export function subscribeUpdate(handler) {
  const listener = e => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Return the current build version string. */
export function getVersion() {
  return BUILD_VERSION;
}

/** Check whether an update is waiting (set by the SW lifecycle or version manager). */
let _updateWaiting = false;
export function isUpdateWaiting() {
  return _updateWaiting;
}

/** Apply the waiting update by reloading the page. */
export function applyUpdate() {
  if (!_updateWaiting) return;
  window.location.reload();
}

/** Register the SW update listener.  Called once from main.jsx. */
export function initUpdateService() {
  if (!('serviceWorker' in navigator)) return;

  // Native SW lifecycle — detects when the worker script itself changes.
  navigator.serviceWorker.addEventListener('updatefound', () => {
    const newWorker = navigator.serviceWorker.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        _updateWaiting = true;
        emit('update-waiting', { version: BUILD_VERSION });
      }
    });
  });

  // Version manager — detects when a newer version is available on the server.
  window.addEventListener('lithium:update', (e) => {
    if (e.detail?.type === 'version-available') {
      _updateWaiting = true;
      emit('update-waiting', { version: e.detail.availableVersion });
    }
  });

  // If a version is pinned via the version manager, reflect it.
  const activeVer = getActiveVersion();
  emit('init', { version: activeVer || BUILD_VERSION });
}

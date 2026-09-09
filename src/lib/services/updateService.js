/**
 * UpdateService — Lithium OS service worker versioning and update detection.
 *
 * Responsibilities:
 *   1. Detect when a new service worker version is available
 *   2. Notify the user via the notification system
 *   3. Provide an "apply update" action that reloads the page
 *   4. Track the current build version for display in Settings → About
 *
 * This is a lightweight wrapper around the native SW update lifecycle.
 */

import { BUILD_VERSION } from '../settings';

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

/** Check whether an update is waiting (set by the SW lifecycle). */
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

  emit('init', { version: BUILD_VERSION });
}

/**
 * PWA install prompt — captures the `beforeinstallprompt` event so the
 * install banner can show the browser's native install dialog on demand.
 *
 * Exports:
 *   promptInstall()      – call from a click handler to trigger the dialog
 *   useInstallPrompt()   – Preact/React hook returning the current state
 *   isInstalled()        – true when the app is already running standalone
 */

import { useState, useEffect } from 'react';

let deferredPrompt = null;
let installState = 'idle'; // idle | available | dismissed | installed
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(installState);
}

const DISMISS_KEY = 'lithium:pwa-dismissed';

function isDismissedThisSession() {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

// Capture the browser's beforeinstallprompt event.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Respect a prior dismissal so the banner doesn't nag again this session.
    installState = isDismissedThisSession() ? 'dismissed' : 'available';
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installState = 'installed';
    try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* storage unavailable */ }
    notify();
  });
}

/** Show the native install dialog. Returns true if the prompt was shown. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installState = outcome === 'accepted' ? 'installed' : 'dismissed';
  notify();
  return outcome === 'accepted';
}

/** Hide the install banner for the rest of this session (user tapped the ✕). */
export function dismissInstallPrompt() {
  try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage unavailable */ }
  installState = 'dismissed';
  notify();
}

/** True when the app is running as an installed PWA. */
export function isInstalled() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true
  );
}

/**
 * React/Preact hook — returns the current install state and a
 * `promptInstall` function. Re-renders when the state changes.
 *
 * State values:
 *   'idle'      – not yet determined (or browser doesn't support install)
 *   'available' – the app can be installed, banner should show
 *   'dismissed' – the user declined the prompt
 *   'installed' – the app is running as a PWA
 */
export function useInstallPrompt() {
  const [state, setState] = useState(installState);

  useEffect(() => {
    // Already installed? Skip the listener entirely.
    if (isInstalled()) {
      setState('installed');
      return;
    }
    listeners.add(setState);
    // Sync in case the state changed between render and effect.
    setState(installState);
    return () => { listeners.delete(setState); };
  }, []);

  return { state, promptInstall, dismiss: dismissInstallPrompt };
}

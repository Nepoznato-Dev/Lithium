/**
 * Background Sync manager — registers sync tags with the service worker
 * so Lithium can sync data when the network returns, even if the app
 * is not in the foreground.
 *
 * Two modes:
 *   - One-shot sync  : syncs once when the network is available
 *   - Periodic sync  : syncs at browser-determined intervals (Chrome only)
 */

const SYNC_TAG = 'lithium-sync';
const PERIODIC_TAG = 'lithium-periodic-sync';
const PERIODIC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Register a one-shot sync. The SW fires a 'sync' event when online. */
export async function registerSync(tag = SYNC_TAG) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('sync' in reg) {
      await reg.sync.register(tag);
    }
  } catch {
    // Sync API not available or registration failed — degrade gracefully.
  }
}

/** Register periodic background sync (Chrome-only, requires PWA install). */
export async function registerPeriodicSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      // Permission must be granted via the Notifications permission.
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync',
      });
      if (status?.state === 'granted') {
        await reg.periodicSync.register(PERIODIC_TAG, {
          minInterval: PERIODIC_INTERVAL_MS,
        });
      }
    }
  } catch {
    // Periodic sync not available — one-shot sync still works.
  }
}

/**
 * Initialize background sync. Called once at app startup.
 * Registers periodic sync if available, and queues a one-shot sync
 * if the local-file-sync auto-sync toggle is on.
 */
export async function initBackgroundSync() {
  if (!('serviceWorker' in navigator)) return;

  // Always try periodic sync (no-op if unsupported).
  await registerPeriodicSync();

  // If auto-sync is enabled, queue a one-shot sync so data flows
  // even if the user just came back online.
  try {
    const cfg = JSON.parse(localStorage.getItem('lithium:local-sync') || '{}');
    if (cfg.autoSync && cfg.bound) {
      await registerSync(SYNC_TAG);
    }
  } catch {
    // Config parse failure — skip auto-sync registration.
  }
}

/**
 * Queue a sync when settings change (if auto-sync is on).
 * Call this from the settings update path.
 */
export function queueSyncOnSettingChange() {
  try {
    const cfg = JSON.parse(localStorage.getItem('lithium:local-sync') || '{}');
    if (cfg.autoSync && cfg.bound) {
      registerSync(SYNC_TAG);
    }
  } catch {
    // Ignore — sync will happen on next page load.
  }
}

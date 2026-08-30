/* Lithium service worker — whole-site offline cache.
 *
 * Everything the site needs to run (app shell, JS/CSS assets, wasm, icons,
 * manifests) is cached so Lithium works fully offline. Games are deliberately
 * NOT saved — /html-games/ is excluded, and the legacy game cache + its
 * IndexedDB ledger are purged on activation.
 *
 * Strategy:
 *  - navigations : network-first, falling back to the cached shell
 *  - assets      : cache-first with a background refresh (stale-while-revalidate)
 */

const CACHE = 'lithium-site-v2';
const LEGACY_GAMES = 'lithium-games-v1';
const DB_NAME = 'lithium-storage';

function purgeLegacyLedger() {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('cacheLedger')) db.createObjectStore('cacheLedger');
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('cacheLedger', 'readwrite');
        tx.objectStore('cacheLedger').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Drop the old game cache and its ledger — games are no longer saved.
      await self.caches.delete(LEGACY_GAMES).catch(() => {});
      // Drop every stale site cache so a version bump always lands fresh assets.
      for (const key of await self.caches.keys()) {
        if (key !== CACHE) await self.caches.delete(key).catch(() => {});
      }
      await purgeLegacyLedger();
      // Prune any stale entries from the site cache.
      try {
        const cache = await self.caches.open(CACHE);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (url.pathname.startsWith('/html-games/')) await cache.delete(request);
        }
      } catch { /* best effort */ }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Games are never saved — they stream straight from /html-games/.
  if (url.pathname.startsWith('/html-games/')) return;

  // Navigations: network-first so updates land immediately, cache when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await self.caches.open(CACHE);
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return (await cache.match(event.request)) || (await cache.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  // Assets: cache-first with a background refresh.
  event.respondWith(
    (async () => {
      const cache = await self.caches.open(CACHE);
      const hit = await cache.match(event.request);
      const refresh = fetch(event.request)
        .then(response => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => null);
      if (hit) return hit;
      return (await refresh) || Response.error();
    })()
  );
});

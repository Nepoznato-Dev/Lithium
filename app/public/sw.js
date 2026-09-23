/* Lithium service worker — whole-site offline cache + version management.
 *
 * Everything the site needs to run (app shell, JS/CSS assets, wasm, icons,
 * manifests) is cached so Lithium works fully offline. Games are deliberately
 * NOT saved — /html-games/ is excluded, and the legacy game cache + its
 * IndexedDB ledger are purged on activation.
 *
 * Strategy (default — no version override):
 *  - navigations : network-first, falling back to the cached shell
 *  - assets      : cache-first with a background refresh (stale-while-revalidate)
 *  - dev pipeline + the worker script itself always bypass the cache
 *
 * Strategy (version active):
 *  - all requests: cache-first from the version-specific cache (pre-cached)
 *  - the version cache is a complete snapshot, so no background refresh needed
 */

// v3: v2 holds dev-server modules captured before the optimizer-hash guard,
// which replay stale /node_modules/.vite/deps URLs. Activation drops it.
const CACHE = 'lithium-site-v3';
const LEGACY_GAMES = 'lithium-games-v1';
const DB_NAME = 'lithium-storage';
const VERSION_CACHE_PREFIX = 'lithium-ver-';

/* ── Active-version tracking via IndexedDB ────────────────────────────
 * The client writes the chosen version to localStorage, but service workers
 * cannot access localStorage.  We mirror the value in a tiny IndexedDB
 * object store ('versionConfig') so the fetch handler can decide which
 * cache to serve from.  The client calls `setActiveVersion()` below via
 * postMessage, which writes to both IDB and (for the client's own use)
 * localStorage. */

function openVersionDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lithium-sw-config', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getActiveVersion() {
  try {
    const db = await openVersionDb();
    return new Promise((resolve) => {
      const tx = db.transaction('config', 'readonly');
      const req = tx.objectStore('config').get('activeVersion');
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

async function setActiveVersionInDb(version) {
  const db = await openVersionDb();
  return new Promise((resolve) => {
    const tx = db.transaction('config', 'readwrite');
    if (version) {
      tx.objectStore('config').put(version, 'activeVersion');
    } else {
      tx.objectStore('config').delete('activeVersion');
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

/** Paths that must never be served from or written to the offline cache.
 *  Vite inlines optimize-dep hashes into transformed modules, so a cached
 *  /src or /node_modules copy goes stale on the next re-bundle and the page
 *  gets 504 "Outdated Optimize Dep" / failed dynamic imports. Caching sw.js
 *  would equally freeze the worker, because the browser byte-compares the
 *  response it gets to detect a new version. Built sites serve hashed files
 *  under /assets/ and never match these patterns. */
function shouldBypass(pathname) {
  return (
    pathname.endsWith('/sw.js') ||
    pathname.includes('/src/') ||
    pathname.includes('/node_modules/') ||
    pathname.includes('/.vite/') ||
    /\/@[^/]+\//.test(pathname) // /@vite/, /@fs/, /@id/, /@react-refresh/
  );
}

function purgeLegacyLedger() {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 2);
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
      // Drop stale site caches, but preserve version caches (lithium-ver-*).
      for (const key of await self.caches.keys()) {
        if (key === CACHE) continue;
        if (key.startsWith(VERSION_CACHE_PREFIX)) continue;
        await self.caches.delete(key).catch(() => {});
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
  // Dev-server traffic and the worker script are never cached.
  if (shouldBypass(url.pathname)) return;
  // Games are never saved — they stream straight from /html-games/.
  if (url.pathname.startsWith('/html-games/')) return;
  // Version manifest and version directories are never cached by the default SW cache.
  if (url.pathname.startsWith('/versions/')) return;

  event.respondWith(
    (async () => {
      // Check whether a specific version is active.
      const activeVer = await getActiveVersion();

      if (activeVer) {
        // Version-active mode: serve everything from the version cache.
        const verCacheName = VERSION_CACHE_PREFIX + activeVer;
        const verCache = await self.caches.open(verCacheName);
        const hit = await verCache.match(event.request);
        if (hit) return hit;
        // Fall through to network if the asset isn't in the version cache
        // (e.g. a lazy-loaded chunk the version didn't pre-cache).
        try {
          const response = await fetch(event.request);
          if (response.ok) verCache.put(event.request, response.clone());
          return response;
        } catch {
          // Offline and not in version cache — try the default cache as last resort.
          const defCache = await self.caches.open(CACHE);
          return (await defCache.match(event.request)) || Response.error();
        }
      }

      // Default mode (no version override): original strategies.
      // Navigations: network-first so updates land immediately, cache when offline.
      if (event.request.mode === 'navigate') {
        const cache = await self.caches.open(CACHE);
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return (
            (await cache.match(event.request)) ||
            (await cache.match(self.registration.scope)) ||
            Response.error()
          );
        }
      }

      // Assets: cache-first with a background refresh.
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

/* ── Version Management ───────────────────────────────────────────────
 * The client sends postMessage commands to install, switch, or delete
 * cached versions.  Progress is reported back via postMessage.
 *
 * Commands:
 *   { type: 'cache-version', version, basePath, assets[] }
 *     → downloads every asset and stores in lithium-ver-{version}
 *     → replies with { type: 'cache-progress', version, loaded, total }
 *     → replies with { type: 'cache-complete', version } on success
 *
 *   { type: 'switch-version', version }
 *     → writes the version to IDB so fetch handler uses it
 *     → replies with { type: 'version-switched', version }
 *
 *   { type: 'delete-version', version }
 *     → removes the version cache
 *
 *   { type: 'factory-reset' }
 *     → clears active version + all version caches
 *
 *   { type: 'get-active-version' }
 *     → replies with { type: 'active-version', version }
 */
self.addEventListener('message', event => {
  const { data } = event;
  if (!data || !data.type) return;
  const source = event.source;

  switch (data.type) {
    case 'cache-version': {
      const { version, basePath, assets } = data;
      const cacheName = VERSION_CACHE_PREFIX + version;
      event.waitUntil(
        (async () => {
          const cache = await self.caches.open(cacheName);
          const total = assets.length;
          let loaded = 0;
          for (const assetPath of assets) {
            const url = basePath + assetPath;
            try {
              const response = await fetch(url);
              if (response.ok) {
                await cache.put(new Request(url), response);
              }
            } catch { /* skip failed assets */ }
            loaded++;
            // Report progress every 5 assets or at the end.
            if (loaded % 5 === 0 || loaded === total) {
              source.postMessage({ type: 'cache-progress', version, loaded, total });
            }
          }
          source.postMessage({ type: 'cache-complete', version });
        })()
      );
      break;
    }

    case 'switch-version': {
      const { version } = data;
      event.waitUntil(
        (async () => {
          await setActiveVersionInDb(version);
          source.postMessage({ type: 'version-switched', version });
        })()
      );
      break;
    }

    case 'delete-version': {
      const { version } = data;
      event.waitUntil(
        self.caches.delete(VERSION_CACHE_PREFIX + version).then(() => {
          source.postMessage({ type: 'version-deleted', version });
        })
      );
      break;
    }

    case 'factory-reset': {
      event.waitUntil(
        (async () => {
          await setActiveVersionInDb(null);
          const keys = await self.caches.keys();
          for (const key of keys) {
            if (key.startsWith(VERSION_CACHE_PREFIX)) {
              await self.caches.delete(key);
            }
          }
          source.postMessage({ type: 'factory-reset-done' });
        })()
      );
      break;
    }

    case 'get-active-version': {
      getActiveVersion().then(version => {
        source.postMessage({ type: 'active-version', version });
      });
      break;
    }
  }
});

/* ─ Background Sync ──────────────────────────────────────────────────
 * When the network returns, the SW fires a 'sync' event. We wake up all
 * controlled clients so they can run their sync logic (local FS sync,
 * data refresh, etc.).
 */
self.addEventListener('sync', event => {
  if (event.tag === 'lithium-sync' || event.tag === 'lithium-periodic-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        for (const client of clients) {
          client.postMessage({ type: 'lithium:background-sync', tag: event.tag });
        }
      })
    );
  }
});

/* ── Periodic Background Sync ─────────────────────────────────────────
 * Chrome-only: fires at browser-determined intervals when the PWA is
 * installed and periodic-sync permission is granted.
 */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'lithium-periodic-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        for (const client of clients) {
          client.postMessage({ type: 'lithium:periodic-sync', tag: event.tag });
        }
      })
    );
  }
});

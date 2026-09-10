/**
 * .li App Runtime
 *
 * Manages the full lifecycle of .li applications running inside
 * Shadow DOM hosts.  Each app gets a Shadow DOM container with an
 * <iframe srcdoc> that provides both style isolation (shadow boundary)
 * and execution isolation (iframe sandbox).
 *
 * Communication between the app and the desktop uses a postMessage
 * bridge — the host listens for typed messages and dispatches them
 * to Lithium's native services (storage, notifications, settings,
 * theme, device info, clipboard, network, capabilities, permissions,
 * filesystem, lifecycle).
 *
 * The host can also push events to apps via the `li:event` message
 * type for reactive subscriptions (theme changes, network status,
 * lifecycle focus/blur, etc.).
 */

import { LI_BRIDGE_CLIENT } from './liBridgeClient';
import { storage } from '../storage';
import { notify, dismissNotification, clearHistory, getHistory } from '../desktop/notify';
import { loadSettings, saveSettings, applySettings, BUILD_VERSION } from '../settings';
import { loadTree, saveTree, createEntry, storeEntryContent, getEntry, childrenOf, pathOf, readEntryContent, removeEntryDeep, moveEntry, duplicateSubtreeDeep, canMoveInto } from '../fileSystem';
import { discoverAppsFromLauncher } from './liLauncher';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Permission → message-type map.  If a type appears here the app
 *  must hold the listed permission to use it.  Types absent from
 *  this map are allowed without any permission check. */
const PERMISSION_MAP = {
  'li:clipboard-read':   'clipboard',
  'li:clipboard-write':  'clipboard',
  'li:network-fetch':    'network',
  'li:files-read':       'filesystem',
  'li:files-write':      'filesystem',
  'li:files-delete':     'filesystem',
  'li:files-mkdir':      'filesystem',
  'li:files-copy':       'filesystem',
  'li:files-move':       'filesystem',
  'li:files-pick':       'filesystem',
  'li:files-save':       'filesystem',
  'li:apps-open':        'apps',
  'li:apps-close':       'apps',
  'li:apps-send':        'apps',
  'li:apps-broadcast':   'apps',
};

/** API version exposed to .li apps via li.platform.getAPIVersion(). */
const LI_API_VERSION = 2;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function hasPermission(manifest, type) {
  const required = PERMISSION_MAP[type];
  if (!required) return true;
  const granted = manifest._launcherPermissions || manifest.permissions || [];
  return granted.includes(required);
}

/** Fetch with automatic retries — makes first-load resilient
 *  when the dev server is still warming up or the network is slow. */
async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (attempt === retries) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
    }
    await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
  }
}

/** Build the full srcdoc string for the iframe.
 *  For dynamic apps the HTML is stored inline (_storedHtml); for
 *  static apps it is fetched from the app's entry URL. */
async function buildSrcdoc(manifest) {
  let html;

  if (manifest._storedHtml) {
    html = manifest._storedHtml;
  } else {
    const res = await fetchWithRetry(manifest._entryUrl);
    html = await res.text();
  }

  // Inject a <base> so relative URLs in the app resolve to its own directory.
  const appDir = manifest._appDir || '/li-apps/' + manifest.id;
  const baseTag = `<base href="${appDir}/">`;
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${baseTag}`);
  } else {
    html = `${baseTag}\n${html}`;
  }

  // Inject the bridge client script before </body>.
  const bridgeScript = `<script>${LI_BRIDGE_CLIENT}</script>`;
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${bridgeScript}\n</body>`);
  } else {
    html += `\n${bridgeScript}`;
  }

  return html;
}

/** Resolve a virtual path (e.g. '/Documents/Notes/test.txt') to an entry.
 *  Returns null if the path doesn't resolve. */
function resolvePath(path) {
  if (!path || typeof path !== 'string') return null;
  const segments = path.split('/').filter(Boolean);
  if (!segments.length) return null;
  const tree = loadTree();
  let currentId = 'root';
  let entry = null;
  for (const seg of segments) {
    const kids = childrenOf(tree, currentId);
    entry = kids.find(k => k.name === seg) || null;
    if (!entry) return null;
    currentId = entry.id;
  }
  return entry;
}

/** Resolve a path and return its parent folder id. */
function resolveParentPath(path) {
  if (!path || typeof path !== 'string') return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return 'root';
  segments.pop();
  return resolvePath('/' + segments.join('/'))?.id || null;
}

/* ------------------------------------------------------------------ */
/*  Event push infrastructure                                           */
/* ------------------------------------------------------------------ */

/** Per-app event subscriptions: Map<container, Map<eventName, cleanupFn>> */
const appSubscriptions = new WeakMap();

/** System-level event listeners (set up once, broadcast to all apps). */
let systemListenersReady = false;

function setupSystemEventListeners() {
  if (systemListenersReady) return;
  systemListenersReady = true;

  // Theme changes — push to all apps that subscribed to 'theme.changed'.
  window.addEventListener('storage', (e) => {
    if (e.key === 'settings') {
      const s = loadSettings();
      broadcastEvent('theme.changed', {
        mode: s.theme?.mode || 'dark',
        accent: s.theme?.accent || '#22d3ee',
      });
    }
  });

  // Network online/offline — push to all apps that subscribed.
  window.addEventListener('online', () => broadcastEvent('network.changed', { online: true }));
  window.addEventListener('offline', () => broadcastEvent('network.changed', { online: false }));

  // Filesystem mutations — push to subscribers.
  window.addEventListener('lithium:fs-changed', () => broadcastEvent('file.changed', {}));
}

/** Send a named event to a specific mounted app. */
function sendEventToApp(container, eventName, data) {
  const entry = mounted.get(container);
  if (!entry) return;
  entry.iframe.contentWindow.postMessage(
    { source: 'li-host', type: 'li:event', event: eventName, data: data || {} },
    '*',
  );
}

/** Broadcast a named event to every mounted app. */
function broadcastEvent(eventName, data) {
  for (const [container, entry] of mounted.entries()) {
    sendEventToApp(container, eventName, data);
  }
}

/* ------------------------------------------------------------------ */
/*  Message handler factory                                             */
/* ------------------------------------------------------------------ */

function createMessageHandler(manifest, iframeEl, onTitleChange) {
  const appPrefix = `li-app-${manifest.id}:`;

  return async function handleMessage(event) {
    const d = event.data;
    if (!d || d.source !== 'li-app') return;
    if (event.source !== iframeEl.contentWindow) return;

    const id = d.id;
    const type = d.type;
    const payload = d.payload || {};

    function respond(result) {
      iframeEl.contentWindow.postMessage(
        { source: 'li-host', type: 'li:response', id, result }, '*',
      );
    }
    function respondError(msg) {
      iframeEl.contentWindow.postMessage(
        { source: 'li-host', type: 'li:response', id, error: msg }, '*',
      );
    }

    // Permission gate.
    if (!hasPermission(manifest, type)) {
      respondError(`Permission denied: ${type}`);
      return;
    }

    try {
      switch (type) {

        /* ---- Storage (expanded) ---- */
        case 'li:storage-get':
          respond(storage.get(appPrefix + payload.key));
          break;
        case 'li:storage-set':
          storage.set(appPrefix + payload.key, payload.value);
          respond(undefined);
          break;
        case 'li:storage-remove':
          storage.set(appPrefix + payload.key, undefined);
          respond(undefined);
          break;
        case 'li:storage-has':
          respond(storage.get(appPrefix + payload.key) !== undefined);
          break;
        case 'li:storage-clear': {
          const all = storage.getAll();
          for (const k of Object.keys(all)) {
            if (k.startsWith(appPrefix)) storage.set(k, undefined);
          }
          respond(undefined);
          break;
        }
        case 'li:storage-keys': {
          const allKeys = storage.getAll();
          respond(Object.keys(allKeys).filter(k => k.startsWith(appPrefix)).map(k => k.slice(appPrefix.length)));
          break;
        }
        case 'li:storage-size': {
          const allK = storage.getAll();
          respond(Object.keys(allK).filter(k => k.startsWith(appPrefix)).length);
          break;
        }
        case 'li:storage-get-all': {
          const allData = storage.getAll();
          const result = {};
          for (const [k, v] of Object.entries(allData)) {
            if (k.startsWith(appPrefix)) result[k.slice(appPrefix.length)] = v;
          }
          respond(result);
          break;
        }
        case 'li:storage-set-all': {
          const vals = payload.values || {};
          for (const [k, v] of Object.entries(vals)) {
            storage.set(appPrefix + k, v);
          }
          respond(undefined);
          break;
        }

        /* ---- App information ---- */
        case 'li:app-info':
          respond({ id: manifest.id, name: manifest.name, version: manifest.version });
          break;
        case 'li:app-id':
          respond(manifest.id);
          break;
        case 'li:app-name':
          respond(manifest.name);
          break;
        case 'li:app-version':
          respond(manifest.version);
          break;
        case 'li:app-manifest':
          respond({ id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description, icon: manifest.icon, color: manifest.color, category: manifest.category });
          break;
        case 'li:app-set-title':
          if (typeof payload.title === 'string' && onTitleChange) onTitleChange(payload.title);
          respond(undefined);
          break;
        case 'li:app-set-icon':
          respond(undefined);
          break;
        case 'li:app-set-badge':
          respond(undefined);
          break;
        case 'li:app-clear-badge':
          respond(undefined);
          break;

        /* ---- Lifecycle ---- */
        case 'li:lifecycle-close':
          window.dispatchEvent(new CustomEvent('lithium:li-close-app', { detail: { appId: manifest.id } }));
          respond(undefined);
          break;
        case 'li:lifecycle-reload': {
          const cur = iframeEl.srcdoc;
          iframeEl.srcdoc = '';
          iframeEl.srcdoc = cur;
          respond(undefined);
          break;
        }

        /* ---- Theme ---- */
        case 'li:theme-get': {
          const s = loadSettings();
          const cs = typeof getComputedStyle !== 'undefined' ? getComputedStyle(document.documentElement) : null;
          respond({
            mode: s.theme?.mode || 'dark',
            accent: s.theme?.accent || '#22d3ee',
            colors: {
              background: cs?.getPropertyValue('--glass-bg')?.trim() || '#0f1117',
              foreground: cs?.getPropertyValue('--text-primary')?.trim() || '#fff',
              accent: s.theme?.accent || '#22d3ee',
            },
          });
          break;
        }
        case 'li:theme-set': {
          const t = payload.theme || {};
          const cur = loadSettings();
          if (t.accent) cur.theme.accent = t.accent;
          if (t.mode) cur.theme.mode = t.mode;
          saveSettings(cur);
          applySettings(cur);
          broadcastEvent('theme.changed', { mode: cur.theme.mode, accent: cur.theme.accent });
          respond(undefined);
          break;
        }
        case 'li:theme-get-mode':
          respond(loadSettings().theme?.mode || 'dark');
          break;
        case 'li:theme-set-mode': {
          const cur = loadSettings();
          cur.theme.mode = payload.mode || 'dark';
          saveSettings(cur);
          applySettings(cur);
          broadcastEvent('theme.changed', { mode: cur.theme.mode, accent: cur.theme.accent });
          respond(undefined);
          break;
        }
        case 'li:theme-get-colors': {
          const cs = getComputedStyle(document.documentElement);
          respond({
            background: cs.getPropertyValue('--glass-bg')?.trim() || '#0f1117',
            foreground: cs.getPropertyValue('--text-primary')?.trim() || '#fff',
            accent: cs.getPropertyValue('--accent')?.trim() || '#22d3ee',
          });
          break;
        }

        /* ---- Device ---- */
        case 'li:device-info': {
          const ua = navigator.userAgent || '';
          let os = 'Unknown';
          if (/Windows/i.test(ua)) os = 'Windows';
          else if (/Mac OS X/i.test(ua)) os = 'macOS';
          else if (/Linux/i.test(ua)) os = 'Linux';
          else if (/Android/i.test(ua)) os = 'Android';
          else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
          const isMobile = /Mobi|Android/i.test(ua);
          respond({ platform: 'li', os, type: isMobile ? 'mobile' : 'desktop' });
          break;
        }
        case 'li:device-battery':
          if ('getBattery' in navigator) {
            const b = await navigator.getBattery();
            respond({ level: Math.round(b.level * 100), charging: b.charging });
          } else {
            respond({ level: 100, charging: true });
          }
          break;
        case 'li:device-network':
          respond({ online: navigator.onLine, type: navigator.connection?.effectiveType || 'unknown' });
          break;
        case 'li:device-screen':
          respond({ width: screen.width, height: screen.height, dpr: window.devicePixelRatio || 1 });
          break;
        case 'li:device-locale':
          respond(navigator.language || 'en-US');
          break;
        case 'li:device-timezone':
          respond(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
          break;
        case 'li:device-platform':
          respond(navigator.platform || 'unknown');
          break;
        case 'li:device-is-mobile':
          respond(/Mobi|Android/i.test(navigator.userAgent || ''));
          break;
        case 'li:device-is-desktop':
          respond(!/Mobi|Android/i.test(navigator.userAgent || ''));
          break;

        /* ---- Platform ---- */
        case 'li:platform-info':
          respond({ name: 'Lithium', version: BUILD_VERSION, apiVersion: LI_API_VERSION, environment: 'desktop' });
          break;
        case 'li:platform-version':
          respond(BUILD_VERSION);
          break;
        case 'li:platform-api-version':
          respond(LI_API_VERSION);
          break;

        /* ---- Clipboard ---- */
        case 'li:clipboard-read':
          try { respond(await navigator.clipboard.readText()); }
          catch { respond(''); }
          break;
        case 'li:clipboard-write':
          try { await navigator.clipboard.writeText(payload.text || ''); }
          catch { /* clipboard unavailable */ }
          respond(undefined);
          break;

        /* ---- UI Dialogs ---- */
        case 'li:ui-alert':
          iframeEl.contentWindow.alert(payload.message || payload.title || '');
          respond({ action: 'ok' });
          break;
        case 'li:ui-confirm': {
          const ok = iframeEl.contentWindow.confirm(payload.message || '');
          respond({ action: ok ? 'confirm' : 'cancel' });
          break;
        }
        case 'li:ui-prompt': {
          const val = iframeEl.contentWindow.prompt(payload.message || '', payload.defaultValue || '');
          respond({ value: val, action: val !== null ? 'confirm' : 'cancel' });
          break;
        }
        case 'li:ui-toast':
          notify({ title: payload.message || '', tone: 'info' });
          respond(undefined);
          break;

        /* ---- Network ---- */
        case 'li:network-fetch': {
          const url = payload.url;
          if (!url) { respondError('Missing url'); break; }
          const opts = payload.options || {};
          const method = (opts.method || 'GET').toUpperCase();
          let proxyUrl = '/api/web/proxy?url=' + encodeURIComponent(url);
          if (method !== 'GET') {
            proxyUrl = '/api/web/proxy?url=' + encodeURIComponent(url);
          }
          try {
            const res = await fetch(proxyUrl, {
              method,
              headers: opts.headers,
              body: opts.body,
            });
            const ct = res.headers.get('content-type') || '';
            let body;
            if (ct.includes('json')) body = await res.text();
            else body = await res.text();
            const hdrs = {};
            res.headers.forEach((v, k) => { hdrs[k] = v; });
            respond({ status: res.status, headers: hdrs, body });
          } catch (err) {
            respondError(err.message || 'Fetch failed');
          }
          break;
        }
        case 'li:network-online':
          respond(navigator.onLine);
          break;
        case 'li:network-status':
          respond(navigator.onLine ? 'online' : 'offline');
          break;

        /* ---- Capabilities ---- */
        case 'li:capabilities-get': {
          const perms = manifest._launcherPermissions || manifest.permissions || [];
          respond({
            notifications: true,
            clipboard: perms.includes('clipboard'),
            filesystem: perms.includes('filesystem'),
            network: perms.includes('network'),
            apps: perms.includes('apps'),
            sharing: typeof navigator.share === 'function',
            camera: false,
            microphone: false,
          });
          break;
        }
        case 'li:capabilities-has': {
          const perms = manifest._launcherPermissions || manifest.permissions || [];
          const caps = {
            notifications: true,
            clipboard: perms.includes('clipboard'),
            filesystem: perms.includes('filesystem'),
            network: perms.includes('network'),
            apps: perms.includes('apps'),
            sharing: typeof navigator.share === 'function',
          };
          respond(Boolean(caps[payload.name]));
          break;
        }

        /* ---- Permissions ---- */
        case 'li:permissions-get': {
          const perms = manifest._launcherPermissions || manifest.permissions || [];
          respond(perms.includes(payload.name) ? 'granted' : 'denied');
          break;
        }
        case 'li:permissions-request': {
          const perms = manifest._launcherPermissions || manifest.permissions || [];
          if (perms.includes(payload.name)) {
            respond('granted');
          } else {
            respond('denied');
          }
          break;
        }
        case 'li:permissions-get-all': {
          const perms = manifest._launcherPermissions || manifest.permissions || [];
          const all = ['storage', 'notifications', 'photos', 'clipboard', 'network', 'filesystem', 'apps'];
          const result = {};
          for (const p of all) result[p] = perms.includes(p) ? 'granted' : 'denied';
          respond(result);
          break;
        }

        /* ---- Notifications (extended) ---- */
        case 'li:notify-send':
          notify({ title: payload.title || '', body: payload.body || '' });
          respond(undefined);
          break;
        case 'li:notify-cancel':
          dismissNotification(payload.id);
          respond(undefined);
          break;
        case 'li:notify-cancel-all':
          clearHistory();
          respond(undefined);
          break;
        case 'li:notify-get-all':
          respond(getHistory());
          break;

        /* ---- Backward-compatible handlers ---- */
        case 'li:notify':
          notify({ title: payload.title, body: payload.body });
          respond(undefined);
          break;
        case 'li:get-settings':
          respond(loadSettings());
          break;
        case 'li:set-title':
          if (typeof payload.title === 'string' && onTitleChange) onTitleChange(payload.title);
          respond(undefined);
          break;
        case 'li:save-photo': {
          const { filename, dataUrl } = payload;
          if (!filename || !dataUrl) { respondError('Missing filename or dataUrl'); break; }
          const PICTURES_ID = 'default-pictures';
          let tree = loadTree();
          const arr = createEntry(tree, { name: filename, type: 'image', parentId: PICTURES_ID, content: '' });
          const newEntry = arr[arr.length - 1];
          const stored = await storeEntryContent(newEntry, dataUrl);
          tree = [...arr.slice(0, -1), stored];
          saveTree(tree);
          respond({ id: stored.id, name: stored.name });
          break;
        }

        /* ---- Filesystem ---- */
        case 'li:files-read': {
          const entry = resolvePath(payload.path);
          if (!entry) { respondError('File not found'); break; }
          const content = await readEntryContent(entry);
          respond({ name: entry.name, type: entry.type, content });
          break;
        }
        case 'li:files-write': {
          const { path: fpath, data, type: ftype } = payload;
          if (!fpath) { respondError('Missing path'); break; }
          const parentId = resolveParentPath(fpath);
          if (!parentId) { respondError('Parent folder not found'); break; }
          const fname = fpath.split('/').filter(Boolean).pop();
          let tree = loadTree();
          const arr = createEntry(tree, { name: fname, type: ftype || 'file', parentId, content: '' });
          const newEntry = arr[arr.length - 1];
          const stored = await storeEntryContent(newEntry, data || '');
          tree = [...arr.slice(0, -1), stored];
          saveTree(tree);
          respond({ id: stored.id, name: stored.name });
          break;
        }
        case 'li:files-exists': {
          respond(resolvePath(payload.path) !== null);
          break;
        }
        case 'li:files-stat': {
          const entry = resolvePath(payload.path);
          if (!entry) { respondError('Not found'); break; }
          respond({ name: entry.name, type: entry.type, size: entry.size || 0, created: entry.createdAt, modified: entry.updatedAt });
          break;
        }
        case 'li:files-list': {
          const folder = resolvePath(payload.path);
          if (!folder) { respondError('Folder not found'); break; }
          const tree = loadTree();
          const kids = childrenOf(tree, folder.id);
          respond(kids.map(k => ({ name: k.name, type: k.type, size: k.size || 0, id: k.id })));
          break;
        }
        case 'li:files-delete': {
          const entry = resolvePath(payload.path);
          if (!entry) { respondError('Not found'); break; }
          let tree = loadTree();
          tree = await removeEntryDeep(tree, entry.id);
          saveTree(tree);
          respond(undefined);
          break;
        }
        case 'li:files-mkdir': {
          const { path: dpath } = payload;
          if (!dpath) { respondError('Missing path'); break; }
          const parentId = resolveParentPath(dpath);
          if (!parentId) { respondError('Parent not found'); break; }
          const dname = dpath.split('/').filter(Boolean).pop();
          let tree = loadTree();
          const arr = createEntry(tree, { name: dname, type: 'folder', parentId, content: '' });
          tree = arr;
          saveTree(tree);
          const created = arr[arr.length - 1];
          respond({ id: created.id, name: created.name });
          break;
        }
        case 'li:files-copy': {
          const src = resolvePath(payload.source);
          if (!src) { respondError('Source not found'); break; }
          const destParent = resolvePath(payload.destination);
          if (!destParent || destParent.type !== 'folder') { respondError('Destination folder not found'); break; }
          let tree = loadTree();
          const result = await duplicateSubtreeDeep(tree, src.id, destParent.id);
          saveTree(result);
          const copied = result[result.length - 1];
          respond({ id: copied?.id, name: copied?.name });
          break;
        }
        case 'li:files-move': {
          const src = resolvePath(payload.source);
          if (!src) { respondError('Source not found'); break; }
          const destFolder = resolvePath(payload.destination);
          if (!destFolder || destFolder.type !== 'folder') { respondError('Destination not found'); break; }
          if (!canMoveInto(loadTree(), src.id, destFolder.id)) { respondError('Cannot move into target'); break; }
          let tree = loadTree();
          tree = moveEntry(tree, src.id, destFolder.id);
          saveTree(tree);
          respond(undefined);
          break;
        }
        case 'li:files-pick':
          respondError('File picker dialog not yet implemented');
          break;
        case 'li:files-save':
          respondError('Save dialog not yet implemented');
          break;

        /* ---- Inter-app communication ---- */
        case 'li:apps-list': {
          const apps = await discoverAppsFromLauncher();
          respond(apps.map(a => ({ id: a.id, name: a.name, version: a.version })));
          break;
        }
        case 'li:apps-get': {
          const apps = await discoverAppsFromLauncher();
          const found = apps.find(a => a.id === payload.appId);
          if (!found) { respondError('App not found'); break; }
          respond({ id: found.id, name: found.name, version: found.version });
          break;
        }
        case 'li:apps-open':
          window.dispatchEvent(new CustomEvent('lithium:li-open-app', { detail: { appId: payload.appId } }));
          respond(undefined);
          break;
        case 'li:apps-close':
          window.dispatchEvent(new CustomEvent('lithium:li-close-app', { detail: { appId: payload.appId } }));
          respond(undefined);
          break;
        case 'li:apps-send': {
          let delivered = false;
          for (const [container, entry] of mounted.entries()) {
            if (entry.manifest.id === payload.appId) {
              sendEventToApp(container, 'app.message', {
                from: manifest.id,
                ...payload.message,
              });
              delivered = true;
            }
          }
          respond({ delivered });
          break;
        }
        case 'li:apps-broadcast': {
          for (const [container, entry] of mounted.entries()) {
            if (entry.manifest.id === manifest.id) continue; // skip sender
            sendEventToApp(container, 'app.message', {
              from: manifest.id,
              ...payload.message,
            });
          }
          respond(undefined);
          break;
        }

        /* ---- Navigation ---- */
        case 'li:navigation-open-url': {
          window.dispatchEvent(new CustomEvent('lithium:li-open-url', { detail: { url: payload.url } }));
          respond(undefined);
          break;
        }
        case 'li:navigation-open-app':
          window.dispatchEvent(new CustomEvent('lithium:li-open-app', { detail: { appId: payload.appId } }));
          respond(undefined);
          break;
        case 'li:navigation-reload':
          window.location.reload();
          respond(undefined);
          break;

        /* ---- Sharing ---- */
        case 'li:share-open': {
          if (typeof navigator.share === 'function') {
            try { await navigator.share(payload); respond({ shared: true }); }
            catch (err) { respond({ shared: false, error: err.message }); }
          } else {
            respondError('Web Share API not available');
          }
          break;
        }
        case 'li:share-can-share':
          respond(typeof navigator.share === 'function');
          break;

        /* ---- Event subscription ---- */
        case 'li:events-subscribe':
          respond(undefined);
          break;

        default:
          respondError(`Unknown message type: ${type}`);
      }
    } catch (err) {
      respondError(err.message || 'Internal error');
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/** WeakMap<container, { iframe, handler, manifest, cleanups }> */
const mounted = new WeakMap();

/**
 * Mount a .li app into the given DOM container.
 *
 * 1. Creates a Shadow DOM on the container.
 * 2. Fetches the app's HTML entry and builds a srcdoc string.
 * 3. Injects the bridge client script into the srcdoc.
 * 4. Creates an <iframe> inside the shadow root with the srcdoc.
 * 5. Starts listening for postMessage bridge requests.
 * 6. Sets up lifecycle event push (focus/blur/visibility).
 */
export async function mountApp(container, manifest, onTitleChange) {
  if (mounted.has(container)) {
    console.warn('[li-runtime] container already mounted — unmount first');
    return;
  }

  // Ensure global system event listeners are active.
  setupSystemEventListeners();

  // 1. Shadow DOM.
  const shadow = container.attachShadow({ mode: 'open' });

  const hostStyle = document.createElement('style');
  hostStyle.textContent = `
    :host { display: block; width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; background: transparent; }
  `;
  shadow.appendChild(hostStyle);

  // 2–3. Build srcdoc.
  let srcdoc;
  try {
    srcdoc = await buildSrcdoc(manifest);
  } catch (err) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'padding:24px;color:#f87171;font-family:system-ui;font-size:14px;';
    errDiv.textContent = `Failed to load ${manifest.name}: ${err.message}`;
    shadow.appendChild(errDiv);
    return;
  }

  // 4. Iframe — allow-clipboard added for li.clipboard API.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-clipboard');
  iframe.srcdoc = srcdoc;
  shadow.appendChild(iframe);

  // 5. Message handler.
  const handler = createMessageHandler(manifest, iframe, onTitleChange);
  window.addEventListener('message', handler);

  // 6. Lifecycle event push — focus/blur/visibility.
  const cleanups = [];

  const onFocus = () => sendEventToApp(container, 'lifecycle.focus', {});
  const onBlur = () => sendEventToApp(container, 'lifecycle.blur', {});
  iframe.addEventListener('focus', onFocus);
  iframe.addEventListener('blur', onBlur);
  cleanups.push(() => {
    iframe.removeEventListener('focus', onFocus);
    iframe.removeEventListener('blur', onBlur);
  });

  // Visibility changes for the iframe's document.
  const onVisChange = () => {
    try {
      const vis = iframe.contentDocument?.visibilityState;
      if (vis) sendEventToApp(container, 'lifecycle.visibility', { state: vis });
    } catch { /* cross-origin — ignore */ }
  };
  document.addEventListener('visibilitychange', onVisChange);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisChange));

  // Signal to the app that the bridge is ready.
  iframe.addEventListener('load', () => {
    iframe.contentWindow.postMessage(
      { source: 'li-host', type: 'li:ready' },
      '*',
    );
  }, { once: true });

  mounted.set(container, { iframe, handler, manifest, cleanups });
}

/**
 * Unmount a previously mounted .li app, cleaning up all resources.
 */
export function unmountApp(container) {
  const entry = mounted.get(container);
  if (!entry) return;
  window.removeEventListener('message', entry.handler);
  // Run per-app cleanup functions.
  if (entry.cleanups) {
    for (const fn of entry.cleanups) {
      try { fn(); } catch { /* ignore */ }
    }
  }
  // Remove shadow children.
  const shadow = container.shadowRoot;
  if (shadow) {
    while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
  }
  mounted.delete(container);
}

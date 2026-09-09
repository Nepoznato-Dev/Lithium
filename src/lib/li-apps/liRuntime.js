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
 * to Lithium's native services (storage, notifications, settings).
 */

import { LI_BRIDGE_CLIENT } from './liBridgeClient';
import { storage } from '../storage';
import { notify } from '../desktop/notify';
import { loadSettings } from '../settings';
import { loadTree, saveTree, createEntry, storeEntryContent } from '../fileSystem';

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/** Permission → message-type map.  If a type appears here the app
 *  must hold the listed permission to use it. */
const PERMISSION_MAP = {
  'li:storage-get':  'storage',
  'li:storage-set':  'storage',
  'li:notify':       'notifications',
  'li:save-photo':   'photos',
};

function hasPermission(manifest, type) {
  const required = PERMISSION_MAP[type];
  if (!required) return true; // no permission needed
  // The launcher's permission list takes priority over the manifest's.
  const granted = manifest._launcherPermissions || manifest.permissions || [];
  return granted.includes(required);
}

/** Build the full srcdoc string for the iframe.
 *  For dynamic apps the HTML is stored inline (_storedHtml); for
 *  static apps it is fetched from the app's entry URL. */
async function buildSrcdoc(manifest) {
  let html;

  if (manifest._storedHtml) {
    // Dynamic app — HTML lives in localStorage.
    html = manifest._storedHtml;
  } else {
    // Static app — fetch from the Vite-served path.
    const res = await fetch(manifest._entryUrl);
    if (!res.ok) throw new Error(`Failed to load .li entry: ${manifest._entryUrl} (${res.status})`);
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

/* ------------------------------------------------------------------ */
/*  Message handler factory                                             */
/* ------------------------------------------------------------------ */

function createMessageHandler(manifest, iframeEl, onTitleChange) {
  return async function handleMessage(event) {
    const d = event.data;
    if (!d || d.source !== 'li-app') return;
    // Only accept messages from our own iframe.
    if (event.source !== iframeEl.contentWindow) return;

    const id = d.id;
    const type = d.type;
    const payload = d.payload || {};

    /** Send a response back to the app. */
    function respond(result) {
      iframeEl.contentWindow.postMessage(
        { source: 'li-host', type: 'li:response', id, result },
        '*',
      );
    }
    function respondError(msg) {
      iframeEl.contentWindow.postMessage(
        { source: 'li-host', type: 'li:response', id, error: msg },
        '*',
      );
    }

    // Permission gate.
    if (!hasPermission(manifest, type)) {
      respondError(`Permission denied: ${type}`);
      return;
    }

    try {
      switch (type) {
        case 'li:storage-get': {
          const val = storage.get(`li-app-${manifest.id}:${payload.key}`);
          respond(val);
          break;
        }
        case 'li:storage-set': {
          storage.set(`li-app-${manifest.id}:${payload.key}`, payload.value);
          respond(undefined);
          break;
        }
        case 'li:notify': {
          notify({ title: payload.title, body: payload.body });
          respond(undefined);
          break;
        }
        case 'li:get-settings': {
          respond(loadSettings());
          break;
        }
        case 'li:get-theme': {
          const s = loadSettings();
          respond({ mode: s.theme?.mode || 'dark', accent: s.theme?.accent || '#22d3ee' });
          break;
        }
        case 'li:set-title': {
          if (typeof payload.title === 'string' && onTitleChange) {
            onTitleChange(payload.title);
          }
          respond(undefined);
          break;
        }
        case 'li:save-photo': {
          // Save a data URL as an image in the user's Photos.
          const { filename, dataUrl } = payload;
          if (!filename || !dataUrl) {
            respondError('Missing filename or dataUrl');
            break;
          }
          const PICTURES_ID = 'default-pictures';
          let tree = loadTree();
          const arr = createEntry(tree, {
            name: filename,
            type: 'image',
            parentId: PICTURES_ID,
            content: '',
          });
          const newEntry = arr[arr.length - 1];
          const stored = await storeEntryContent(newEntry, dataUrl);
          tree = [...arr.slice(0, -1), stored];
          saveTree(tree);
          respond({ id: stored.id, name: stored.name });
          break;
        }
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

/** WeakMap<container, { iframe, handler, manifest }> */
const mounted = new WeakMap();

/**
 * Mount a .li app into the given DOM container.
 *
 * 1. Creates a Shadow DOM on the container.
 * 2. Fetches the app's HTML entry and builds a srcdoc string.
 * 3. Injects the bridge client script into the srcdoc.
 * 4. Creates an <iframe> inside the shadow root with the srcdoc.
 * 5. Starts listening for postMessage bridge requests.
 *
 * @param {HTMLElement} container  Host element (must be in the DOM).
 * @param {object}      manifest   Validated .li manifest descriptor.
 * @param {function}    [onTitleChange]  Called when the app requests a title change.
 */
export async function mountApp(container, manifest, onTitleChange) {
  if (mounted.has(container)) {
    console.warn('[li-runtime] container already mounted — unmount first');
    return;
  }

  // 1. Shadow DOM.
  const shadow = container.attachShadow({ mode: 'open' });

  // Style the host so the iframe fills the entire container.
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

  // 4. Iframe.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
  iframe.srcdoc = srcdoc;
  shadow.appendChild(iframe);

  // 5. Message handler.
  const handler = createMessageHandler(manifest, iframe, onTitleChange);
  window.addEventListener('message', handler);

  // Signal to the app that the bridge is ready (after iframe loads).
  iframe.addEventListener('load', () => {
    iframe.contentWindow.postMessage(
      { source: 'li-host', type: 'li:ready' },
      '*',
    );
  }, { once: true });

  mounted.set(container, { iframe, handler, manifest });
}

/**
 * Unmount a previously mounted .li app, cleaning up all resources.
 */
export function unmountApp(container) {
  const entry = mounted.get(container);
  if (!entry) return;
  window.removeEventListener('message', entry.handler);
  // Remove shadow children.
  const shadow = container.shadowRoot;
  if (shadow) {
    while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
  }
  // Detach shadow (requires re-attach next mount).
  // Note: shadowRoot cannot be detached in all browsers, so we just clear children.
  mounted.delete(container);
}

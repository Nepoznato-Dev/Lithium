/**
 * Extension Security Layer
 *
 * Defines and enforces the strict trust boundaries between three realms:
 *
 *   1. Extensions      — unsandboxed JS running in the host page.
 *   2. .li apps         — sandboxed iframes behind a postMessage bridge.
 *   3. Lithium host     — the desktop core (settings, routing, FS, DOM).
 *
 * Because extensions execute real JS in the page, absolute isolation of raw
 * language features is impossible. This module instead hardens the *API
 * surface* and the *cross-boundary data channel* so that the documented
 * rules hold for anything an extension does through Lithium's interfaces:
 *
 *   RULE A — Extensions may expose APIs that .li apps call, but the call
 *            crosses the boundary as *data only* (no functions, DOM nodes or
 *            iframe references ever travel either direction).
 *   RULE B — Extensions cannot execute code inside a .li app sandbox: the
 *            only thing an app receives from an extension is a serialized,
 *            structured-clone-safe result.
 *   RULE C — Extensions cannot inject themselves into an app's Shadow DOM /
 *            iframe: the host never hands an extension an iframe/window ref,
 *            and the bridge only exposes serializable, granted APIs.
 *   RULE D — Extensions cannot force downloads without user interaction:
 *            they are given no download primitive, and programmatic
 *            download clicks made while an extension handler runs are blocked
 *            unless a genuine user activation is present.
 *   RULE E — Extensions cannot override / intercept Lithium core behavior:
 *            host API namespaces are deep-frozen (anti monkey-patch), the
 *            privileged `lithium:*` / `li:*` event channel is reserved, and
 *            settings writes are confined to the extension's own namespace.
 *   RULE F — Any app → extension call requires an explicit, persisted,
 *            per-app grant the user approves in a popup or the Settings UI.
 *
 * No Lithium module should let an extension bypass these helpers.
 */

import { storage } from '../storage';

/* ================================================================== */
/*  A. Hardening — prevent extensions monkey-patching host APIs        */
/* ================================================================== */

/**
 * Recursively freeze an object so an extension cannot reassign or delete
 * any host-provided method or namespace (RULE E). Non-configurable,
 * non-writable. Functions are left callable but non-own-property-mutable.
 */
export function harden(obj, seen = new WeakSet()) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return obj;
  if (seen.has(obj)) return obj;
  seen.add(obj);
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    // Skip the cleanup hook — it must stay swappable by the loader.
    if (key === '_cleanup') continue;
    let value;
    try { value = obj[key]; } catch { continue; }
    if (value && (typeof value === 'object' || typeof value === 'function')) {
      harden(value, seen);
    }
  }
  return obj;
}

/* ================================================================== */
/*  B. Reserved-event guard — protect the core event channel           */
/* ================================================================== */

/** Prefixes an extension is never allowed to emit (RULE E). The host listens
 *  on these to drive navigation, settings application, window lifecycle and
 *  the extension bridge itself; letting an extension dispatch them would let
 *  it hijack core behavior. */
const RESERVED_EVENT_PREFIXES = ['lithium:', 'li:', 'ext-internal:'];

/** Explicit privileged event names blocked even if a prefix check were widened. */
const RESERVED_EVENTS = new Set([
  'storage',           // the Web Storage event — drives theme sync in the bridge
  'hashchange',
  'popstate',
]);

/**
 * Validate that an extension (with id extId) may emit `event`. Extensions may
 * only emit events namespaced to themselves: `ext:<extId>:<name>`.
 * @returns {true}            if allowed
 * @throws {Error}            if the name is reserved or foreign-namespaced
 */
export function assertEmittable(event, extId) {
  if (typeof event !== 'string' || !event) {
    throw new Error('Event name must be a non-empty string');
  }
  for (const p of RESERVED_EVENT_PREFIXES) {
    if (event.startsWith(p)) {
      throw new Error(`Cannot emit reserved event "${event}"`);
    }
  }
  if (RESERVED_EVENTS.has(event)) {
    throw new Error(`Cannot emit reserved event "${event}"`);
  }
  // Must be self-namespaced.
  if (event !== `ext:${extId}` && !event.startsWith(`ext:${extId}:`)) {
    throw new Error(
      `Extensions may only emit events under their own "ext:${extId}:" namespace`,
    );
  }
  return true;
}

/* ================================================================== */
/*  C. Settings-path guard — confine writes to the extension namespace  */
/* ================================================================== */

/**
 * Whether an extension may write to a dotted settings path (RULE E).
 * Core settings (theme, browser, window, privacy, ai, …) are owned by Lithium
 * and its vetted namespaced APIs; an extension's generic setSetting may only
 * touch its own `extensions.<extId>.*` subtree.
 */
export function isSettingsPathAllowed(extId, path) {
  if (typeof path !== 'string' || !path) return false;
  const owned = `extensions.${extId}.`;
  // Allow writing the namespace root itself or anything beneath it.
  return path === `extensions.${extId}` || path.startsWith(owned);
}

/* ================================================================== */
/*  D. Serialization guard — data-only across the app ↔ extension bus   */
/* ================================================================== */

/**
 * Throw if `value` contains anything that must not cross the boundary:
 * functions, DOM nodes, window/iframe objects, or class instances carrying
 * behavior. Only plain serializable data is permitted (RULES A, B, C).
 */
export function assertSerializable(value, label = 'value', depth = 0) {
  if (depth > 100) throw new Error(`${label}: maximum nesting depth exceeded`);
  const t = typeof value;
  if (value === null || t === 'string' || t === 'number' || t === 'boolean' || t === 'undefined') {
    return;
  }
  if (t === 'function') {
    throw new Error(`${label}: functions cannot cross the extension boundary`);
  }
  if (t === 'symbol' || t === 'bigint') {
    throw new Error(`${label}: ${t} values cannot cross the extension boundary`);
  }
  // Host objects that would leak a live reference.
  if (typeof Node !== 'undefined' && value instanceof Node) {
    throw new Error(`${label}: DOM nodes cannot cross the extension boundary`);
  }
  if (typeof Window !== 'undefined' && value instanceof Window) {
    throw new Error(`${label}: window/iframe references cannot cross the boundary`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSerializable(item, `${label}[]`, depth + 1);
    return;
  }
  if (value instanceof Date || value instanceof RegExp) return; // clone-safe
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return; // binary-safe
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw new Error(`${label}: Blob handles cannot cross the boundary (use a data URL)`);
  }
  if (t === 'object') {
    // Reject non-plain objects (any object with a custom prototype that isn't
    // one of the allowed classes above) to avoid shipping behavior.
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      const ctor = proto.constructor?.name || 'unknown';
      throw new Error(`${label}: instances of ${ctor} cannot cross the extension boundary`);
    }
    for (const k of Object.keys(value)) {
      assertSerializable(value[k], `${label}.${k}`, depth + 1);
    }
    return;
  }
  throw new Error(`${label}: unsupported value type`);
}

/**
 * Return a structured-cloned copy safe for postMessage. Throws if the value
 * is not serializable (delegates to assertSerializable for a clear message).
 */
export function sanitize(value, label = 'payload') {
  assertSerializable(value, label);
  try {
    return structuredClone(value);
  } catch {
    // Fallback for environments/classes structuredClone rejects.
    return JSON.parse(JSON.stringify(value ?? null));
  }
}

/* ================================================================== */
/*  E. Download / user-activation guard                                */
/* ================================================================== */

let guardsInstalled = false;
let lastActivationTs = 0;
let extensionCallDepth = 0;
const ACTIVATION_WINDOW_MS = 3000;

function markActivation() {
  lastActivationTs = Date.now();
}

/** Install global listeners + a download interception patch (call once). */
export function initSecurityGuards() {
  if (guardsInstalled || typeof window === 'undefined') return;
  guardsInstalled = true;

  // Track genuine user activation on the host.
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, markActivation, { capture: true, passive: true });
  }

  // Defense-in-depth patch: block programmatic `download` anchor clicks that
  // happen while an extension handler is running with no fresh user gesture
  // (RULE D). Clicks outside an extension context are untouched, so legit
  // host and in-app downloads continue to work.
  try {
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (patched) {
      if (
        extensionCallDepth > 0 &&
        this.hasAttribute('download') &&
        !hasRecentActivation()
      ) {
        console.warn(
          '[extSecurity] Blocked extension-initiated download without user gesture:',
          this.getAttribute('download') || this.href,
        );
        return undefined;
      }
      return originalClick.call(this, patched);
    };
  } catch { /* non-DOM env */ }
}

/** Whether a real user activation happened within the trust window. */
export function hasRecentActivation() {
  const ua = navigator.userActivation;
  if (ua && typeof ua.isActive === 'boolean') return ua.isActive;
  return Date.now() - lastActivationTs < ACTIVATION_WINDOW_MS;
}

/**
 * Run `fn` tagged as executing inside an extension context. Used by the
 * dispatcher so the download patch knows when to apply its check.
 */
export async function runInExtensionContext(fn) {
  extensionCallDepth++;
  try {
    return await fn();
  } finally {
    extensionCallDepth--;
  }
}

/* ================================================================== */
/*  F. Provider-API registry — extensions exposing APIs to apps         */
/* ================================================================== */

/** Map<extId, Map<name, { name, description, handler, public }>> */
const providerApis = new Map();

const API_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Register a callable API endpoint for an extension (RULE A provider side).
 * The handler is stored *host-side only*; it is never handed to an app. Apps
 * invoke it indirectly through the bridge dispatcher below.
 */
export function registerProviderApi(extId, name, spec = {}) {
  if (!API_NAME_RE.test(name || '')) {
    throw new Error(`Invalid API name "${name}" (letters, digits, _ only; start with a letter)`);
  }
  if (typeof spec.handler !== 'function') {
    throw new Error('API spec requires a handler() function');
  }
  if (!providerApis.has(extId)) providerApis.set(extId, new Map());
  providerApis.get(extId).set(name, {
    name,
    description: typeof spec.description === 'string' ? spec.description : '',
    public: spec.public !== false,
    handler: spec.handler,
  });
  window.dispatchEvent(new CustomEvent('lithium:ext-api-registry-changed'));
}

/** Remove a single endpoint. */
export function unregisterProviderApi(extId, name) {
  const map = providerApis.get(extId);
  if (!map || !map.delete(name)) return;
  if (map.size === 0) providerApis.delete(extId);
  window.dispatchEvent(new CustomEvent('lithium:ext-api-registry-changed'));
}

/** Remove every endpoint an extension registered (called on unload). */
export function unregisterAllProviderApis(extId) {
  if (providerApis.delete(extId)) {
    window.dispatchEvent(new CustomEvent('lithium:ext-api-registry-changed'));
  }
}

/**
 * Discoverable metadata for every public endpoint. Never includes the
 * handler function — only id/name/description (RULE C).
 */
export function getExposedApis() {
  const list = [];
  for (const [extId, map] of providerApis) {
    for (const api of map.values()) {
      if (api.public) {
        list.push({ extId, name: api.name, description: api.description });
      }
    }
  }
  return list;
}

/** Look up a raw provider record (internal). */
function findProviderApi(extId, name) {
  return providerApis.get(extId)?.get(name) || null;
}

/**
 * All endpoints an extension registered (including non-public), for the
 * owning extension's own introspection. Never returns the handler function.
 */
export function getProviderApisForExtension(extId) {
  const map = providerApis.get(extId);
  if (!map) return [];
  return [...map.values()].map(a => ({
    name: a.name,
    description: a.description,
    public: a.public,
  }));
}

/* ================================================================== */
/*  G. App ↔ Extension grant store (per-app approval)                   */
/* ================================================================== */

const GRANTS_KEY = 'ext-grants';

/** Shape: [{ appId, extId, methods: ['*'|name, ...], grantedAt }] */
function readGrants() {
  const raw = storage.get(GRANTS_KEY, []);
  return Array.isArray(raw) ? raw : [];
}
function writeGrants(list) {
  storage.set(GRANTS_KEY, list);
  window.dispatchEvent(new CustomEvent('lithium:ext-grants-changed'));
}

function grantMatches(grant, appId, extId, method) {
  if (grant.appId !== appId || grant.extId !== extId) return false;
  return grant.methods.includes('*') || grant.methods.includes(method);
}

/** Whether `appId` may call `extId.method`. */
export function checkGrant(appId, extId, method) {
  return readGrants().some(g => grantMatches(g, appId, extId, method));
}

/** Grant `appId` access to an extension's method(s). `methods` may be ['*']. */
export function grantApiAccess(appId, extId, methods = ['*']) {
  const list = readGrants();
  const existing = list.find(g => g.appId === appId && g.extId === extId);
  const merged = new Set([...(existing?.methods || []), ...methods]);
  if (existing) {
    existing.methods = [...merged];
    existing.grantedAt = Date.now();
  } else {
    list.push({ appId, extId, methods: [...merged], grantedAt: Date.now() });
  }
  writeGrants(list);
}

/** Revoke a grant. Pass method to remove one; omit to remove the whole pair. */
export function revokeGrant(appId, extId, method) {
  let list = readGrants();
  if (!method) {
    list = list.filter(g => !(g.appId === appId && g.extId === extId));
  } else {
    list = list
      .map(g => {
        if (g.appId === appId && g.extId === extId) {
          return { ...g, methods: g.methods.filter(m => m !== method && !(method === '*' && m === '*')) };
        }
        return g;
      })
      .filter(g => g.methods.length > 0);
  }
  writeGrants(list);
}

/** All grants, optionally filtered by extension or app. */
export function listGrants({ extId, appId } = {}) {
  return readGrants().filter(g =>
    (!extId || g.extId === extId) && (!appId || g.appId === appId),
  );
}

/* ================================================================== */
/*  H. Grant approval popup (host-level, RULE F)                        */
/* ================================================================== */

/**
 * Show a modal asking the user to allow app → extension access. Resolves
 * true/false. Renders directly into the host document (never into an iframe).
 */
export function requestGrantPrompt({ appId, extId, method }) {
  return new Promise(resolve => {
    if (typeof document === 'undefined') { resolve(false); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(4px)';

    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.style.cssText =
      'max-width:380px;width:100%;border-radius:16px;padding:20px;color:#fff;' +
      'background:hsl(222 20% 12%);border:1px solid rgba(255,255,255,.08);' +
      'box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:system-ui,sans-serif';

    const head = document.createElement('div');
    head.textContent = 'Extension API access request';
    head.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:8px';

    const body = document.createElement('p');
    body.style.cssText = 'font-size:12px;line-height:1.5;color:rgba(255,255,255,.65);margin:0 0 16px';
    const strong = document.createElement('b');
    strong.textContent = String(appId);
    const strong2 = document.createElement('b');
    strong2.textContent = String(extId);
    body.append('The app ', strong, ' wants to call ', strong2);
    const code = document.createElement('code');
    code.textContent = `.${method}()`;
    code.style.cssText = 'background:rgba(255,255,255,.08);border-radius:4px;padding:0 3px';
    body.append(code, '. Allow this?');

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';

    const deny = document.createElement('button');
    deny.textContent = 'Deny';
    deny.style.cssText = 'border-radius:10px;padding:7px 14px;font-size:12px;cursor:pointer;' +
      'color:rgba(255,255,255,.7);background:transparent;border:1px solid rgba(255,255,255,.12)';

    const allow = document.createElement('button');
    allow.textContent = 'Allow';
    allow.style.cssText = 'border-radius:10px;padding:7px 14px;font-size:12px;cursor:pointer;' +
      'color:#fff;background:var(--accent,#22d3ee);border:none';

    let settled = false;
    const done = val => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(val);
    };
    deny.addEventListener('click', () => done(false));
    allow.addEventListener('click', () => done(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });

    row.append(deny, allow);
    box.append(head, body, row);
    overlay.append(box);
    document.body.appendChild(overlay);
    setTimeout(() => allow.focus(), 0);
  });
}

/* ================================================================== */
/*  I. Central dispatcher — the single app → extension entry point      */
/* ================================================================== */

/**
 * Enforce every cross-boundary rule for one app → extension API call.
 * Returns `{ ok, result }` or `{ ok:false, error }`. The result is always a
 * sanitized, serializable clone (RULE B). Called from liRuntime's bridge.
 */
export async function invokeExtensionApi({ appId, extId, method, params }) {
  initSecurityGuards();

  const api = findProviderApi(extId, method);
  if (!api) {
    return { ok: false, error: `No such API: ${extId}.${method}` };
  }
  if (!api.public) {
    return { ok: false, error: `API ${extId}.${method} is not public` };
  }

  // RULE F — require an explicit, persisted grant; prompt if undecided.
  if (!checkGrant(appId, extId, method)) {
    const approved = await requestGrantPrompt({ appId, extId, method });
    if (!approved) {
      return { ok: false, error: 'Permission denied by user' };
    }
    grantApiAccess(appId, extId, [method]);
  }

  // RULE A — inbound params must be serializable data.
  let safeParams;
  try {
    safeParams = sanitize(params ?? null, 'params');
  } catch (err) {
    return { ok: false, error: `Invalid params: ${err.message}` };
  }

  try {
    // RULE D — run tagged so extension-initiated downloads are guarded.
    const raw = await runInExtensionContext(() => api.handler(safeParams, { appId, extId }));
    // RULE B/C — outbound result is data-only.
    const safeResult = sanitize(raw, 'result');
    return { ok: true, result: safeResult };
  } catch (err) {
    return { ok: false, error: err?.message || 'Extension API call failed' };
  }
}

/**
 * Discoverable API list for a given app: metadata for public endpoints that
 * the app already has a grant for, so `li.ext.list()` only shows callable APIs.
 */
export function getApisVisibleToApp(appId) {
  const grants = listGrants({ appId });
  const visible = [];
  for (const { extId, name, description } of getExposedApis()) {
    if (grants.some(g => grantMatches(g, appId, extId, name))) {
      visible.push({ extId, name, description, granted: true });
    } else {
      // Still discoverable, but marked as requiring approval on first call.
      visible.push({ extId, name, description, granted: false });
    }
  }
  return visible;
}

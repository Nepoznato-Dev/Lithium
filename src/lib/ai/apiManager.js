import { kvGet, kvSet } from '../storage/kvTier';

/**
 * API Manager bridge. This module owns the catalog, permissions and
 * validation inline; it executes validated calls against real
 * handlers (browser/UI actions) and keeps the audit log.
 *
 * Caller classes: 'system' | 'user' | 'widget' | 'model'.
 */

const HANDLERS = new Map();
const EVENT_SUBS = new Map();
const AUDIT_KEY = 'api-audit';
const AUDIT_CAP = 200;

/* ---------- API catalog ---------- */

const _API_CATALOG = [
  { api: 'system.get_info', ns: 'system', desc: 'Build version, time and platform details', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.open_start_menu', ns: 'system', desc: 'Open the Start menu', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.close_start_menu', ns: 'system', desc: 'Close the Start menu', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.show_desktop', ns: 'system', desc: 'Minimize every open window', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.get_volume', ns: 'system', desc: 'Current taskbar volume level', callers: ['system','user','widget','model'], params: [] },
  { api: 'system.set_volume', ns: 'system', desc: 'Set the taskbar volume level', callers: ['system','user','widget','model'], params: [{ name: 'level', type: 'number', required: true, min: 0, max: 100 }] },
  { api: 'system.notify', ns: 'system', desc: 'Show a desktop toast notification', callers: ['system','user','widget','model'], params: [
    { name: 'title', type: 'string', required: true }, { name: 'body', type: 'string', required: false },
    { name: 'tone', type: 'string', required: false, values: ['info','success','warning','error'] }] },
  { api: 'apps.list', ns: 'apps', desc: 'List every registered desktop app', callers: ['system','user','widget','model'], params: [] },
  { api: 'apps.open', ns: 'apps', desc: 'Open (or focus) a desktop app window', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'apps.close', ns: 'apps', desc: 'Close a desktop app window', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'apps.focus', ns: 'apps', desc: 'Bring an app window to the front', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'settings.get', ns: 'settings', desc: 'Read one setting (or all) by dotted path', callers: ['system','user','widget','model'], params: [{ name: 'path', type: 'string', required: false }] },
  { api: 'settings.set', ns: 'settings', desc: 'Change a setting by dotted path', callers: ['system','user','widget','model'], params: [{ name: 'path', type: 'string', required: true }, { name: 'value', type: 'any', required: true }] },
  { api: 'fs.list', ns: 'fs', desc: 'List entries of a virtual-FS folder', callers: ['system','user','widget','model'], params: [{ name: 'folder', type: 'string', required: false }] },
  { api: 'fs.read', ns: 'fs', desc: 'Read a text file content by id', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'fs.write', ns: 'fs', desc: 'Create or overwrite a text file', callers: ['system','user','widget','model'], params: [{ name: 'name', type: 'string', required: true }, { name: 'parent', type: 'string', required: false }, { name: 'content', type: 'string', required: false }] },
  { api: 'fs.create_folder', ns: 'fs', desc: 'Create a folder in the virtual FS', callers: ['system','user','widget','model'], params: [{ name: 'name', type: 'string', required: true }, { name: 'parent', type: 'string', required: false }] },
  { api: 'fs.delete', ns: 'fs', desc: 'Delete an entry (recursive for folders)', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'fs.tree', ns: 'fs', desc: 'Recursive overview of a folder', callers: ['system','user','widget','model'], params: [{ name: 'folder', type: 'string', required: false }] },
  { api: 'fs.append', ns: 'fs', desc: 'Append text to a file', callers: ['system','user','widget','model'], params: [{ name: 'name', type: 'string', required: true }, { name: 'parent', type: 'string', required: false }, { name: 'content', type: 'string', required: false }] },
  { api: 'fs.move', ns: 'fs', desc: 'Move an entry into another folder', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }, { name: 'parent', type: 'string', required: true }] },
  { api: 'fs.rename', ns: 'fs', desc: 'Rename an entry', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }, { name: 'name', type: 'string', required: true }] },
  { api: 'weather.get', ns: 'weather', desc: 'Cached local weather', callers: ['system','user','widget','model'], params: [] },
  { api: 'ai.list_providers', ns: 'ai', desc: 'Configured AI providers', callers: ['system','user','widget','model'], params: [] },
  { api: 'ai.get_tier', ns: 'ai', desc: 'Active on-device inference tier', callers: ['system','user','widget','model'], params: [] },
  { api: 'ai.set_tier', ns: 'ai', desc: 'Switch the on-device inference tier', callers: ['system','user','widget','model'], params: [{ name: 'tier', type: 'string', required: true, values: ['lite','efficient','performance','ultra'] }] },
  { api: 'models.list', ns: 'models', desc: 'Model catalog with download status', callers: ['system','user','widget','model'], params: [] },
  { api: 'cloud.list_drives', ns: 'cloud', desc: 'Connected external cloud drives', callers: ['system','user','widget','model'], params: [] },
  { api: 'cloud.test_drive', ns: 'cloud', desc: 'Test a cloud drive credentials', callers: ['system','user','widget','model'], params: [{ name: 'id', type: 'string', required: true }] },
  { api: 'memory.list', ns: 'memory', desc: 'All memory keys with timestamps', callers: ['system','user','widget','model'], params: [] },
  { api: 'memory.read', ns: 'memory', desc: 'Read one memory entry by key', callers: ['system','user','widget','model'], params: [{ name: 'key', type: 'string', required: true }] },
  { api: 'memory.write', ns: 'memory', desc: 'Store a memory entry', callers: ['system','user','widget','model'], params: [{ name: 'key', type: 'string', required: true }, { name: 'value', type: 'string', required: true }] },
  { api: 'memory.delete', ns: 'memory', desc: 'Delete a memory entry', callers: ['system','user','widget','model'], params: [{ name: 'key', type: 'string', required: true }] },
  { api: 'widgets.list', ns: 'widgets', desc: 'User widgets with enabled state', callers: ['system','user','widget','model'], params: [] },
  { api: 'widgets.set_enabled', ns: 'widgets', desc: 'Enable or disable a widget', callers: ['system','user','model'], params: [{ name: 'id', type: 'string', required: true }, { name: 'enabled', type: 'boolean', required: true }] },
  { api: 'apps.create', ns: 'apps', desc: 'Create or update a dynamic .li app at runtime', callers: ['system','user','model'], params: [
    { name: 'manifest', type: 'any', required: true },
    { name: 'html', type: 'string', required: true },
  ]},
  { api: 'apps.update', ns: 'apps', desc: 'Update an existing dynamic .li app', callers: ['system','user','model'], params: [
    { name: 'manifest', type: 'any', required: true },
    { name: 'html', type: 'string', required: false },
  ]},
  { api: 'apps.delete_app', ns: 'apps', desc: 'Delete a dynamic .li app', callers: ['system','user','model'], params: [
    { name: 'id', type: 'string', required: true },
  ]},
  { api: 'apps.list_dynamic', ns: 'apps', desc: 'List all dynamic (runtime-created) .li apps', callers: ['system','user','widget','model'], params: [] },
];

const _SETTINGS_SCHEMA = [
  { path: 'profile.username', kind: 'string' }, { path: 'theme.accent', kind: 'string' },
  { path: 'theme.contrast', kind: 'string', values: ['normal','high'] },
  { path: 'theme.appTint', kind: 'boolean' }, { path: 'theme.transparency', kind: 'boolean' },
  { path: 'layout.density', kind: 'string', values: ['compact','default','large'] },
  { path: 'motion.animations', kind: 'string', values: ['full','reduced','off'] },
  { path: 'background.enabled', kind: 'boolean' },
  { path: 'background.intensity', kind: 'number', min: 0, max: 1 },
  { path: 'performance.lowEndMode', kind: 'boolean' },
  { path: 'games.fullscreenOnLaunch', kind: 'boolean' }, { path: 'games.escToClose', kind: 'boolean' },
  { path: 'browser.searchEngine', kind: 'string', values: ['duckduckgo','qwant','mojeek','startpage'] },
];

function _typeMatch(value, kind) {
  if (kind === 'any') return true;
  if (kind === 'string') return typeof value === 'string';
  if (kind === 'number') return typeof value === 'number';
  if (kind === 'boolean') return typeof value === 'boolean';
  return true;
}

function _apiValidate(request) {
  if (!request || typeof request !== 'object') return { ok: false, error: 'request must be an object' };
  const api = request.api || '';
  const caller = request.caller || 'user';
  const params = request.params || {};
  const spec = _API_CATALOG.find(s => s.api === api);
  if (!spec) return { ok: false, error: `unknown api '${api}'` };
  if (!spec.callers.includes(caller)) return { ok: false, error: `caller '${caller}' is not allowed to use ${api}` };
  const outParams = {};
  for (const p of spec.params) {
    const val = params[p.name];
    if (val !== undefined) {
      if (!_typeMatch(val, p.type)) return { ok: false, error: `parameter '${p.name}' must be ${p.type}` };
      if (p.values && typeof val === 'string' && !p.values.includes(val)) return { ok: false, error: `parameter '${p.name}' must be one of: ${p.values.join(', ')}` };
      if (p.type === 'number' && (val < (p.min ?? -Infinity) || val > (p.max ?? Infinity))) return { ok: false, error: `parameter '${p.name}' out of range` };
      outParams[p.name] = val;
    } else if (p.required) {
      return { ok: false, error: `missing required parameter '${p.name}'` };
    }
  }
  if (api === 'settings.set') {
    const schema = _SETTINGS_SCHEMA.find(s => s.path === outParams.path);
    if (!schema) return { ok: false, error: `unknown settings path '${outParams.path}'` };
    if (!_typeMatch(outParams.value, schema.kind)) return { ok: false, error: `setting '${outParams.path}' expects ${schema.kind}` };
    if (schema.values && typeof outParams.value === 'string' && !schema.values.includes(outParams.value)) return { ok: false, error: `setting '${outParams.path}' must be one of: ${schema.values.join(', ')}` };
    if (schema.kind === 'number' && (outParams.value < (schema.min ?? -Infinity) || outParams.value > (schema.max ?? Infinity))) return { ok: false, error: `setting '${outParams.path}' out of range` };
  }
  return { ok: true, api: spec.api, ns: spec.ns, caller, params: outParams };
}

function _apiAuditAppend(log, api, caller, ok, error, now, cap) {
  const existing = Array.isArray(log) ? log : [];
  const entry = { t: now || 0, api: api || '', caller: caller || '', ok: !!ok };
  if (error) entry.error = error;
  const limit = Math.min(cap || 200, existing.length + 1);
  return [entry, ...existing.slice(0, limit - 1)];
}

/* ---------- Handler registry ---------- */

export function registerHandler(api, fn) {
  HANDLERS.set(api, fn);
}

export function hasHandler(api) {
  return HANDLERS.has(api);
}

/** Catalog. */
export function getCatalog() {
  return _API_CATALOG;
}

/* ---------- Call pipeline: validate (Rust) → execute → audit ---------- */

export async function call(api, params = {}, caller = 'user') {
  let normalized = params;

  const verdict = _apiValidate({ api, params, caller });
  if (verdict && !verdict.ok) {
    // The wasm catalog only knows compiled APIs. Newer JS-registered namespaces
    // (code.*) are "unknown" to it — but if a handler exists, trust it.
    if (!HANDLERS.has(api)) {
      audit(api, caller, false, verdict.error);
      throw new Error(verdict.error);
    }
  } else if (verdict && verdict.ok) {
    normalized = verdict.params || {};
  } else if (!HANDLERS.has(api)) {
    // No wasm and no handler — nothing can run this.
    audit(api, caller, false, 'unknown api');
    throw new Error(`unknown api '${api}'`);
  }

  const handler = HANDLERS.get(api);
  if (!handler) {
    audit(api, caller, false, 'no handler registered');
    throw new Error(`no handler registered for ${api}`);
  }
  try {
    const result = await handler(normalized, { api, caller });
    audit(api, caller, true);
    return result ?? null;
  } catch (err) {
    audit(api, caller, false, err.message);
    throw err;
  }
}

/**
 * Run a handler WITHOUT the Rust catalog validation gate. The wasm catalog only
 * knows APIs compiled into it; newer JS-registered namespaces (code.*) would be
 * rejected as "unknown api" by apiValidateSync, so trusted in-app callers (the
 * Code Studio agent) use this path instead. Still audited + handler-guarded.
 */
export async function callTrusted(api, params = {}, caller = 'model') {
  const handler = HANDLERS.get(api);
  if (!handler) {
    audit(api, caller, false, 'no handler registered');
    throw new Error(`no handler registered for ${api}`);
  }
  try {
    const result = await handler(params, { api, caller });
    audit(api, caller, true);
    return result ?? null;
  } catch (err) {
    audit(api, caller, false, err.message);
    throw err;
  }
}

/* ---------- Event bus (widgets + desktop signals) ---------- */

export function emitEvent(name, detail = {}) {
  const subs = EVENT_SUBS.get(name);
  if (subs) {
    for (const fn of subs) {
      try {
        fn(detail);
      } catch { /* widget errors must never break the emitter */ }
    }
  }
  window.dispatchEvent(new CustomEvent(`lithium:event:${name}`, { detail }));
}

export function onEvent(name, fn) {
  if (!EVENT_SUBS.has(name)) EVENT_SUBS.set(name, new Set());
  EVENT_SUBS.get(name).add(fn);
  return () => EVENT_SUBS.get(name)?.delete(fn);
}

/* ---------- Audit log ---------- */

function audit(api, caller, ok, error = '') {
  const log = kvGet(AUDIT_KEY, []);
  const result = _apiAuditAppend(log, api, caller, ok, error, Date.now(), AUDIT_CAP);
  if (result) kvSet(AUDIT_KEY, result);
  window.dispatchEvent(new Event('lithium:api-audit'));
}

export function getAudit() {
  return kvGet(AUDIT_KEY, []);
}

export function clearAudit() {
  kvSet(AUDIT_KEY, []);
  window.dispatchEvent(new Event('lithium:api-audit'));
}

/* ---------- Diagnostics ---------- */

export function engineInfo() {
  return { engine: 'js-native', handlers: HANDLERS.size };
}

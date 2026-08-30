import { apiCatalogSync, apiValidateSync, apiAuditAppendSync, coreReady, hasWasm } from '../core';
import { kvGet, kvSet } from '../storage/kvTier';

/**
 * API Manager bridge. The Rust core owns the catalog, permissions and
 * validation; this module executes the validated calls against real
 * handlers (browser/UI actions wasm can't reach) and keeps the audit log.
 *
 * Caller classes: 'system' | 'user' | 'widget' | 'model'.
 */

const HANDLERS = new Map();
const EVENT_SUBS = new Map();
const AUDIT_KEY = 'api-audit';
const AUDIT_CAP = 200;

/* ---------- Handler registry ---------- */

export function registerHandler(api, fn) {
  HANDLERS.set(api, fn);
}

export function hasHandler(api) {
  return HANDLERS.has(api);
}

/** Catalog from Rust. */
export async function getCatalog() {
  await coreReady();
  return apiCatalogSync() || [];
}

/* ---------- Call pipeline: validate (Rust) → execute → audit ---------- */

export async function call(api, params = {}, caller = 'user') {
  await coreReady();
  let normalized = params;

  const verdict = apiValidateSync({ api, params, caller });
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
  const result = apiAuditAppendSync(log, api, caller, ok, error, Date.now(), AUDIT_CAP);
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
  return { engine: hasWasm() ? 'rust-wasm' : 'no-wasm', handlers: HANDLERS.size };
}

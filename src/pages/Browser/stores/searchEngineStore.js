/**
 * Search Engine Store — manages built-in + custom search engines,
 * keyword shortcuts (e.g. "yt cats" → YouTube), and engine ordering.
 * Persists custom engines and order to localStorage.
 */
import { signal } from '@preact/signals';
import { SEARCH_ENGINES } from '../../../lib/settings';

const CUSTOM_ENGINES_KEY = 'lithium:custom-engines';
const ENGINE_ORDER_KEY = 'lithium:engine-order';

/** Built-in engines from settings. */
const BUILTIN = Object.entries(SEARCH_ENGINES).map(([key, eng]) => ({
  id: key,
  label: eng.label,
  url: eng.url,
  keyword: '',
  builtin: true,
}));

/** Load custom engines from localStorage. */
function loadCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_ENGINES_KEY)) || []; } catch { return []; }
}
function saveCustom(engines) {
  try { localStorage.setItem(CUSTOM_ENGINES_KEY, JSON.stringify(engines)); } catch {}
}

/** Load engine order from localStorage. */
function loadOrder() {
  try { return JSON.parse(localStorage.getItem(ENGINE_ORDER_KEY)) || null; } catch { return null; }
}
function saveOrder(order) {
  try { localStorage.setItem(ENGINE_ORDER_KEY, JSON.stringify(order)); } catch {}
}

/** All engines: built-in + custom, in configured order. */
export const engines = signal(buildEngineList());

function buildEngineList() {
  const custom = loadCustom().map(e => ({ ...e, builtin: false }));
  const all = [...BUILTIN, ...custom];
  const order = loadOrder();
  if (order && Array.isArray(order)) {
    const byId = Object.fromEntries(all.map(e => [e.id, e]));
    const ordered = order.map(id => byId[id]).filter(Boolean);
    const remaining = all.filter(e => !order.includes(e.id));
    return [...ordered, ...remaining];
  }
  return all;
}

/** Get engine by id. */
export function getEngine(id) {
  return engines.value.find(e => e.id === id) || engines.value[0];
}

/** Resolve a keyword shortcut. Returns the engine if found. */
export function resolveKeyword(keyword) {
  const lower = keyword.toLowerCase();
  return engines.value.find(e => e.keyword && e.keyword.toLowerCase() === lower) || null;
}

/** Add a custom search engine. */
export function addEngine({ label, url, keyword }) {
  const id = `custom-${Date.now()}`;
  const engine = { id, label, url, keyword: keyword || '', builtin: false };
  const custom = loadCustom();
  custom.push(engine);
  saveCustom(custom);
  engines.value = buildEngineList();
  return engine;
}

/** Remove a custom engine (built-in cannot be removed). */
export function removeEngine(id) {
  const custom = loadCustom().filter(e => e.id !== id);
  saveCustom(custom);
  engines.value = buildEngineList();
}

/** Update a custom engine's fields. */
export function updateEngine(id, patch) {
  const custom = loadCustom().map(e => e.id === id ? { ...e, ...patch } : e);
  saveCustom(custom);
  engines.value = buildEngineList();
}

/** Set keyword for an engine (built-in or custom). */
export function setKeyword(id, keyword) {
  // Check if it's a custom engine
  const custom = loadCustom();
  const idx = custom.findIndex(e => e.id === id);
  if (idx >= 0) {
    custom[idx].keyword = keyword;
    saveCustom(custom);
  } else {
    // Store built-in keyword in a separate key
    const kwKey = 'lithium:builtin-keywords';
    let kws = {};
    try { kws = JSON.parse(localStorage.getItem(kwKey)) || {}; } catch {}
    if (keyword) { kws[id] = keyword; } else { delete kws[id]; }
    try { localStorage.setItem(kwKey, JSON.stringify(kws)); } catch {}
    // Patch the BUILTIN array in memory
    const eng = BUILTIN.find(e => e.id === id);
    if (eng) eng.keyword = keyword;
  }
  engines.value = buildEngineList();
}

/** Reorder engines by moving an engine to a new position. */
export function reorderEngine(fromIdx, toIdx) {
  const arr = [...engines.value];
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);
  engines.value = arr;
  saveOrder(arr.map(e => e.id));
}

/** Build a search URL for a given engine and query. */
export function buildSearchUrl(engine, query) {
  const url = engine.url || '';
  if (url.includes('%s')) return url.replace('%s', encodeURIComponent(query));
  return url + encodeURIComponent(query);
}

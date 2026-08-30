import { call, onEvent } from '../ai/apiManager';
import { notify } from './notify';
import { storage } from '../storage/localStorage';
import { loadTree, readEntryContent } from '../fileSystem';
import { hydrate } from '../storage/unifiedStore';
import { widgetFilterEntriesSync, widgetToggleEnabledSync, widgetStaleRunningIdsSync } from '../core';

/**
 * Widget runtime — user-authored automation scripts stored as
 * `*.widget.js` files in Documents/Widgets. Each widget gets a small
 * sandboxed surface: `api.call(...)`, `on(event, fn)`, `every(ms, fn)`,
 * `log(...)`. All API calls are validated by the Rust core as
 * caller 'widget', so widgets can never exceed their permission class.
 *
 * Trust model: widget code is always local and user-authored (like a
 * userscript) — never fetched from remote sources. `new Function` is the
 * intentional execution mechanism; privilege escalation is prevented by the
 * Rust permission engine, not by hiding eval.
 */

export const WIDGETS_FOLDER_ID = 'default-widgets';
const ENABLED_KEY = 'widgets-enabled';

const running = new Map(); // entry id → { timers: [], unsubs: [] }
let started = false;

export function widgetEntries() {
  const tree = loadTree();
  return widgetFilterEntriesSync(tree, WIDGETS_FOLDER_ID) || [];
}

export function listWidgets() {
  const enabled = storage.get(ENABLED_KEY, []);
  return widgetEntries().map(entry => ({
    id: entry.id,
    name: entry.name.replace(/\.widget\.js$/, ''),
    enabled: enabled.includes(entry.id),
    running: running.has(entry.id),
  }));
}

export async function startWidget(id) {
  if (running.has(id)) return;
  const entry = widgetEntries().find(item => item.id === id);
  if (!entry) return;

  const ctx = { timers: [], unsubs: [] };
  const api = {
    call: (name, params = {}) => call(name, params, 'widget'),
    notify: (title, body = '') => call('system.notify', { title, body }, 'widget'),
  };
  const on = (event, fn) => ctx.unsubs.push(onEvent(event, fn));
  const every = (ms, fn) => ctx.timers.push(setInterval(() => {
    try {
      fn();
    } catch { /* widget tick errors are swallowed */ }
  }, Math.max(1000, ms)));
  const log = (...args) => console.info(`[widget:${entry.name}]`, ...args);

  try {
    const code = await readEntryContent(entry);
    const factory = new Function('api', 'on', 'every', 'log', `"use strict";\n${code}`);
    factory(api, on, every, log);
    running.set(id, ctx);
  } catch (err) {
    notify({ title: 'Widget error', body: `${entry.name}: ${err.message}`, tone: 'warning' });
  }
}

export function stopWidget(id) {
  const ctx = running.get(id);
  if (!ctx) return;
  ctx.timers.forEach(timer => clearInterval(timer));
  ctx.unsubs.forEach(unsub => unsub());
  running.delete(id);
}

export function setWidgetEnabled(id, enabled) {
  if (!widgetEntries().some(entry => entry.id === id)) {
    throw new Error(`no widget '${id}'`);
  }
  const list = storage.get(ENABLED_KEY, []);
  const updated = widgetToggleEnabledSync(list, id, enabled) || list;
  storage.set(ENABLED_KEY, updated);
  if (enabled) startWidget(id);
  else stopWidget(id);
  window.dispatchEvent(new Event('lithium:widgets-changed'));
  return enabled;
}

/** Boot all enabled widgets (idempotent — StrictMode-safe). */
export function startEnabledWidgets() {
  if (started) return;
  started = true;

  (async () => {
    await hydrate();
    const enabled = storage.get(ENABLED_KEY, []);
    widgetEntries().filter(entry => enabled.includes(entry.id)).forEach(entry => startWidget(entry.id));
  })();

  // Stop widgets whose files were deleted; drop stale enabled ids.
  window.addEventListener('lithium:fs-changed', () => {
    const entries = widgetEntries();
    const validIds = entries.map(entry => entry.id);
    const runningIds = [...running.keys()];
    const stale = widgetStaleRunningIdsSync(runningIds, validIds) || [];
    for (const id of stale) {
      stopWidget(id);
    }
  });
}

/* ---------- Starter templates (created by the API Manager app) ---------- */

/** Full sandbox reference — handed to AI models and shown in the API Manager.
 *  Keep this in sync with the actual sandbox above. */
export const WIDGET_API_DOC = `Widget sandbox — every *.widget.js runs with exactly these globals:
- api.call(name, params) -> Promise<result>  // validated as caller 'widget'
- api.notify(title, body)                    // quick desktop toast
- on(event, handler)                         // subscribe to desktop events
- every(ms, fn)                              // interval (min 1s), auto-cleaned on disable
- log(...)                                   // console output tagged with the widget name
Events: 'boot', 'app.opened' ({id,name}), 'app.closed', 'startMenu.opened',
'startMenu.closed', 'volume.changed' ({level}), 'weather.updated'.
No imports, no DOM access, no fetch — api.call is the only way out.
Example:
on('boot', () => api.notify('Hello', 'Widget started'));
on('app.opened', ({ id }) => log('opened', id));`;

export const WIDGET_TEMPLATES = [
  {
    id: 'greeting',
    name: 'Greeting.widget.js',
    description: 'Shows a welcome toast when the desktop boots.',
    code: `// Runs once when the desktop starts.\non('boot', () => {\n  api.notify('Welcome back 👋', 'Lithium desktop is ready.');\n});\n`,
  },
  {
    id: 'app-logger',
    name: 'App Launcher Log.widget.js',
    description: 'Announces every app that gets opened.',
    code: `// Fires whenever a desktop app is opened.\non('app.opened', ({ id }) => {\n  log('opened', id);\n  api.notify('App opened', id);\n});\n`,
  },
  {
    id: 'volume-watch',
    name: 'Volume Watch.widget.js',
    description: 'Logs volume changes to the console.',
    code: `on('volume.changed', ({ level }) => {\n  log('volume now', level);\n});\n`,
  },
];

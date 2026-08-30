// Node verification of the full API Manager pipeline (Rust validation → JS
// bridge → handlers → widget execution) through the real app modules.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// --- Browser-environment shims ---
const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
};
globalThis.window = Object.assign(new EventTarget(), { localStorage: globalThis.localStorage });

// file:// fetch shim for the wasm load
const origFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith('file://')) {
    const data = await readFile(fileURLToPath(u));
    return { ok: true, status: 200, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  }
  return origFetch?.(url);
};

await import('./bundled/api-wrapper.js');
const api = globalThis.__api;
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

await api.coreReady();
console.log('engine:', JSON.stringify(api.engineInfo()));

// 1. Catalog
const catalog = await api.getCatalog();
assert(Array.isArray(catalog) && catalog.length >= 27, `catalog too small: ${catalog.length}`);
assert(catalog.some(entry => entry.api === 'settings.set'), 'settings.set missing from catalog');
console.log(`catalog OK (${catalog.length} apis)`);

// 2. Built-in handlers + Rust-validated calls
api.registerBuiltinHandlers();
const info = await api.call('system.get_info', {}, 'user');
assert(info.version && info.engine, 'get_info result: ' + JSON.stringify(info));

let command = null;
window.addEventListener('lithium:api-command', event => { command = event.detail; }, { once: true });
const level = await api.call('system.set_volume', { level: 70 }, 'widget');
assert(level === 70 && command?.cmd === 'set_volume' && command.level === 70, 'set_volume dispatch: ' + JSON.stringify(command));
console.log('builtin handlers OK');

// 3. Rust rejections surface as errors
let rejected = false;
await api.call('system.set_volume', { level: 150 }, 'widget').catch(() => { rejected = true; });
assert(rejected, 'out-of-range volume accepted');

rejected = false;
await api.call('widgets.set_enabled', { id: 'x', enabled: true }, 'widget').catch(() => { rejected = true; });
assert(rejected, 'widget caller allowed to toggle widgets');

rejected = false;
await api.call('settings.set', { path: 'theme.hacked', value: 1 }, 'model').catch(() => { rejected = true; });
assert(rejected, 'unknown settings path accepted');

rejected = false;
await api.call('nope.nope', {}, 'user').catch(() => { rejected = true; });
assert(rejected, 'unknown api accepted');
console.log('rust rejections OK');

// 4. fs.* handlers + Widgets folder
const docs = await api.call('fs.list', { folder: 'default-documents' }, 'user');
assert(docs.some(entry => entry.name === 'Widgets'), 'Widgets folder missing from Documents: ' + JSON.stringify(docs.map(e => e.name)));

const widgetId = await api.call('fs.write', {
  name: 'NodeTest.widget.js',
  parent: 'default-widgets',
  content: "on('boot', () => { api.notify('hello from node widget'); });",
}, 'user');
assert(widgetId, 'widget file not created');
const readBack = await api.call('fs.read', { id: widgetId }, 'user');
assert(readBack.includes('hello from node widget'), 'fs.read mismatch');
console.log('fs handlers OK');

// 5. Widget execution: enable → boot event → widget calls system.notify
const notifications = [];
window.addEventListener('lithium:notify', event => notifications.push(event.detail));
api.setWidgetEnabled(widgetId, true);
assert(api.listWidgets().some(w => w.id === widgetId && w.enabled), 'widget not enabled');
await new Promise(resolve => setTimeout(resolve, 50)); // widget start is async (reads content)
api.emitEvent('boot');
await new Promise(resolve => setTimeout(resolve, 50));
assert(notifications.some(n => n.title === 'hello from node widget'), 'widget did not run on boot: ' + JSON.stringify(notifications));
console.log('widget execution OK');

// 6. Permission class enforced inside widget api calls (widget → widgets.set_enabled denied)
globalThis.__denyProbe = null;
const denyWidgetCode = "on('probe', () => { api.call('widgets.set_enabled', { id: 'x', enabled: true }).catch(() => { globalThis.__denyProbe = true; }); });";
const denyId = await api.call('fs.write', { name: 'DenyProbe.widget.js', parent: 'default-widgets', content: denyWidgetCode }, 'user');
api.setWidgetEnabled(denyId, true);
await new Promise(resolve => setTimeout(resolve, 50));
api.emitEvent('probe');
await new Promise(resolve => setTimeout(resolve, 80));
assert(globalThis.__denyProbe === true, 'widget was not denied widgets.set_enabled');
console.log('widget permission isolation OK');

// 7. Audit log captured everything
const audit = api.getAudit();
assert(audit.length >= 6 && audit.some(e => e.api === 'system.set_volume' && e.caller === 'widget'), 'audit log incomplete');
assert(audit.some(e => !e.ok && e.api === 'system.set_volume'), 'failed call not audited');
console.log(`audit log OK (${audit.length} entries)`);

console.log('API MANAGER VERIFICATION PASSED');

// Node verification: aiBlocks parsing + the exact model→widget install flow.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
};
globalThis.window = Object.assign(new EventTarget(), { localStorage: globalThis.localStorage });

const origFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith('file://')) {
    const data = await readFile(fileURLToPath(u));
    return { ok: true, status: 200, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  }
  return origFetch?.(url);
};

await import('./bundled/blocks-wrapper.js');
const { extractApiCalls, extractWidgetBlocks, stripToolBlocks } = globalThis.__blocks;
const api = globalThis.__api;
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

// --- 1. Block parsing (simulated model reply) ---
const reply = [
  'Sure! Opening Task Manager, and here is a chime widget:',
  '```api',
  '{"api": "apps.open", "params": {"id": "task-manager"}}',
  '```',
  'It also installs a widget:',
  '```widget',
  '// widget: Volume Chime',
  "on('volume.changed', ({ level }) => {",
  "  log('volume', level);",
  "  if (level >= 90) api.notify('Loud!', 'Volume is high');",
  '});',
  '```',
  'Enjoy!',
].join('\n');

const calls = extractApiCalls(reply);
assert(calls.length === 1 && calls[0].api === 'apps.open' && calls[0].params.id === 'task-manager', 'api block parse: ' + JSON.stringify(calls));

const widgets = extractWidgetBlocks(reply);
assert(widgets.length === 1 && widgets[0].name === 'Volume Chime', 'widget name parse: ' + JSON.stringify(widgets.map(w => w.name)));
assert(widgets[0].code.includes("on('volume.changed'"), 'widget code parse');

const stripped = stripToolBlocks(reply);
assert(!stripped.includes('```') && stripped.includes('Opening Task Manager') && stripped.includes('Enjoy!'), 'strip: ' + stripped);

// unnamed widget fallback + filename sanitization
const anon = extractWidgetBlocks('```widget\nlog(1);\n```\n```widget\n// widget: Bad/Name: Here\nlog(2);\n```');
assert(anon[0].name === 'AI Widget 1', 'anon name: ' + anon[0].name);
assert(anon[1].name === 'BadName Here', 'sanitized name: ' + anon[1].name);

// malformed api block skipped, array form supported
const mixed = extractApiCalls('```api\nnot json\n```\n```api\n[{"api":"a.b"},{"api":"c.d","params":{"x":1}}]\n```');
assert(mixed.length === 2 && mixed[1].params.x === 1, 'mixed parse: ' + JSON.stringify(mixed));
console.log('aiBlocks parsing OK');

// --- 2. Model→widget install pipeline (same calls WidgetBlockChips makes) ---
await api.coreReady();
api.registerBuiltinHandlers();

const block = widgets[0];
const fileName = `${block.name}.widget.js`;
const id = await api.call('fs.write', { name: fileName, parent: 'default-widgets', content: block.code }, 'model');
assert(id, 'fs.write as model failed');

api.setWidgetEnabled && null; // (not directly; go through the API like the UI)
const enabled = await api.call('widgets.set_enabled', { id, enabled: true }, 'model');
assert(enabled === true, 'widgets.set_enabled as model failed');
assert(api.listWidgets().some(w => w.id === id && w.enabled), 'widget not enabled after install');

// widget actually runs: trigger the event it listens to and check the log path fires
let notified = false;
window.addEventListener('lithium:notify', event => { if (event.detail.title === 'Loud!') notified = true; });
await new Promise(resolve => setTimeout(resolve, 50)); // let startWidget finish
api.emitEvent('volume.changed', { level: 95 });
await new Promise(resolve => setTimeout(resolve, 50));
assert(notified, 'installed model widget did not react to volume.changed');

// permission boundary still holds: widget code cannot enable other widgets
let denied = false;
globalThis.__denyProbe = null;
const denyCode = "on('probe', () => { api.call('widgets.set_enabled', { id: 'x', enabled: true }).catch(() => { globalThis.__denyProbe = true; }); });";
const denyId = await api.call('fs.write', { name: 'DenyProbe2.widget.js', parent: 'default-widgets', content: denyCode }, 'model');
await api.call('widgets.set_enabled', { id: denyId, enabled: true }, 'model');
await new Promise(resolve => setTimeout(resolve, 50));
api.emitEvent('probe');
await new Promise(resolve => setTimeout(resolve, 80));
assert(globalThis.__denyProbe === true, 'widget escalation not blocked');

// audit shows model calls
const audit = api.getAudit();
assert(audit.some(e => e.caller === 'model' && e.api === 'fs.write'), 'model fs.write not audited');
assert(audit.some(e => e.caller === 'model' && e.api === 'widgets.set_enabled'), 'model enable not audited');
console.log('model→widget install pipeline OK');

console.log('WIDGET-GEN VERIFICATION PASSED');

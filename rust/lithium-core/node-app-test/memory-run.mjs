// Node verification: persistent memory, chat store, and the new fs handlers.
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

await import('./bundled/memory-wrapper.js');
const mem = globalThis.__mem;
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

await mem.coreReady();
mem.registerBuiltinHandlers();

// --- 1. Memory via the API (as the model would) ---
await mem.call('memory.write', { key: 'favorite-color', value: 'purple' }, 'model');
await mem.call('memory.write', { key: 'project', value: 'Lithium desktop OS' }, 'model');
assert(await mem.call('memory.read', { key: 'favorite-color' }, 'model') === 'purple', 'memory.read mismatch');

const list = await mem.call('memory.list', {}, 'widget');
assert(list.length === 2 && list.some(e => e.key === 'project'), 'memory.list: ' + JSON.stringify(list));

assert(mem.memoryDump().includes('favorite-color: purple'), 'memory dump: ' + mem.memoryDump());

await mem.call('memory.write', { key: 'favorite-color', value: 'cyan' }, 'model');
assert(await mem.call('memory.read', { key: 'favorite-color' }, 'model') === 'cyan', 'memory overwrite failed');

await mem.call('memory.delete', { key: 'project' }, 'user');
assert(mem.loadMemory().project === undefined, 'memory.delete failed');

let rejected = false;
await mem.call('memory.read', { key: 'nope' }, 'model').catch(() => { rejected = true; });
assert(rejected, 'missing key read accepted');
console.log('memory API OK');

// --- 2. Chat store ---
const id = mem.makeChatId();
mem.upsertChat({ id, title: 'Test chat', messages: [{ role: 'user', content: 'hi' }], provider: 'builtin' });
mem.upsertChat({ id, title: 'Test chat', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], provider: 'builtin' });
let chats = mem.loadChats();
assert(chats.length === 1 && chats[0].messages.length === 2, 'chat upsert dedupe failed: ' + chats.length);
mem.deleteChat(id);
assert(mem.loadChats().length === 0, 'chat delete failed');
console.log('chat store OK');

// --- 3. New fs handlers ---
const rows = await mem.call('fs.tree', {}, 'model');
assert(rows.some(r => r.path === 'Documents') && rows.some(r => r.path === 'Documents/Widgets'), 'fs.tree structure: ' + JSON.stringify(rows.slice(0, 8)));

const logId = await mem.call('fs.append', { name: 'AI Log.txt', parent: 'default-documents', content: 'line 1\n' }, 'model');
assert(logId, 'fs.append create failed');
await mem.call('fs.append', { name: 'AI Log.txt', parent: 'default-documents', content: 'line 2\n' }, 'model');
const content = await mem.call('fs.read', { id: logId }, 'model');
assert(content === 'line 1\nline 2\n', 'fs.append accumulate: ' + JSON.stringify(content));

await mem.call('fs.rename', { id: logId, name: 'Model Log.txt' }, 'model');
const renamed = await mem.call('fs.tree', { folder: 'default-documents' }, 'model');
assert(renamed.some(r => r.path === 'Model Log.txt'), 'fs.rename failed');

await mem.call('fs.move', { id: logId, parent: 'default-downloads' }, 'model');
const moved = await mem.call('fs.tree', { folder: 'default-downloads' }, 'model');
assert(moved.some(r => r.path === 'Model Log.txt'), 'fs.move failed');

rejected = false;
await mem.call('fs.move', { id: 'default-documents', parent: 'default-documents' }, 'model').catch(() => { rejected = true; });
assert(rejected, 'self-nesting move accepted');
console.log('fs tree/append/move/rename OK');

// --- 4. Audited under the right callers ---
const audit = mem.getAudit();
assert(audit.some(e => e.api === 'memory.write' && e.caller === 'model'), 'memory.write not audited as model');
console.log(`audit OK (${audit.length} entries)`);

console.log('MEMORY + CHATS VERIFICATION PASSED');

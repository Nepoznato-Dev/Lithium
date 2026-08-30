// Node verification: kvTier migration, overflow, and clobber protection.
const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.window = Object.assign(new EventTarget(), { localStorage: globalThis.localStorage });

// Minimal in-memory IndexedDB shim (resolves tx.oncomplete like the real API).
const kvStore = new Map();
globalThis.indexedDB = {
  open: () => {
    const request = {
      onupgradeneeded: null, onsuccess: null, onerror: null,
      result: {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        transaction: () => {
          const tx = { oncomplete: null, onerror: null, onabort: null };
          const op = fn => {
            const req = { result: undefined };
            setTimeout(() => {
              req.result = fn();
              tx.oncomplete?.();
            }, 0);
            return req;
          };
          tx.objectStore = () => ({
            get: key => op(() => kvStore.get(key)),
            put: (value, key) => op(() => kvStore.set(key, value)),
            delete: key => op(() => kvStore.delete(key)),
            getAll: () => op(() => [...kvStore.values()]),
            getAllKeys: () => op(() => [...kvStore.keys()]),
          });
          return tx;
        },
      },
    };
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  },
};

await import('./bundled/kv-wrapper.js');
const { hydrateKv, kvGet, kvSet } = globalThis.__kv;
const { loadChats, upsertChat, deleteChat } = globalThis.__chats;
const assert = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log('ok —', msg); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1. Plant a bulky legacy chat list in localStorage (pre-migration state).
const bigChats = [{ id: 'chat-old', title: 'big', messages: [{ role: 'user', content: 'x'.repeat(40000) }], updatedAt: 1 }];
globalThis.localStorage.setItem('lithium:ai-chats', JSON.stringify(bigChats));

// 2. Hydration migrates the bulky value into overflow + IndexedDB.
await hydrateKv();
await sleep(40);
assert(kvGet('ai-chats')?.[0]?.id === 'chat-old', 'bulky legacy value hydrated into memory');
assert(kvStore.has('kvx:ai-chats'), 'bulky value migrated into IndexedDB');
assert(globalThis.localStorage.getItem('lithium:ai-chats') === null, 'LS copy dropped only after durable IDB write');

// 3. Overflow path: write a big value (post-ready) and confirm it moves.
kvSet('big-key', { payload: 'y'.repeat(60000) });
await sleep(20);
assert(globalThis.localStorage.getItem('lithium:big-key') === null, 'big value removed from localStorage');
assert(kvStore.has('kvx:big-key'), 'big value landed in IndexedDB kv store');
assert(kvGet('big-key').payload.length === 60000, 'big value readable via kvGet');

// 4. Small values stay in localStorage.
kvSet('small-key', [1, 2, 3]);
await sleep(10);
assert(globalThis.localStorage.getItem('lithium:small-key') === '[1,2,3]', 'small value stays in localStorage');

// 5. Re-hydration is idempotent and keeps values.
const secondHydrate = await hydrateKv();
assert(secondHydrate === true, 'hydrateKv idempotent');
assert(kvGet('big-key').payload.length === 60000, 'overflow value survives re-hydrate');

// 6. Chat guard: deleting an unknown id must not wipe the store.
upsertChat({ id: 'chat-a', title: 'A', messages: [], provider: 'builtin' });
deleteChat('does-not-exist');
assert(loadChats().some(chat => chat.id === 'chat-a'), 'unknown-id delete does not wipe chats');
deleteChat('chat-a');
assert(!loadChats().some(chat => chat.id === 'chat-a'), 'real delete works');

console.log('\nALL KV TIER TESTS PASSED');

// ../../../src/lib/idb.js
var DB_NAME = "lithium-storage";
var DB_VERSION = 1;
var dbPromise = null;
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("cacheLedger")) db.createObjectStore("cacheLedger");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}
async function withStore(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
var idbPut = (store, key, value) => withStore(store, "readwrite", (s) => s.put(value, key));
var idbDelete = (store, key) => withStore(store, "readwrite", (s) => s.delete(key));
var idbKeys = (store) => withStore(store, "readonly", (s) => s.getAllKeys());
var idbAll = (store) => withStore(store, "readonly", (s) => s.getAll());

// ../../../src/lib/storage.js
var PREFIX = "lithium:";
var storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
    }
  }
};

// ../../../src/lib/kvTier.js
var PREFIX2 = "kvx:";
var LOCAL_PREFIX = "lithium:";
var OVERFLOW_THRESHOLD = 32 * 1024;
var KV_READY_EVENT = "lithium:kv-ready";
var overflow = /* @__PURE__ */ new Map();
var hydratePromise = null;
var ready = false;
function hydrateKv() {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const [keys, values] = await Promise.all([idbKeys("kv"), idbAll("kv")]);
        keys.forEach((key, index) => {
          if (typeof key === "string" && key.startsWith(PREFIX2)) {
            const real = key.slice(PREFIX2.length);
            overflow.set(real, values[index]);
            storage.remove(real);
          }
        });
      } catch {
      }
      try {
        const candidates = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const rawKey = localStorage.key(i);
          if (rawKey && rawKey.startsWith(LOCAL_PREFIX)) candidates.push(rawKey);
        }
        for (const rawKey of candidates) {
          const key = rawKey.slice(LOCAL_PREFIX.length);
          if (overflow.has(key)) continue;
          const raw = localStorage.getItem(rawKey) || "";
          if (raw.length < OVERFLOW_THRESHOLD) continue;
          overflow.set(key, raw);
          idbPut("kv", PREFIX2 + key, raw).then(() => storage.remove(key)).catch(() => overflow.delete(key));
        }
      } catch {
      }
      ready = true;
      window.dispatchEvent(new Event(KV_READY_EVENT));
      return true;
    })();
  }
  return hydratePromise;
}
function kvGet(key, fallback = null) {
  if (overflow.has(key)) {
    try {
      return JSON.parse(overflow.get(key));
    } catch {
      return fallback;
    }
  }
  return storage.get(key, fallback);
}
function kvSet(key, value) {
  if (!ready) {
    hydrateKv().then(() => kvSet(key, value)).catch(() => {
    });
    return;
  }
  const json = JSON.stringify(value);
  if (json.length >= OVERFLOW_THRESHOLD) {
    overflow.set(key, json);
    storage.remove(key);
    idbPut("kv", PREFIX2 + key, json).catch(() => {
    });
  } else {
    if (overflow.delete(key)) {
      idbDelete("kv", PREFIX2 + key).catch(() => {
      });
    }
    storage.set(key, value);
  }
}

// ../../../src/lib/chats.js
var KEY = "ai-chats";
var MAX_CHATS = 30;
function loadChats() {
  return kvGet(KEY, []);
}
function saveChats(list) {
  kvSet(KEY, list.slice(0, MAX_CHATS));
}
function upsertChat(chat) {
  const list = loadChats().filter((item) => item.id !== chat.id);
  list.unshift({ ...chat, updatedAt: Date.now() });
  saveChats(list);
}
function deleteChat(id) {
  const current = loadChats();
  if (!current.some((chat) => chat.id === id)) return;
  saveChats(current.filter((chat) => chat.id !== id));
}

// kv-wrapper.js
globalThis.__kv = { hydrateKv, kvGet, kvSet };
globalThis.__chats = { loadChats, upsertChat, deleteChat };

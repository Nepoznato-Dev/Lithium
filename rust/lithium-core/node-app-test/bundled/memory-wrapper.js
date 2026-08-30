// ../../../src/lib/core.js
var exportsRef = null;
var readyPromise = null;
function coreReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const response = await fetch(new URL("../wasm/lithium_core.wasm", import.meta.url));
        if (!response.ok) throw new Error(`wasm fetch ${response.status}`);
        const bytes = await response.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        exportsRef = instance.exports;
      } catch {
        exportsRef = null;
      }
      return exportsRef;
    })();
  }
  return readyPromise;
}
function hasWasm() {
  return Boolean(exportsRef);
}
var mem = () => new Uint8Array(exportsRef.memory.buffer);
function toWasm(u8) {
  const ptr = exportsRef.alloc(u8.length);
  mem().set(u8, ptr);
  return ptr;
}
function fromOut(len) {
  const ptr = exportsRef.out_ptr();
  return mem().slice(ptr, ptr + len);
}
async function wasmCompress(u8) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const len = wasm.lz4_compress(toWasm(u8), u8.length);
  return len ? fromOut(len) : null;
}
async function wasmDecompress(u8) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const inPtr = toWasm(u8);
  const orig = wasm.lz4_uncompressed_size(inPtr, u8.length);
  if (!orig) return null;
  const outPtr = wasm.alloc(orig);
  const written = wasm.lz4_decompress_into(inPtr, u8.length, outPtr, orig);
  if (!written) return null;
  return mem().slice(outPtr, outPtr + written);
}
async function wasmHash(u8) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const value = wasm.xxh3(toWasm(u8), u8.length);
  return BigInt.asUintN(64, value).toString(16).padStart(16, "0");
}
async function snapshotEncode(jsonString) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const bytes = new TextEncoder().encode(jsonString);
  const len = wasm.snapshot_encode(toWasm(bytes), bytes.length);
  return len ? fromOut(len) : null;
}
async function snapshotDecode(bin) {
  const wasm = await coreReady();
  if (!wasm) return null;
  const len = wasm.snapshot_decode(toWasm(bin), bin.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}
function callStr(fn, text) {
  const bytes = new TextEncoder().encode(text);
  const len = fn(toWasm(bytes), bytes.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}
function fsOpSync(request2) {
  if (!exportsRef) return null;
  try {
    const out = callStr(exportsRef.fs_op, JSON.stringify(request2));
    return out ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}
function apiValidateSync(request2) {
  if (!exportsRef) return null;
  try {
    const out = callStr(exportsRef.api_validate, JSON.stringify(request2));
    return out ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

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

// ../../../src/lib/apiManager.js
var HANDLERS = /* @__PURE__ */ new Map();
var EVENT_SUBS = /* @__PURE__ */ new Map();
var AUDIT_KEY = "api-audit";
var AUDIT_CAP = 200;
function registerHandler(api, fn) {
  HANDLERS.set(api, fn);
}
async function call(api, params = {}, caller = "user") {
  await coreReady();
  let normalized = params;
  const verdict = apiValidateSync({ api, params, caller });
  if (verdict) {
    if (!verdict.ok) {
      audit(api, caller, false, verdict.error);
      throw new Error(verdict.error);
    }
    normalized = verdict.params || {};
  } else if (!HANDLERS.has(api)) {
    audit(api, caller, false, "unknown api");
    throw new Error(`unknown api '${api}'`);
  }
  const handler = HANDLERS.get(api);
  if (!handler) {
    audit(api, caller, false, "no handler registered");
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
function emitEvent(name, detail = {}) {
  const subs = EVENT_SUBS.get(name);
  if (subs) {
    for (const fn of subs) {
      try {
        fn(detail);
      } catch {
      }
    }
  }
  window.dispatchEvent(new CustomEvent(`lithium:event:${name}`, { detail }));
}
function onEvent(name, fn) {
  if (!EVENT_SUBS.has(name)) EVENT_SUBS.set(name, /* @__PURE__ */ new Set());
  EVENT_SUBS.get(name).add(fn);
  return () => EVENT_SUBS.get(name)?.delete(fn);
}
function audit(api, caller, ok, error = "") {
  const log = storage.get(AUDIT_KEY, []);
  log.unshift({ t: Date.now(), api, caller, ok, error: error || void 0 });
  storage.set(AUDIT_KEY, log.slice(0, AUDIT_CAP));
  window.dispatchEvent(new Event("lithium:api-audit"));
}
function getAudit() {
  return storage.get(AUDIT_KEY, []);
}

// ../../../src/lib/notify.js
var EVENT_NAME = "lithium:notify";
function notify({ title, body = "", tone = "info" }) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { title, body, tone, id: Date.now() + Math.random() } }));
}

// ../../../src/lib/settings.js
var BUILD_VERSION = "v2.0.0";

// ../../../src/lib/idb.js
var DB_NAME = "lithium-storage";
var DB_VERSION = 1;
var dbPromise = null;
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request2 = indexedDB.open(DB_NAME, DB_VERSION);
      request2.onupgradeneeded = () => {
        const db = request2.result;
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("cacheLedger")) db.createObjectStore("cacheLedger");
      };
      request2.onsuccess = () => resolve(request2.result);
      request2.onerror = () => reject(request2.error);
    });
  }
  return dbPromise;
}
async function withStore(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request2 = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request2?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
var idbGet = (store, key) => withStore(store, "readonly", (s) => s.get(key));
var idbPut = (store, key, value) => withStore(store, "readwrite", (s) => s.put(value, key));
var idbDelete = (store, key) => withStore(store, "readwrite", (s) => s.delete(key));

// ../../../src/lib/storageManager.js
var IDB_CAP = 15 * 1024 ** 3;
var CACHE_CAP = 10 * 1024 ** 3;
var LOCAL_CAP = 5 * 1024 ** 2;
async function idbUsage() {
  return await idbGet("kv", "idbUsage") || 0;
}
async function setIdbUsage(value) {
  await idbPut("kv", "idbUsage", Math.max(0, value));
}
async function putBlob(id, data, meta = {}) {
  const size = data instanceof Blob ? data.size : data.length * 2;
  const usage = await idbUsage();
  if (usage + size > IDB_CAP) throw new Error("IndexedDB limit (15 GB) reached");
  await idbPut("blobs", id, { data, size, ...meta, updatedAt: Date.now() });
  await setIdbUsage(usage + size);
}
async function getBlob(id) {
  const record = await idbGet("blobs", id);
  return record?.data ?? null;
}
async function deleteBlob(id) {
  const record = await idbGet("blobs", id);
  if (!record) return;
  await idbDelete("blobs", id);
  await setIdbUsage(await idbUsage() - (record.size || 0));
}

// ../../../src/lib/unifiedStore.js
var POINTER_KEY = "fs-pointer";
var SNAP_PREFIX = "fs-snap-";
var SAVE_DEBOUNCE = 350;
var tree = null;
var hydrated = false;
var hadData = false;
var hydratePromise = null;
var saveTimer = null;
var lastStats = null;
var seeder = null;
function registerSeeder(fn) {
  seeder = fn;
}
function getTree() {
  return tree || [];
}
function hydrate() {
  if (!hydratePromise) hydratePromise = doHydrate();
  return hydratePromise;
}
async function readSnapshot(pointer) {
  if (!pointer?.key) return null;
  const blob = await getBlob(pointer.key);
  if (!blob) return null;
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (pointer.hash) {
    const hash = await wasmHash(buf);
    if (hash && hash !== pointer.hash) return null;
  }
  if (pointer.binary) {
    const bin = pointer.raw ? buf : await wasmDecompress(buf);
    if (!bin) return null;
    const json = await snapshotDecode(bin);
    if (!json) return null;
    return { entries: JSON.parse(json), pointer };
  }
  return { entries: JSON.parse(new TextDecoder().decode(buf)), pointer };
}
async function doHydrate() {
  await coreReady();
  const pointer = await idbGet("kv", POINTER_KEY).catch(() => null);
  let loaded = null;
  if (pointer) loaded = await readSnapshot(pointer).catch(() => null);
  if (!loaded && pointer?.prevKey) {
    loaded = await readSnapshot({ ...pointer, key: pointer.prevKey, hash: null }).catch(() => null);
  }
  if (loaded) {
    tree = loaded.entries;
    hadData = true;
    lastStats = loaded.pointer;
  } else if (pointer?.key) {
    hadData = true;
  }
  if (!loaded) {
    const legacy = storage.get("fs", null);
    if (Array.isArray(legacy) && legacy.length > 0) {
      tree = legacy;
      hadData = true;
    }
  }
  if (seeder) {
    const seeded = seeder(tree, hadData);
    if (seeded) tree = seeded;
  }
  if (tree === null) tree = [];
  hydrated = true;
  window.dispatchEvent(new Event("lithium:fs-changed"));
  if (hadData || tree.length) persistNow().catch(() => {
  });
  return tree;
}
function setTree(next, { persist = true } = {}) {
  tree = next;
  window.dispatchEvent(new Event("lithium:fs-changed"));
  if (persist) scheduleSave();
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistNow().catch(() => {
  }), SAVE_DEBOUNCE);
}
async function persistNow() {
  if (!hydrated && !tree) return null;
  const entries = tree || [];
  const jsonBytes = new TextEncoder().encode(JSON.stringify(entries));
  let payload = jsonBytes;
  let raw = true;
  let binary = false;
  if (hasWasm()) {
    const bin = await snapshotEncode(new TextDecoder().decode(jsonBytes));
    if (bin) {
      binary = true;
      const compressed = await wasmCompress(bin);
      if (compressed) {
        payload = compressed;
        raw = false;
      } else {
        payload = bin;
      }
    }
  }
  const hash = await wasmHash(payload);
  const key = SNAP_PREFIX + Date.now();
  const previous = await idbGet("kv", POINTER_KEY);
  await putBlob(key, new Blob([payload]), { name: "lithium-fs-snapshot" });
  const pointer = {
    key,
    prevKey: previous?.key || null,
    raw,
    binary,
    hash,
    rawSize: jsonBytes.length,
    compSize: payload.length,
    engine: binary ? raw ? "wasm-bin" : "wasm-bin+lz4" : "json",
    at: Date.now()
  };
  await idbPut("kv", POINTER_KEY, pointer);
  if (pointer.prevKey && pointer.prevKey !== key) {
    await deleteBlob(pointer.prevKey).catch(() => {
    });
  }
  storage.remove("fs");
  lastStats = pointer;
  return pointer;
}

// ../../../src/lib/fileSystem.js
var INLINE_LIMIT = 3e5;
function defaultTree() {
  const now = Date.now();
  const root = { id: "root", name: "Home", type: "folder", parentId: null, createdAt: now, updatedAt: now };
  const folders = ["Desktop", "Downloads", "Documents", "Pictures", "Music", "Videos", "Notes"].map((name) => ({
    id: `default-${name.toLowerCase()}`,
    name,
    type: "folder",
    parentId: "root",
    createdAt: now,
    updatedAt: now
  }));
  const welcome = {
    id: "default-readme",
    name: "Welcome.txt",
    type: "text",
    parentId: "default-documents",
    content: "Welcome to Lithium!\n\nThis is your personal file space. Everything here is stored\nlocally in this browser \u2014 create folders, write notes, and\nsave photos from the Photos app.",
    createdAt: now,
    updatedAt: now
  };
  const notesFolder = folders.find((folder) => folder.name === "Notes");
  if (notesFolder) notesFolder.parentId = "default-documents";
  folders.push({
    id: "default-widgets",
    name: "Widgets",
    type: "folder",
    parentId: "default-documents",
    createdAt: now,
    updatedAt: now
  });
  return [root, ...folders, welcome];
}
function loadTree() {
  return getTree();
}
function saveTree(tree2) {
  setTree(tree2);
}
registerSeeder((current, hadData2) => {
  if (!hadData2 && (!current || current.length === 0)) return defaultTree();
  if (!Array.isArray(current) || current.length === 0) return null;
  const now = Date.now();
  let changed = false;
  const next = [...current];
  for (const entry of defaultTree()) {
    if (entry.type === "folder" && entry.id !== "root" && !next.some((item) => item.id === entry.id)) {
      next.push({ ...entry, createdAt: now, updatedAt: now });
      changed = true;
    }
  }
  const notesIndex = next.findIndex((entry) => entry.id === "default-notes");
  if (notesIndex >= 0 && next[notesIndex].parentId === "root") {
    next[notesIndex] = { ...next[notesIndex], parentId: "default-documents" };
    changed = true;
  }
  return changed ? next : null;
});
function getEntry(tree2, id) {
  return tree2.find((entry) => entry.id === id) || null;
}
function childrenOf(tree2, folderId) {
  return tree2.filter((entry) => entry.parentId === folderId).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1);
}
function makeId() {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createEntry(tree2, { name, type, parentId, content = "" }) {
  const now = Date.now();
  const entry = { id: makeId(), name, type, parentId, content, createdAt: now, updatedAt: now };
  return [...tree2, entry];
}
function updateEntry(tree2, id, changes) {
  return tree2.map((entry) => entry.id === id ? { ...entry, ...changes, updatedAt: Date.now() } : entry);
}
function canMoveInto(tree2, id, parentId) {
  if (id === parentId) return false;
  return !doomedIds(tree2, id).has(parentId);
}
function moveEntry(tree2, id, parentId) {
  if (!canMoveInto(tree2, id, parentId)) return tree2;
  const native = fsOpSync({ op: "move", tree: tree2, id, parentId, now: Date.now() });
  if (native) return native;
  return updateEntry(tree2, id, { parentId });
}
function doomedList(tree2, id) {
  const native = fsOpSync({ op: "doomed", tree: tree2, id });
  if (native) return new Set(native);
  return doomedIds(tree2, id);
}
function doomedIds(tree2, id) {
  const doomed = /* @__PURE__ */ new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of tree2) {
      if (entry.parentId && doomed.has(entry.parentId) && !doomed.has(entry.id)) {
        doomed.add(entry.id);
        grew = true;
      }
    }
  }
  return doomed;
}
async function storeEntryContent(entry, content) {
  if (content && (entry.type === "image" || entry.type === "file" || content.length > INLINE_LIMIT)) {
    await putBlob(entry.id, content, { name: entry.name });
    return { ...entry, content: null, idb: true, size: content.length * 2 };
  }
  return { ...entry, content: content || "", idb: false, size: (content || "").length * 2 };
}
async function readEntryContent(entry) {
  if (entry.idb) return await getBlob(entry.blobRef || entry.id) || "";
  return entry.content || "";
}
async function removeEntryDeep(tree2, id) {
  const doomed = doomedList(tree2, id);
  await Promise.all(
    tree2.filter((entry) => doomed.has(entry.id) && entry.idb && !entry.blobRef).map((entry) => deleteBlob(entry.id))
  );
  return tree2.filter((entry) => !doomed.has(entry.id));
}

// ../../../src/lib/memory.js
var KEY = "ai-memory";
var CAP = 200;
var VALUE_CAP = 2e3;
function loadMemory() {
  return storage.get(KEY, {});
}
function save(memory) {
  storage.set(KEY, memory);
  emitEvent("memory.changed", { keys: Object.keys(memory) });
  window.dispatchEvent(new Event("lithium:memory-changed"));
}
function readMemory(key) {
  return loadMemory()[key]?.value ?? null;
}
function writeMemory(key, value) {
  const cleanKey = String(key || "").trim().slice(0, 64);
  if (!cleanKey) throw new Error("memory key must not be empty");
  const memory = loadMemory();
  memory[cleanKey] = { value: String(value ?? "").slice(0, VALUE_CAP), updatedAt: Date.now() };
  const keys = Object.keys(memory);
  if (keys.length > CAP) {
    keys.sort((a, b) => (memory[a].updatedAt || 0) - (memory[b].updatedAt || 0)).slice(0, keys.length - CAP).forEach((oldest) => delete memory[oldest]);
  }
  save(memory);
  return cleanKey;
}
function deleteMemory(key) {
  const memory = loadMemory();
  if (!(key in memory)) throw new Error(`no memory entry '${key}'`);
  delete memory[key];
  save(memory);
}
function memoryDump(maxEntries = 40) {
  const memory = loadMemory();
  const keys = Object.keys(memory).sort((a, b) => (memory[b].updatedAt || 0) - (memory[a].updatedAt || 0)).slice(0, maxEntries);
  if (!keys.length) return "(empty)";
  return keys.map((key) => `- ${key}: ${memory[key].value}`).join("\n");
}

// ../../../src/lib/deviceContext.js
function loadWeatherCache() {
  return storage.get("weather-cache", null);
}

// ../../../src/lib/aiProviders.js
var AI_PROVIDERS = {
  builtin: { label: "On-device engine", needsKey: false, model: "built-in reports" },
  groq: { label: "Groq", needsKey: true, model: "llama-3.3-70b-versatile" },
  openai: { label: "OpenAI", needsKey: true, model: "gpt-4o-mini" },
  anthropic: { label: "Anthropic", needsKey: true, model: "claude-3-5-haiku-latest" },
  google: { label: "Google", needsKey: true, model: "gemini-2.0-flash" },
  xai: { label: "Grok (xAI)", needsKey: true, model: "grok-3-mini" }
};
function loadKeys() {
  return storage.get("ai-keys", {});
}

// ../../../src/lib/models.js
var MODEL_CATALOG = [
  {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    params: "0.6B",
    quant: "Q4_K_M",
    size: 468e6,
    tier: "lite",
    url: "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf",
    blurb: "Tiny but sharp \u2014 great for summaries, time & weather reports."
  },
  {
    id: "qwen2.5-1.5b",
    name: "Qwen2.5 1.5B Instruct",
    params: "1.5B",
    quant: "Q4_K_M",
    size: 11e8,
    tier: "efficient",
    url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    blurb: "Balanced instruction follower for everyday assistant tasks (MMLU 74)."
  },
  {
    id: "gemma-4-e2b",
    name: "Gemma 4 E2B-it",
    params: "E2B",
    quant: "Q4_K_M",
    size: 3106738272,
    tier: "efficient",
    url: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
    blurb: "Fast multimodal model (image/audio/video aware) \u2014 text chat in Lithium for now."
  },
  {
    id: "smollm3-3b",
    name: "SmolLM3 3B",
    params: "3B",
    quant: "Q4_K_M",
    size: 195e7,
    tier: "performance",
    url: "https://huggingface.co/mradermacher/SmolLM3-3B-GGUF/resolve/main/SmolLM3-3B.Q4_K_M.gguf",
    blurb: "Hugging Face\u2019s smol 3B-class leader with 128k context."
  },
  {
    id: "phi-4-mini",
    name: "Phi-4-mini",
    params: "3.8B",
    quant: "Q4_K_M",
    size: 25e8,
    tier: "performance",
    url: "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf",
    blurb: "Microsoft\u2019s compact reasoner \u2014 MMLU 73 / MATH 62 at half the memory of 8B models."
  },
  {
    id: "qwen3-4b",
    name: "Qwen3 4B Instruct-2507",
    params: "4B",
    quant: "Q4_K_M",
    size: 2497281120,
    tier: "ultra",
    url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    blurb: "Thinking mode for complex tasks \u2014 MATH-500 97, strongest in the lineup."
  }
];
var META_KEY = "models";
function loadModelMeta() {
  return storage.get(META_KEY, {});
}
var getTier = () => storage.get("ai-tier", "lite");
var setTier = (id) => storage.set("ai-tier", id);

// ../../../src/lib/cloudDrives.js
var KEY2 = "cloud-drives";
function loadDriveConfigs() {
  return storage.get(KEY2, []);
}
var CloudAuthError = class extends Error {
  constructor(provider, detail) {
    super(detail || "Sign-in expired or token invalid");
    this.name = "CloudAuthError";
    this.provider = provider;
    this.auth = true;
  }
};
function entryType(mime, name) {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("text/") || mime === "application/json" || /\.(txt|md|json|csv|log|html?)$/i.test(name || "")) return "text";
  return "file";
}
async function request(url, config, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${config.token}`, ...options.headers || {} }
  });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.error?.message || body.error?.message || "";
    } catch {
    }
    if (response.status === 401 || response.status === 403) {
      throw new CloudAuthError(config.provider, detail);
    }
    throw new Error(detail || `${config.provider} request failed (${response.status})`);
  }
  return response;
}
async function listChildren(config, folderId) {
  if (config.provider === "gdrive") {
    const parent = folderId || "root";
    const query = encodeURIComponent(`'${parent}' in parents and trashed=false`);
    const response2 = await request(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size)&pageSize=1000`,
      config
    );
    const data2 = await response2.json();
    return (data2.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      type: file.mimeType === "application/vnd.google-apps.folder" ? "folder" : entryType(file.mimeType, file.name),
      size: Number(file.size || 0),
      mime: file.mimeType
    })).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1);
  }
  const url = folderId ? `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$top=1000` : "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=1000";
  const response = await request(url, config);
  const data = await response.json();
  return (data.value || []).map((file) => ({
    id: file.id,
    name: file.name,
    type: file.folder ? "folder" : entryType(file.file?.mimeType, file.name),
    size: file.size || 0,
    mime: file.file?.mimeType
  })).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1);
}
function testConnection(config) {
  return listChildren(config, null);
}

// ../../../src/lib/widgetRuntime.js
var WIDGETS_FOLDER_ID = "default-widgets";
var ENABLED_KEY = "widgets-enabled";
var running = /* @__PURE__ */ new Map();
function widgetEntries() {
  return childrenOf(loadTree(), WIDGETS_FOLDER_ID).filter(
    (entry) => entry.type === "text" && entry.name.endsWith(".widget.js")
  );
}
function listWidgets() {
  const enabled = storage.get(ENABLED_KEY, []);
  return widgetEntries().map((entry) => ({
    id: entry.id,
    name: entry.name.replace(/\.widget\.js$/, ""),
    enabled: enabled.includes(entry.id),
    running: running.has(entry.id)
  }));
}
async function startWidget(id) {
  if (running.has(id)) return;
  const entry = widgetEntries().find((item) => item.id === id);
  if (!entry) return;
  const ctx = { timers: [], unsubs: [] };
  const api = {
    call: (name, params = {}) => call(name, params, "widget"),
    notify: (title, body = "") => call("system.notify", { title, body }, "widget")
  };
  const on = (event, fn) => ctx.unsubs.push(onEvent(event, fn));
  const every = (ms, fn) => ctx.timers.push(setInterval(() => {
    try {
      fn();
    } catch {
    }
  }, Math.max(1e3, ms)));
  const log = (...args) => console.info(`[widget:${entry.name}]`, ...args);
  try {
    const code = await readEntryContent(entry);
    const factory = new Function("api", "on", "every", "log", `"use strict";
${code}`);
    factory(api, on, every, log);
    running.set(id, ctx);
  } catch (err) {
    notify({ title: "Widget error", body: `${entry.name}: ${err.message}`, tone: "warning" });
  }
}
function stopWidget(id) {
  const ctx = running.get(id);
  if (!ctx) return;
  ctx.timers.forEach((timer) => clearInterval(timer));
  ctx.unsubs.forEach((unsub) => unsub());
  running.delete(id);
}
function setWidgetEnabled(id, enabled) {
  if (!widgetEntries().some((entry) => entry.id === id)) {
    throw new Error(`no widget '${id}'`);
  }
  const list = new Set(storage.get(ENABLED_KEY, []));
  if (enabled) list.add(id);
  else list.delete(id);
  storage.set(ENABLED_KEY, [...list]);
  if (enabled) startWidget(id);
  else stopWidget(id);
  window.dispatchEvent(new Event("lithium:widgets-changed"));
  return enabled;
}

// ../../../src/lib/apiBuiltins.js
var dispatch = (detail) => window.dispatchEvent(new CustomEvent("lithium:api-command", { detail }));
var registered = false;
function registerBuiltinHandlers() {
  if (registered) return;
  registered = true;
  registerHandler("system.get_info", () => ({
    version: BUILD_VERSION,
    time: (/* @__PURE__ */ new Date()).toISOString(),
    engine: hasWasm() ? "rust-wasm" : "js-fallback",
    platform: navigator.platform,
    online: navigator.onLine
  }));
  registerHandler("system.open_start_menu", () => dispatch({ cmd: "open_start_menu" }));
  registerHandler("system.close_start_menu", () => dispatch({ cmd: "close_start_menu" }));
  registerHandler("system.show_desktop", () => dispatch({ cmd: "show_desktop" }));
  registerHandler("system.get_volume", () => storage.get("desktop-sound-level", 50));
  registerHandler("system.set_volume", ({ level }) => {
    dispatch({ cmd: "set_volume", level });
    return level;
  });
  registerHandler("system.notify", ({ title, body = "", tone = "info" }) => {
    notify({ title, body, tone });
    return true;
  });
  registerHandler("fs.list", async ({ folder = "root" }) => {
    await hydrate();
    return childrenOf(loadTree(), folder).map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      size: entry.size || 0
    }));
  });
  registerHandler("fs.read", async ({ id }) => {
    await hydrate();
    const entry = getEntry(loadTree(), id);
    if (!entry) throw new Error(`no entry '${id}'`);
    return readEntryContent(entry);
  });
  registerHandler("fs.write", async ({ name, parent = "root", content = "" }) => {
    await hydrate();
    const tree2 = loadTree();
    const existing = childrenOf(tree2, parent).find((entry) => entry.name === name);
    if (existing) {
      saveTree(updateEntry(tree2, existing.id, { content, idb: false, size: content.length * 2 }));
      return existing.id;
    }
    const next = createEntry(tree2, { name, type: "text", parentId: parent, content });
    saveTree(next);
    return next[next.length - 1].id;
  });
  registerHandler("fs.create_folder", async ({ name, parent = "root" }) => {
    await hydrate();
    const tree2 = loadTree();
    const next = createEntry(tree2, { name, type: "folder", parentId: parent });
    saveTree(next);
    return next[next.length - 1].id;
  });
  registerHandler("fs.delete", async ({ id }) => {
    await hydrate();
    saveTree(await removeEntryDeep(loadTree(), id));
    return true;
  });
  registerHandler("fs.tree", async ({ folder = "root" }) => {
    await hydrate();
    const tree2 = loadTree();
    const rows = [];
    const walk = (folderId, prefix) => {
      for (const entry of childrenOf(tree2, folderId)) {
        if (rows.length >= 500) return;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        rows.push({ id: entry.id, path, type: entry.type, size: entry.size || 0 });
        if (entry.type === "folder") walk(entry.id, path);
      }
    };
    walk(folder, "");
    return rows;
  });
  registerHandler("fs.append", async ({ name, parent = "root", content = "" }) => {
    await hydrate();
    let tree2 = loadTree();
    const existing = childrenOf(tree2, parent).find((entry) => entry.name === name);
    if (existing) {
      if (existing.blobRef) throw new Error("cannot append to an externally-owned file");
      const current = await readEntryContent(existing);
      const updated2 = await storeEntryContent(existing, `${current}${content}`);
      saveTree(updateEntry(tree2, existing.id, { ...updated2, updatedAt: Date.now() }));
      return existing.id;
    }
    tree2 = createEntry(tree2, { name, type: "text", parentId: parent, content: "" });
    const created = tree2[tree2.length - 1];
    const updated = await storeEntryContent(created, content);
    saveTree(updateEntry(tree2, created.id, updated));
    return created.id;
  });
  registerHandler("fs.move", async ({ id, parent }) => {
    await hydrate();
    const tree2 = loadTree();
    if (!getEntry(tree2, id)) throw new Error(`no entry '${id}'`);
    if (!canMoveInto(tree2, id, parent)) throw new Error(`cannot move '${id}' into '${parent}' (missing target or self-nesting)`);
    saveTree(moveEntry(tree2, id, parent));
    return true;
  });
  registerHandler("fs.rename", async ({ id, name }) => {
    await hydrate();
    const tree2 = loadTree();
    if (!getEntry(tree2, id)) throw new Error(`no entry '${id}'`);
    const clean = String(name || "").trim();
    if (!clean) throw new Error("name must not be empty");
    saveTree(updateEntry(tree2, id, { name: clean }));
    return true;
  });
  registerHandler("weather.get", () => {
    const cached = loadWeatherCache();
    if (!cached?.data) throw new Error("no weather data yet (open the taskbar widget)");
    return cached;
  });
  registerHandler("ai.list_providers", () => {
    const keys = loadKeys();
    return Object.entries(AI_PROVIDERS).map(([id, provider]) => ({
      id,
      label: provider.label,
      hasKey: Boolean(keys[id]),
      needsKey: provider.needsKey
    }));
  });
  registerHandler("ai.get_tier", () => getTier());
  registerHandler("ai.set_tier", ({ tier }) => {
    setTier(tier);
    return tier;
  });
  registerHandler("models.list", () => {
    const meta = loadModelMeta();
    return MODEL_CATALOG.map((model) => ({
      id: model.id,
      name: model.name,
      tier: model.tier,
      size: model.size,
      downloaded: Boolean(meta[model.id])
    }));
  });
  registerHandler(
    "cloud.list_drives",
    () => loadDriveConfigs().map((config) => ({
      id: config.id,
      provider: config.provider,
      label: config.label,
      letter: config.letter
    }))
  );
  registerHandler("cloud.test_drive", async ({ id }) => {
    const config = loadDriveConfigs().find((item) => item.id === id);
    if (!config) throw new Error(`no drive '${id}'`);
    await testConnection(config);
    return true;
  });
  registerHandler("memory.list", () => Object.entries(loadMemory()).map(([key, entry]) => ({ key, updatedAt: entry.updatedAt })));
  registerHandler("memory.read", ({ key }) => {
    const value = readMemory(key);
    if (value === null) throw new Error(`no memory entry '${key}'`);
    return value;
  });
  registerHandler("memory.write", ({ key, value }) => writeMemory(key, value));
  registerHandler("memory.delete", ({ key }) => {
    deleteMemory(key);
    return true;
  });
  registerHandler("widgets.list", () => listWidgets());
  registerHandler("widgets.set_enabled", ({ id, enabled }) => setWidgetEnabled(id, enabled));
}

// ../../../src/lib/chats.js
var KEY3 = "ai-chats";
var MAX_CHATS = 30;
function loadChats() {
  return storage.get(KEY3, []);
}
function saveChats(list) {
  storage.set(KEY3, list.slice(0, MAX_CHATS));
}
function makeChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function upsertChat(chat) {
  const list = loadChats().filter((item) => item.id !== chat.id);
  list.unshift({ ...chat, updatedAt: Date.now() });
  saveChats(list);
}
function deleteChat(id) {
  saveChats(loadChats().filter((chat) => chat.id !== id));
}

// memory-wrapper.js
globalThis.__mem = { call, emitEvent, getAudit, registerBuiltinHandlers, coreReady, loadMemory, memoryDump, loadChats, upsertChat, deleteChat, makeChatId };

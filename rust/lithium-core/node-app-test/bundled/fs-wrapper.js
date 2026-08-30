// ../../../src/lib/storageManager.js
var IDB_CAP = 15 * 1024 ** 3;
var CACHE_CAP = 10 * 1024 ** 3;
var LOCAL_CAP = 5 * 1024 ** 2;

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
function callStr(fn, text) {
  const bytes = new TextEncoder().encode(text);
  const len = fn(toWasm(bytes), bytes.length);
  return len ? new TextDecoder().decode(fromOut(len)) : null;
}
function fsOpSync(request) {
  if (!exportsRef) return null;
  try {
    const out = callStr(exportsRef.fs_op, JSON.stringify(request));
    return out ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

// ../../../src/lib/unifiedStore.js
var seeder = null;
function registerSeeder(fn) {
  seeder = fn;
}

// ../../../src/lib/fileSystem.js
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
  return [root, ...folders, welcome];
}
registerSeeder((current, hadData) => {
  if (!hadData && (!current || current.length === 0)) return defaultTree();
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
function getEntry(tree, id) {
  return tree.find((entry) => entry.id === id) || null;
}
function pathOf(tree, id) {
  const native = fsOpSync({ op: "path", tree, id });
  if (native) return native;
  const parts = [];
  let current = getEntry(tree, id);
  while (current && current.id !== "root") {
    parts.unshift({ id: current.id, name: current.name });
    current = getEntry(tree, current.parentId);
  }
  return parts;
}
function makeId() {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function updateEntry(tree, id, changes) {
  return tree.map((entry) => entry.id === id ? { ...entry, ...changes, updatedAt: Date.now() } : entry);
}
function removeEntry(tree, id) {
  const native = fsOpSync({ op: "remove", tree, id });
  if (native) return native;
  return tree.filter((entry) => !doomedIds(tree, id).has(entry.id));
}
function duplicateSubtree(tree, id, parentId, suffix = " (copy)") {
  const native = fsOpSync({
    op: "duplicate",
    tree,
    id,
    parentId,
    suffix,
    seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    now: Date.now()
  });
  if (native) return { tree: native.tree, idMap: new Map(Object.entries(native.idMap)) };
  const source = getEntry(tree, id);
  if (!source) return { tree, idMap: /* @__PURE__ */ new Map() };
  const members = tree.filter((entry) => doomedIds(tree, id).has(entry.id));
  const idMap = new Map(members.map((entry) => [entry.id, makeId()]));
  const now = Date.now();
  const clones = members.map((entry) => ({
    ...entry,
    id: idMap.get(entry.id),
    parentId: entry.id === id ? parentId : idMap.get(entry.parentId),
    name: entry.id === id && entry.type !== "folder" ? withCopySuffix(entry.name, suffix) : entry.name,
    createdAt: now,
    updatedAt: now
  }));
  return { tree: [...tree, ...clones], idMap };
}
function withCopySuffix(name, suffix) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`;
}
function canMoveInto(tree, id, parentId) {
  if (id === parentId) return false;
  return !doomedIds(tree, id).has(parentId);
}
function moveEntry(tree, id, parentId) {
  if (!canMoveInto(tree, id, parentId)) return tree;
  const native = fsOpSync({ op: "move", tree, id, parentId, now: Date.now() });
  if (native) return native;
  return updateEntry(tree, id, { parentId });
}
function subtreeFolderIds(tree, id) {
  const native = fsOpSync({ op: "folders", tree, id });
  if (native) return native;
  return tree.filter((entry) => doomedIds(tree, id).has(entry.id) && entry.type === "folder").map((entry) => entry.id);
}
function doomedIds(tree, id) {
  const doomed = /* @__PURE__ */ new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of tree) {
      if (entry.parentId && doomed.has(entry.parentId) && !doomed.has(entry.id)) {
        doomed.add(entry.id);
        grew = true;
      }
    }
  }
  return doomed;
}

// fs-wrapper.js
globalThis.__fs = { removeEntry, duplicateSubtree, moveEntry, pathOf, subtreeFolderIds };
globalThis.__fsCore = coreReady;

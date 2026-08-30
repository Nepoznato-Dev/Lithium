import { allModels, loadModelMeta } from './ai/models';
import { cacheEntries, putBlob } from './storage/manager';
import { hydrate } from './storage/unifiedStore';
import { childrenOf, createEntry, loadTree, saveTree, storeEntryContent, updateEntry } from './fileSystem';
import * as core from './core';

/**
 * Dynamic Downloads folder — everything downloaded or saved on the site lands
 * in C:\Documents\..\Downloads as a real virtual-FS entry:
 *  - downloaded AI models (blobRef → shared GGUF blob, no data duplication)
 *  - backup/settings exports and cloud-drive downloads
 * Games are intentionally NOT mirrored (the offline cache excludes them);
 * any legacy dl-game: entries are pruned on sync.
 * syncDownloads() reconciles the folder with reality and is idempotent.
 */

const DOWNLOADS_ID = 'default-downloads';
const MODELS_ID = 'default-models';
const MODEL_PREFIX = 'dl-model:';
const GAME_PREFIX = 'dl-game:';
export const DOWNLOADS_EVENT = 'lithium:downloads-changed';

const slug = name => core.dlSlugSync(name) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Reconcile Downloads with downloaded models (legacy game mirrors pruned). */
export async function syncDownloads() {
  await hydrate();
  let tree = loadTree();
  let changed = false;
  const now = Date.now();
  const existing = new Set(tree.map(entry => entry.id));

  // --- AI models live in the dedicated Models folder (Cortex's home) ---
  const meta = loadModelMeta();
  for (const model of allModels()) {
    const id = MODEL_PREFIX + model.id;
    const info = meta[model.id];
    if (info?.downloaded) {
      const existingEntry = tree.find(entry => entry.id === id);
      if (!existingEntry) {
        tree = [...tree, {
          id,
          name: `${model.name} ${model.quant}.gguf`,
          type: 'file',
          parentId: MODELS_ID,
          content: null,
          idb: true,
          blobRef: `model:${model.id}`,
          size: info.size || model.size,
          createdAt: info.at || now,
          updatedAt: info.at || now,
        }];
        changed = true;
      } else if (existingEntry.parentId !== MODELS_ID) {
        // Move legacy entries (previously mirrored into Downloads).
        tree = tree.map(entry => (entry.id === id ? { ...entry, parentId: MODELS_ID } : entry));
        changed = true;
      }
    } else if (tree.some(entry => entry.id === id)) {
      // Model was deleted — drop its mirror (blob is owned by models.js).
      tree = tree.filter(entry => entry.id !== id);
      changed = true;
    }
  }

  // --- Offline game cache (service-worker ledger) ---
  let ledger = [];
  try {
    ledger = await cacheEntries();
  } catch { /* cache ledger unavailable */ }
  const wantedGames = new Set();
  for (const item of ledger) {
    if (!item.url?.includes('/html-games/')) continue;
    const fileName = decodeURIComponent(item.url.split('/').pop());
    const title = fileName.replace(/\.html$/i, '');
    const id = GAME_PREFIX + slug(title);
    wantedGames.add(id);
    if (!existing.has(id)) {
      tree = [...tree, {
        id,
        name: `${title}.html`,
        type: 'file',
        parentId: DOWNLOADS_ID,
        content: null,
        idb: false,
        ref: item.url,
        size: item.size || 0,
        createdAt: item.time || now,
        updatedAt: item.time || now,
      }];
      changed = true;
    }
  }
  for (const entry of tree) {
    if (entry.id.startsWith(GAME_PREFIX) && !wantedGames.has(entry.id)) {
      tree = tree.filter(item => item.id !== entry.id);
      changed = true;
    }
  }

  if (changed) {
    saveTree(tree);
    window.dispatchEvent(new Event(DOWNLOADS_EVENT));
  }
  return tree;
}

let watching = false;

/** Auto-sync whenever models are downloaded/deleted (idempotent). */
export function watchDownloads() {
  if (watching) return;
  watching = true;
  window.addEventListener('lithium:models-changed', () => syncDownloads().catch(() => {}));
}

/** Record a text export/save (settings backup, …) into Downloads. */
export async function registerSavedFile(name, content) {
  await hydrate();
  let tree = loadTree();
  const existingEntry = childrenOf(tree, DOWNLOADS_ID).find(entry => entry.name === name);
  if (existingEntry) {
    const updated = await storeEntryContent(existingEntry, content);
    tree = updateEntry(tree, existingEntry.id, { ...updated, updatedAt: Date.now() });
  } else {
    tree = createEntry(tree, { name, type: 'text', parentId: DOWNLOADS_ID, content: '' });
    const created = tree[tree.length - 1];
    const updated = await storeEntryContent(created, content);
    tree = updateEntry(tree, created.id, updated);
  }
  saveTree(tree);
  window.dispatchEvent(new Event(DOWNLOADS_EVENT));
}

/** Record a blob pulled from a cloud drive (or any external source) into Downloads. */
export async function registerBlobDownload(name, blob) {
  await hydrate();
  let tree = loadTree();
  tree = createEntry(tree, { name, type: 'file', parentId: DOWNLOADS_ID, content: '' });
  const created = tree[tree.length - 1];
  await putBlob(created.id, blob, { name });
  tree = updateEntry(loadTree(), created.id, { content: null, idb: true, size: blob.size });
  saveTree(tree);
  window.dispatchEvent(new Event(DOWNLOADS_EVENT));
  return created.id;
}

import { storage } from './storage/localStorage';
import { backendHealth, backendUrl } from './backendApi';
import { opfsAvailable, opfsDelete, opfsWriteStream } from './storage/indexedDB';
import { hydrate } from './storage/unifiedStore';
import { createEntry, loadTree, saveTree, updateEntry, removeEntryDeep } from './fileSystem';
import { DOWNLOADS_EVENT } from './downloads';

/**
 * Downloader engine — pulls ANY url (files, webpages, models) into the site:
 * streams into OPFS (constant memory), registers a Downloads folder entry
 * (blobRef opfs:…), and keeps a persistent history.
 *
 * Route order: local backend proxy first when it's online (server-side fetch
 * ignores CORS and is the proven-reliable path on this network), direct fetch
 * as the fallback.
 */

const HISTORY_KEY = 'downloader-history';
const HISTORY_CAP = 100;
const DOWNLOADS_ID = 'default-downloads';

export const DOWNLOADER_EVENT = 'lithium:downloader-changed';

const slug = name =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';

/* ---------- History ---------- */

export function loadHistory() {
  return storage.get(HISTORY_KEY, []);
}

function saveHistory(history) {
  storage.set(HISTORY_KEY, history.slice(0, HISTORY_CAP));
  window.dispatchEvent(new Event(DOWNLOADER_EVENT));
}

function pushHistory(item) {
  saveHistory([item, ...loadHistory().filter(entry => entry.id !== item.id)]);
}

/* ---------- Stream opening ---------- */

let backendOnline = null;
let backendCheckedAt = 0;

async function backendOnlineCached() {
  const now = Date.now();
  if (backendOnline === null || now - backendCheckedAt > 15000) {
    backendOnline = Boolean(await backendHealth());
    backendCheckedAt = now;
  }
  return backendOnline;
}

/** Open a stream for a URL: proxy-first when the backend is up, else direct. */
export async function openStream(url, signal) {
  const attempts = (await backendOnlineCached()) ? ['proxy', 'direct'] : ['direct', 'proxy'];
  let lastError = null;
  for (const mode of attempts) {
    try {
      const target = mode === 'proxy'
        ? `${backendUrl()}/api/llm/proxy?url=${encodeURIComponent(url)}`
        : url;
      const response = await fetch(target, { signal });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return response;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }
  throw lastError || new Error('Download failed');
}

/* ---------- Naming ---------- */

function deriveName(url, response, explicit) {
  if (explicit?.trim()) return explicit.trim();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (match) return decodeURIComponent(match[1].trim());
  const fromUrl = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
  if (fromUrl && fromUrl.includes('.')) return fromUrl;
  const type = (response.headers.get('content-type') || '').split(';')[0];
  if (type.includes('html')) return 'webpage.html';
  if (type.startsWith('image/')) return `image.${type.split('/')[1] || 'bin'}`;
  return fromUrl || 'download.bin';
}

/* ---------- The download itself ---------- */

/**
 * Download any URL into the site. Returns the history item.
 * onProgress({ received, total }) · signal for cancellation.
 */
export async function downloadToSite(url, { name, onProgress, signal } = {}) {
  const id = `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const item = { id, url, name: name || '', size: 0, at: Date.now(), status: 'downloading', entryId: null, opfs: null };
  pushHistory(item);

  try {
    const response = await openStream(url, signal);
    const fileName = deriveName(url, response, name);
    const total = Number(response.headers.get('content-length')) || 0;
    item.name = fileName;

    if (!opfsAvailable()) throw new Error('This browser lacks OPFS — required for large downloads');
    const opfsName = `${id}-${slug(fileName)}`;
    const size = await opfsWriteStream(opfsName, response, total, update => {
      onProgress?.(update);
      item.size = update.received;
    }, signal);

    if (fileName.toLowerCase().endsWith('.gguf')) {
      // GGUFs become first-class models: Cortex lists them, wllama can load
      // them, and syncDownloads mirrors them into the Downloads folder.
      const { registerExternalGguf } = await import('./ai/models');
      const { syncDownloads } = await import('./downloads');
      const modelId = registerExternalGguf({ name: fileName, opfsName, size, url });
      await syncDownloads();
      Object.assign(item, { status: 'done', size, entryId: `dl-model:${modelId}`, opfs: opfsName, at: Date.now(), modelId });
      pushHistory(item);
      return item;
    }

    // Generic file: register in the Downloads folder (blobRef → OPFS file).
    await hydrate();
    let tree = loadTree();
    tree = createEntry(tree, { name: fileName, type: 'file', parentId: DOWNLOADS_ID, content: '' });
    const created = tree[tree.length - 1];
    tree = updateEntry(tree, created.id, {
      content: null,
      idb: true,
      blobRef: `opfs:${opfsName}`,
      size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    saveTree(tree);
    window.dispatchEvent(new Event(DOWNLOADS_EVENT));

    Object.assign(item, { status: 'done', size, entryId: created.id, opfs: opfsName, at: Date.now() });
    pushHistory(item);
    return item;
  } catch (err) {
    Object.assign(item, { status: err.name === 'AbortError' ? 'cancelled' : 'error', error: err.message, at: Date.now() });
    pushHistory(item);
    throw err;
  }
}

/* ---------- Cleanup ---------- */

/** Remove a finished download: Downloads entry + OPFS file + history row.
 * GGUF downloads are owned by the model registry — delete them through it. */
export async function removeDownload(historyId) {
  const item = loadHistory().find(entry => entry.id === historyId);
  if (!item) return;
  if (item.modelId) {
    const { deleteModel } = await import('./ai/models');
    await deleteModel(item.modelId);
    const { syncDownloads } = await import('./downloads');
    await syncDownloads();
  } else {
    if (item.entryId) {
      await hydrate();
      const tree = loadTree();
      if (tree.some(entry => entry.id === item.entryId)) {
        saveTree(await removeEntryDeep(tree, item.entryId));
        window.dispatchEvent(new Event(DOWNLOADS_EVENT));
      }
    }
    if (item.opfs) await opfsDelete(item.opfs);
  }
  saveHistory(loadHistory().filter(entry => entry.id !== historyId));
}

export function clearHistory() {
  saveHistory(loadHistory().filter(entry => entry.status === 'downloading'));
}

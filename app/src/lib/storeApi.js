import { liAssetUrl, liStoreApps, liStoreBlob, liStoreGames } from './backendApi';
import { hydrate } from './storage/unifiedStore';
import { loadTree, removeEntryDeep, saveTree } from './fileSystem';
import { SYS } from './fileSystem/systemDirs';
import { downloadBlob, importTarToFolder } from './storage/tarArchive';
import { storage } from './storage/localStorage';

/**
 * Client for the server's package store.
 *
 * `li-server` keeps every app and game as a built `.tar.gz` in its own `store/`
 * folder (see `backend/server/src/store/`), and this module is the two ways a
 * caller takes one:
 *
 *   * `savePackage` — hand the archive to the browser, which writes it to the
 *     user's computer. Nothing is parsed here; the tarball is the artifact.
 *   * `installPackage` — pull the same bytes and unpack them into the virtual
 *     filesystem under Documents/Store/{Apps,Games}/<id>, through the shared
 *     TAR importer the File Explorer uses, so an installed package looks like
 *     any other folder once it lands.
 *
 * Installs are recorded in localStorage rather than derived from the tree, so
 * re-installing replaces the previous copy instead of leaving a second folder
 * behind, and Uninstall can find exactly what it created.
 */

const REGISTRY_KEY = 'store-installs';

/** Well-known folders the store installs into. Fixed ids so a second install
 *  finds the first one instead of creating a sibling. */
const SHELF_ROOT_ID = 'store-root';
const SHELF_FOLDER = {
  app: { id: 'store-apps', name: 'Apps' },
  game: { id: 'store-games', name: 'Games' },
};

/** Turn a server manifest row into the shape the shelf UI draws. */
function toPackage(row, kind) {
  const id = row.id || '';
  const version = row.version || '1.0.0';
  // Paths come back server-relative; absolute URLs are resolved here, once, so
  // a caller can point an <a download> or an iframe straight at them.
  const absolute = path => (path ? liAssetUrl(path) : '');
  return {
    id,
    kind,
    name: row.name || id,
    category: row.category || kind,
    tags: row.tags || [],
    description: row.description || '',
    version,
    entry: row.entry || 'index.html',
    width: row.width || 0,
    height: row.height || 0,
    files: row.files || 0,
    sizeBytes: row.sizeBytes || 0,
    /** Artwork is optional; a shelf row without one gets a generated tile. */
    thumbnail: row.icon || '',
    /** Where this archive came from, for re-installing after a page reload. */
    source: 'server',
    /** `/api/games/block-blast-puzzle/download`, resolved against the shelf. */
    downloadUrl: absolute(row.downloadUrl || ''),
    /** Only games have a browser-playable entry point. */
    playUrl: absolute(row.playUrl || ''),
    /** What the saved file is called on the user's disk. */
    archiveName: `${id}-${version}.tar.gz`,
  };
}

/** Every package of one kind the server will hand over to this caller. */
export async function loadShelf(kind, { signal } = {}) {
  const fetcher = kind === 'app' ? liStoreApps : liStoreGames;
  const field = kind === 'app' ? 'apps' : 'games';
  const body = await fetcher({ signal });
  return (Array.isArray(body?.[field]) ? body[field] : []).map(row => toPackage(row, kind));
}

/* ── Save to the user's computer ────────────────────────────────────── */

/** Fetch a package's archive and give it to the browser as a file download. */
export async function savePackage(pkg, { signal } = {}) {
  if (!pkg.downloadUrl) throw new Error(`'${pkg.name}' has no download on this server`);
  const blob = await liStoreBlob(pkg.downloadUrl, { signal });
  downloadBlob(blob, pkg.archiveName);
  return blob.size;
}

/* ── Install into the virtual filesystem ───────────────────────────── */

/** Add the Store folders if this is the first install. Returns the target id. */
function ensureShelfFolder(tree, kind) {
  const leaf = SHELF_FOLDER[kind] || SHELF_FOLDER.app;
  const now = Date.now();
  const make = (id, name, parentId) => ({ id, name, type: 'folder', parentId, createdAt: now, updatedAt: now });
  if (!tree.some(entry => entry.id === SHELF_ROOT_ID)) tree = [...tree, make(SHELF_ROOT_ID, 'Store', SYS.DOCUMENTS)];
  if (!tree.some(entry => entry.id === leaf.id)) tree = [...tree, make(leaf.id, leaf.name, SHELF_ROOT_ID)];
  return { tree, folderId: leaf.id };
}

export const readInstalls = () => {
  const saved = storage.get(REGISTRY_KEY, null);
  return saved && typeof saved === 'object' ? saved : {};
};

const writeInstalls = registry => storage.set(REGISTRY_KEY, registry);

export const isInstalled = pkg => Boolean(readInstalls()[`${pkg.kind}:${pkg.id}`]);

/** Ids of everything already installed from one shelf — the cheap way to paint
 *  a grid of badges without asking `isInstalled` to re-read storage per card. */
export function installedIds(kind) {
  const prefix = `${kind}:`;
  return Object.keys(readInstalls())
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length));
}

/**
 * Unpack a package's `.tar.gz` into Documents/Store/<Apps|Games>/<id>.
 * `onProgress({ phase, done, total })` — 'fetch', then 'write'.
 * Returns `{ folderId, files }` so a caller can open the result.
 */
export async function installPackage(pkg, { onProgress } = {}) {
  if (!pkg.downloadUrl) throw new Error(`'${pkg.name}' has no download on this server`);

  onProgress?.({ phase: 'fetch' });
  const blob = await liStoreBlob(pkg.downloadUrl);

  await hydrate();
  let tree = loadTree();

  // Replace, rather than stack: a second install of the same id means the user
  // wants the current copy, not another folder beside the old one.
  const key = `${pkg.kind}:${pkg.id}`;
  const registry = readInstalls();
  if (registry[key]?.folderId) {
    tree = await removeEntryDeep(tree, registry[key].folderId);
  }

  const shelf = ensureShelfFolder(tree, pkg.kind);
  tree = shelf.tree;

  onProgress?.({ phase: 'write' });
  const { tree: next, folderId, files } = await importTarToFolder(tree, shelf.folderId, blob, {
    nameOverride: pkg.id,
    onProgress: progress => onProgress?.({ ...progress, phase: 'write' }),
  });

  saveTree(next);
  window.dispatchEvent(new Event('lithium:fs-changed'));
  registry[key] = { folderId, name: pkg.name, files, at: Date.now() };
  writeInstalls(registry);
  return { folderId, files };
}

/** Delete an installed package's folder and forget it. */
export async function uninstallPackage(pkg) {
  const key = `${pkg.kind}:${pkg.id}`;
  const registry = readInstalls();
  const record = registry[key];
  if (!record?.folderId) return false;

  await hydrate();
  const tree = loadTree();
  // A folder the user deleted by hand is not an error here — drop the record.
  if (tree.some(entry => entry.id === record.folderId)) {
    saveTree(await removeEntryDeep(tree, record.folderId));
    window.dispatchEvent(new Event('lithium:fs-changed'));
  }
  delete registry[key];
  writeInstalls(registry);
  return true;
}

/** The folder id an installed package lives at, or null. */
export const installedFolderId = pkg => readInstalls()[`${pkg.kind}:${pkg.id}`]?.folderId || null;

import { unzipSync, strFromU8 } from 'fflate';
import { openStream } from './downloader';
import { hydrate } from './storage/unifiedStore';
import { loadTree, saveTree } from './fileSystem';
import { putBlob, getBlob } from './storage/manager';

/**
 * GitHub repo importer — pulls a repo into Projects/{repo} using only
 * CORS-friendly endpoints so it works straight from the browser:
 *   api.github.com  (repo + recursive git trees)  → access-control-allow-origin: *
 *   raw.githubusercontent.com (file bytes)        → access-control-allow-origin: *
 * Falls back to the local backend proxy if a direct fetch is blocked.
 * Also provides extractZipEntry() to unzip a .zip stored in the virtual FS.
 */

const PROJECTS_ID = 'default-projects';
const MAX_FILES = 250;
const MAX_BINARY = 2 * 1024 * 1024;

const TEXT_EXT = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'md', 'txt', 'html', 'htm', 'css', 'scss', 'less',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bat', 'yml', 'yaml',
  'toml', 'ini', 'env', 'gitignore', 'gitattributes', 'vue', 'svelte', 'sql', 'xml', 'svg', 'csv',
  'lock', 'editorconfig', 'prettierrc', 'eslintrc', 'babelrc',
]);

/** Parse github.com/{owner}/{repo}[/tree/{branch}] → { owner, repo, branch|null }. */
export function parseGithubUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    const branch = parts[2] === 'tree' && parts[3] ? parts[3] : null;
    return { owner, repo: repo.replace(/\.git$/i, ''), branch };
  } catch {
    return null;
  }
}

/** Repo root or /tree/ view (importable), not a single file. */
export function isGithubRepo(url) {
  const info = parseGithubUrl(url);
  if (!info) return false;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts.length <= 2 || parts[2] === 'tree';
  } catch {
    return false;
  }
}

/** Direct fetch first (CORS *), backend proxy as fallback. Returns a Response. */
async function fetchSmart(url, { json = false } = {}) {
  try {
    const response = await fetch(url, { headers: json ? { Accept: 'application/vnd.github+json' } : undefined });
    if (response.ok) return response;
  } catch { /* fall through to proxy */ }
  const proxied = await openStream(url);
  if (!proxied.ok) throw new Error(`GitHub fetch failed for ${new URL(url).hostname}`);
  return proxied;
}

const isText = (name, bytes) => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  if (bytes.length > 512 * 1024) return false;
  for (let i = 0; i < Math.min(bytes.length, 2048); i++) if (bytes[i] === 0) return false;
  return true;
};

let serial = 0;
const makeId = () => `gh-${Date.now().toString(36)}-${(serial++).toString(36)}`;

/**
 * Import a GitHub repo into Projects/{repo}. Returns the project folder id.
 * onProgress({ phase, received, total }).
 */
export async function importGithubRepo(url, { onProgress } = {}) {
  const info = parseGithubUrl(url);
  if (!info) throw new Error('Not a GitHub repository URL');

  onProgress?.({ phase: 'download', received: 0, total: 0 });
  let branch = info.branch;
  if (!branch) {
    const repoRes = await fetchSmart(`https://api.github.com/repos/${info.owner}/${info.repo}`, { json: true });
    branch = (await repoRes.json()).default_branch || 'main';
  }

  const treeRes = await fetchSmart(`https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${branch}?recursive=1`, { json: true });
  const { tree: nodes, truncated } = await treeRes.json();
  const blobs = (nodes || []).filter(node => node.type === 'blob');

  await hydrate();
  let tree = loadTree();
  const now = Date.now();

  let root = tree.find(entry => entry.parentId === PROJECTS_ID && entry.type === 'folder' && entry.name === info.repo);
  if (!root) {
    root = { id: makeId(), name: info.repo, type: 'folder', parentId: PROJECTS_ID, createdAt: now, updatedAt: now };
    tree = [...tree, root];
  }

  const dirIds = new Map([['', root.id]]);
  const ensureDir = relPath => {
    if (dirIds.has(relPath)) return dirIds.get(relPath);
    const parts = relPath.split('/');
    const parentId = ensureDir(parts.slice(0, -1).join('/'));
    const folder = { id: makeId(), name: parts[parts.length - 1], type: 'folder', parentId, createdAt: now, updatedAt: now };
    tree = [...tree, folder];
    dirIds.set(relPath, folder.id);
    return folder.id;
  };

  let count = 0;
  const total = Math.min(blobs.length, MAX_FILES);
  for (const node of blobs) {
    if (count >= MAX_FILES) break;
    const segs = node.path.split('/');
    if (segs[0] === '.git' || segs.includes('node_modules')) continue;
    const name = segs[segs.length - 1];
    const parentId = ensureDir(segs.slice(0, -1).join('/'));

    const fileRes = await fetchSmart(`https://raw.githubusercontent.com/${info.owner}/${info.repo}/${branch}/${node.path}`);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());

    if (isText(name, bytes)) {
      tree = [...tree, { id: makeId(), name, type: 'text', parentId, content: strFromU8(bytes), createdAt: now, updatedAt: now }];
    } else if (bytes.length <= MAX_BINARY) {
      const id = makeId();
      await putBlob(id, new Blob([bytes]), { name });
      tree = [...tree, { id, name, type: 'file', parentId, content: null, idb: true, size: bytes.length, createdAt: now, updatedAt: now }];
    } else {
      continue;
    }
    count++;
    onProgress?.({ phase: 'write', received: count, total });
  }

  saveTree(tree);
  window.dispatchEvent(new Event('lithium:fs-changed'));
  return { folderId: root.id, files: count, truncated: Boolean(truncated) || blobs.length > MAX_FILES };
}

/** Extract a .zip stored in the virtual FS into a sibling folder. Returns folder id. */
export async function extractZipEntry(entry, { onProgress } = {}) {
  const blob = await getBlob(entry.id);
  if (!blob) throw new Error('Could not read the zip blob');
  onProgress?.({ phase: 'extract' });
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));

  await hydrate();
  let tree = loadTree();
  const now = Date.now();
  const baseName = entry.name.replace(/\.[^.]+$/, '');
  let root = { id: makeId(), name: baseName, type: 'folder', parentId: entry.parentId, createdAt: now, updatedAt: now };
  tree = [...tree, root];

  const dirIds = new Map([['', root.id]]);
  const ensureDir = relPath => {
    if (dirIds.has(relPath)) return dirIds.get(relPath);
    const parts = relPath.split('/');
    const parentId = ensureDir(parts.slice(0, -1).join('/'));
    const folder = { id: makeId(), name: parts[parts.length - 1], type: 'folder', parentId, createdAt: now, updatedAt: now };
    tree = [...tree, folder];
    dirIds.set(relPath, folder.id);
    return folder.id;
  };

  let count = 0;
  for (const [path, bytes] of Object.entries(entries)) {
    if (count >= MAX_FILES || !path || path.endsWith('/')) continue;
    const segs = path.split('/');
    if (segs.includes('node_modules')) continue;
    const name = segs[segs.length - 1];
    const parentId = ensureDir(segs.slice(0, -1).join('/'));
    if (isText(name, bytes)) {
      tree = [...tree, { id: makeId(), name, type: 'text', parentId, content: strFromU8(bytes), createdAt: now, updatedAt: now }];
    } else if (bytes.length <= MAX_BINARY) {
      const id = makeId();
      await putBlob(id, new Blob([bytes]), { name });
      tree = [...tree, { id, name, type: 'file', parentId, content: null, idb: true, size: bytes.length, createdAt: now, updatedAt: now }];
    } else continue;
    count++;
    onProgress?.({ phase: 'write', received: count, total: 0 });
  }

  saveTree(tree);
  window.dispatchEvent(new Event('lithium:fs-changed'));
  return root.id;
}

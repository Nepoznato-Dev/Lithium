import { registerHandler } from './ai/apiManager';
import {
  loadTree, saveTree, childrenOf, createEntry, updateEntry, removeEntryDeep,
  readEntryContent, moveEntry, canMoveInto,
} from './fileSystem';
import { hydrate } from './storage/unifiedStore';

/**
 * Code Studio IDE API surface (project-scoped, path-addressed).
 * Paths are relative to Projects — first segment is the project folder
 * (e.g. "myrepo/src/main.js").
 *
 * The MANIFEST doubles as the AI's tool list, so the model is ALWAYS told the
 * complete, current set of IDE actions (buildCodeDoc()).
 */

const PROJECTS = 'default-projects';

export const CODE_API_MANIFEST = [
  { api: 'code.list', params: 'path?', desc: 'List files/folders in a project folder (omit path for project roots)' },
  { api: 'code.read', params: 'path', desc: 'Read one file’s contents' },
  { api: 'code.readMany', params: 'paths[]', desc: 'Read several files at once → {path: content}' },
  { api: 'code.write', params: 'path, content', desc: 'Create or overwrite a text file (creates parent folders)' },
  { api: 'code.createFile', params: 'path, content?', desc: 'Create an empty/new file' },
  { api: 'code.createFolder', params: 'path', desc: 'Create a folder (and parents)' },
  { api: 'code.deleteFile', params: 'path', desc: 'Delete a file' },
  { api: 'code.deleteFolder', params: 'path', desc: 'Delete a folder and its contents' },
  { api: 'code.moveFile', params: 'path, to', desc: 'Move/rename a file to a new folder path' },
  { api: 'code.moveFolder', params: 'path, to', desc: 'Move a folder into another folder' },
  { api: 'code.rename', params: 'path, name', desc: 'Rename a file or folder in place' },
];

/** Prompt snippet listing every IDE action + the api-block format. Always current. */
export function buildCodeDoc() {
  const lines = CODE_API_MANIFEST.map(m => `- ${m.api} {${m.params}} — ${m.desc}`).join('\n');
  return `\n\nYou have full IDE tool access. To call a tool, emit ONE JSON object per fenced \`\`\`api block using the key "api" (NOT "action"):
\`\`\`api
{"api":"code.write","params":{"path":"project/file.js","content":"// code"}}
\`\`\`
Available actions:\n${lines}
Paths are relative to Projects (first segment = project folder; use code.list with no path or "." to see roots). You may emit multiple api blocks in one reply to touch many files. Also include a short fenced code block of the key code for the inline diff.`;
}

const segsOf = path => String(path || '').split('/').filter(Boolean);

const resolvePath = (tree, path) => {
  let current = null;
  let parentId = PROJECTS;
  for (const seg of segsOf(path)) {
    current = childrenOf(tree, parentId).find(entry => entry.name === seg);
    if (!current) return null;
    parentId = current.id;
  }
  return current;
};

const ensureDirPath = (tree, path) => {
  let parentId = PROJECTS;
  for (const seg of segsOf(path)) {
    let folder = childrenOf(tree, parentId).find(entry => entry.name === seg && entry.type === 'folder');
    if (!folder) {
      tree = createEntry(tree, { name: seg, type: 'folder', parentId });
      folder = tree[tree.length - 1];
    }
    parentId = folder.id;
  }
  return { tree, id: parentId };
};

const requireEntry = (tree, path) => {
  const entry = resolvePath(tree, path);
  if (!entry) throw new Error(`no such file/folder '${path}'`);
  return entry;
};

export function registerCodeApis() {
  registerHandler('code.list', async ({ path = '' }) => {
    await hydrate();
    const tree = loadTree();
    const clean = String(path || '').replace(/^\.?\/+/, '').replace(/\/+$/, '');
    // '.' / '' / '/' → list the project roots.
    if (clean === '' || clean === '.') {
      return childrenOf(tree, PROJECTS).map(entry => ({ path: entry.name, type: entry.type, size: entry.size || 0 }));
    }
    const folder = resolvePath(tree, clean);
    if (!folder || folder.type !== 'folder') {
      const roots = childrenOf(tree, PROJECTS).map(e => e.name).join(', ');
      throw new Error(`no folder '${clean}'. Available projects: ${roots || '(none)'}`);
    }
    return childrenOf(tree, folder.id).map(entry => ({ path: `${clean}/${entry.name}`, type: entry.type, size: entry.size || 0 }));
  });

  registerHandler('code.read', async ({ path }) => {
    await hydrate();
    const entry = requireEntry(loadTree(), path);
    if (entry.type === 'folder') throw new Error(`'${path}' is a folder`);
    return readEntryContent(entry);
  });

  registerHandler('code.readMany', async ({ paths = [] }) => {
    await hydrate();
    const tree = loadTree();
    const out = {};
    for (const path of paths) {
      const entry = resolvePath(tree, path);
      out[path] = entry && entry.type !== 'folder' ? await readEntryContent(entry) : null;
    }
    return out;
  });

  registerHandler('code.write', async ({ path, content = '' }) => {
    await hydrate();
    const segs = segsOf(path);
    if (segs.length < 2) throw new Error('path must be project/file, e.g. myrepo/main.js');
    let tree = loadTree();
    const dir = ensureDirPath(tree, segs.slice(0, -1).join('/'));
    tree = dir.tree;
    const name = segs[segs.length - 1];
    const existing = childrenOf(tree, dir.id).find(entry => entry.name === name);
    if (existing) {
      saveTree(updateEntry(tree, existing.id, { content, idb: false, size: content.length * 2 }));
      return path;
    }
    const next = createEntry(tree, { name, type: 'text', parentId: dir.id, content });
    saveTree(next);
    return path;
  });

  registerHandler('code.createFile', async ({ path, content = '' }) => {
    await hydrate();
    const segs = segsOf(path);
    if (segs.length < 2) throw new Error('path must be project/file');
    let tree = loadTree();
    const dir = ensureDirPath(tree, segs.slice(0, -1).join('/'));
    tree = dir.tree;
    const name = segs[segs.length - 1];
    if (childrenOf(tree, dir.id).some(entry => entry.name === name)) throw new Error(`'${path}' already exists`);
    const next = createEntry(tree, { name, type: 'text', parentId: dir.id, content });
    saveTree(next);
    return path;
  });

  registerHandler('code.createFolder', async ({ path }) => {
    await hydrate();
    const { tree } = ensureDirPath(loadTree(), path);
    saveTree(tree);
    return path;
  });

  registerHandler('code.deleteFile', async ({ path }) => {
    await hydrate();
    const tree = loadTree();
    const entry = requireEntry(tree, path);
    if (entry.type === 'folder') throw new Error(`'${path}' is a folder — use code.deleteFolder`);
    saveTree(await removeEntryDeep(tree, entry.id));
    return true;
  });

  registerHandler('code.deleteFolder', async ({ path }) => {
    await hydrate();
    const tree = loadTree();
    const entry = requireEntry(tree, path);
    if (entry.type !== 'folder') throw new Error(`'${path}' is not a folder`);
    saveTree(await removeEntryDeep(tree, entry.id));
    return true;
  });

  registerHandler('code.moveFile', async ({ path, to }) => {
    await hydrate();
    const tree = loadTree();
    const entry = requireEntry(tree, path);
    const target = resolvePath(tree, to);
    if (!target || target.type !== 'folder') throw new Error(`destination folder '${to}' not found`);
    if (!canMoveInto(tree, entry.id, target.id)) throw new Error(`cannot move '${path}' into '${to}'`);
    saveTree(moveEntry(tree, entry.id, target.id));
    return true;
  });

  registerHandler('code.moveFolder', async ({ path, to }) => {
    await hydrate();
    const tree = loadTree();
    const entry = requireEntry(tree, path);
    if (entry.type !== 'folder') throw new Error(`'${path}' is not a folder`);
    const target = resolvePath(tree, to);
    if (!target || target.type !== 'folder') throw new Error(`destination folder '${to}' not found`);
    if (!canMoveInto(tree, entry.id, target.id)) throw new Error(`cannot move '${path}' into '${to}'`);
    saveTree(moveEntry(tree, entry.id, target.id));
    return true;
  });

  registerHandler('code.rename', async ({ path, name }) => {
    await hydrate();
    const tree = loadTree();
    const entry = requireEntry(tree, path);
    const clean = String(name || '').trim();
    if (!clean) throw new Error('name must not be empty');
    saveTree(updateEntry(tree, entry.id, { name: clean }));
    return true;
  });
}

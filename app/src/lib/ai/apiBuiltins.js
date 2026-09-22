import { registerHandler } from './apiManager';
import { notify } from '../desktop/notify';
import { storage } from '../storage/localStorage';
import { BUILD_VERSION } from '../settings';
import { loadTree, saveTree, getEntry, childrenOf, createEntry, updateEntry, removeEntryDeep, readEntryContent, storeEntryContent, moveEntry, canMoveInto } from '../fileSystem';
import { hydrate } from '../storage/unifiedStore';
import { deleteMemory, loadMemory, readMemory, writeMemory, addNotebook, deleteNotebook, addNotebookEntry, deleteNotebookEntry, loadNotebooks } from './agent';
import { loadWeatherCache } from '../deviceContext';
import { AI_PROVIDERS, DEFAULT_PROVIDER, LOCAL_PROVIDER, getSelectedModel, setSelectedModel, loadKeys, modelsForProvider } from './providers';
import { allModels, loadModelMeta } from './models';
import { liCredits } from '../backendApi';
import { loadDriveConfigs, testConnection } from '../cloudDrives';
import { listWidgets, setWidgetEnabled } from '../desktop/widgetRuntime';
import { hasWasm, fsOpSync } from '../core';
import { registerCodeApis } from '../codeApi';
import { addDynamicApp, removeDynamicApp, getDynamicApps } from '../li-apps/liDynamicApps';
import { ContextMenuRegistry } from '../desktop/contextMenuRegistry';

/**
 * Built-in API handlers. UI-level handlers (apps.*, settings.*,
 * system.open_start_menu, …) are registered by React components; these are
 * the library-backed ones that work from anywhere.
 */

const dispatch = detail => window.dispatchEvent(new CustomEvent('lithium:api-command', { detail }));

/** Notebooks are addressed by id or by name, whichever the caller knows. */
function findNotebook(idOrName) {
  const key = String(idOrName || '').trim();
  const notebook = loadNotebooks().find(nb => nb.id === key || nb.name === key);
  if (!notebook) throw new Error(`no knowledge notebook '${key || '(empty)'}'`);
  return notebook;
}

let registered = false;

export function registerBuiltinHandlers() {
  if (registered) return;
  registered = true;

  /* ---------- system ---------- */

  registerHandler('system.get_info', () => ({
    version: BUILD_VERSION,
    time: new Date().toISOString(),
    engine: hasWasm() ? 'rust-wasm' : 'no-wasm',
    platform: navigator.platform,
    online: navigator.onLine,
  }));

  registerHandler('system.open_start_menu', () => dispatch({ cmd: 'open_start_menu' }));
  registerHandler('system.close_start_menu', () => dispatch({ cmd: 'close_start_menu' }));
  registerHandler('system.show_desktop', () => dispatch({ cmd: 'show_desktop' }));

  registerHandler('system.get_volume', () => storage.get('desktop-sound-level', 50));
  registerHandler('system.set_volume', ({ level }) => {
    dispatch({ cmd: 'set_volume', level });
    return level;
  });

  registerHandler('system.notify', ({ title, body = '', tone = 'info' }) => {
    notify({ title, body, tone });
    return true;
  });

  /* ---------- fs ---------- */

  registerHandler('fs.list', async ({ folder = 'root' }) => {
    await hydrate();
    return childrenOf(loadTree(), folder).map(entry => ({
      id: entry.id, name: entry.name, type: entry.type, size: entry.size || 0,
    }));
  });

  registerHandler('fs.read', async ({ id }) => {
    await hydrate();
    const entry = getEntry(loadTree(), id);
    if (!entry) throw new Error(`no entry '${id}'`);
    return readEntryContent(entry);
  });

  registerHandler('fs.write', async ({ name, parent = 'root', content = '' }) => {
    await hydrate();
    const tree = loadTree();
    const existing = childrenOf(tree, parent).find(entry => entry.name === name);
    if (existing) {
      saveTree(updateEntry(tree, existing.id, { content, idb: false, size: content.length * 2 }));
      return existing.id;
    }
    const next = createEntry(tree, { name, type: 'text', parentId: parent, content });
    saveTree(next);
    return next[next.length - 1].id;
  });

  registerHandler('fs.create_folder', async ({ name, parent = 'root' }) => {
    await hydrate();
    const tree = loadTree();
    const next = createEntry(tree, { name, type: 'folder', parentId: parent });
    saveTree(next);
    return next[next.length - 1].id;
  });

  registerHandler('fs.delete', async ({ id }) => {
    await hydrate();
    saveTree(await removeEntryDeep(loadTree(), id));
    return true;
  });

  registerHandler('fs.tree', async ({ folder = 'root' }) => {
    await hydrate();
    const tree = loadTree();
    return fsOpSync({ op: 'walk', tree, folder, limit: 500 }) || [];
  });

  registerHandler('fs.append', async ({ name, parent = 'root', content = '' }) => {
    await hydrate();
    let tree = loadTree();
    const existing = childrenOf(tree, parent).find(entry => entry.name === name);
    if (existing) {
      if (existing.blobRef) throw new Error('cannot append to an externally-owned file');
      const current = await readEntryContent(existing);
      const updated = await storeEntryContent(existing, `${current}${content}`);
      saveTree(updateEntry(tree, existing.id, { ...updated, updatedAt: Date.now() }));
      return existing.id;
    }
    tree = createEntry(tree, { name, type: 'text', parentId: parent, content: '' });
    const created = tree[tree.length - 1];
    const updated = await storeEntryContent(created, content);
    saveTree(updateEntry(tree, created.id, updated));
    return created.id;
  });

  registerHandler('fs.move', async ({ id, parent }) => {
    await hydrate();
    const tree = loadTree();
    if (!getEntry(tree, id)) throw new Error(`no entry '${id}'`);
    if (!canMoveInto(tree, id, parent)) throw new Error(`cannot move '${id}' into '${parent}' (missing target or self-nesting)`);
    saveTree(moveEntry(tree, id, parent));
    return true;
  });

  registerHandler('fs.rename', async ({ id, name }) => {
    await hydrate();
    const tree = loadTree();
    if (!getEntry(tree, id)) throw new Error(`no entry '${id}'`);
    const clean = String(name || '').trim();
    if (!clean) throw new Error('name must not be empty');
    saveTree(updateEntry(tree, id, { name: clean }));
    return true;
  });

  /* ---------- code (Code Studio IDE APIs — see codeApi.js) ---------- */
  registerCodeApis();

  /* ---------- weather ---------- */

  registerHandler('weather.get', () => {
    const cached = loadWeatherCache();
    if (!cached?.data) throw new Error('no weather data yet (open the taskbar widget)');
    return cached;
  });

  /* ---------- ai / models ---------- */

  registerHandler('ai.list_providers', () => {
    const keys = loadKeys();
    return Object.entries(AI_PROVIDERS).map(([id, provider]) => ({
      id, label: provider.label, hasKey: Boolean(keys[id]), needsKey: provider.needsKey,
      hosted: Boolean(provider.hosted), local: Boolean(provider.local),
      model: getSelectedModel(id),
    }));
  });

  /** Cloud providers report their curated list; `local` reports GGUFs on disk. */
  registerHandler('ai.list_models', ({ provider = DEFAULT_PROVIDER }) => {
    if (provider === LOCAL_PROVIDER) {
      const meta = loadModelMeta();
      return allModels().map(model => ({
        id: model.id, name: model.name, params: model.params, size: model.size,
        downloaded: Boolean(meta[model.id]?.downloaded),
      }));
    }
    return modelsForProvider(provider).map(entry => ({ ...entry }));
  });

  registerHandler('ai.set_model', ({ provider, model }) => {
    if (!AI_PROVIDERS[provider]) throw new Error(`unknown provider '${provider}'`);
    setSelectedModel(provider, model);
    return { provider, model };
  });

  registerHandler('ai.credits', async () => {
    const data = await liCredits();
    return { authenticated: data.authenticated, metered: data.metered, ...data.balance };
  });

  /* ---------- knowledge (notebooks, injected into the model context) ---------- */

  registerHandler('knowledge.list', () => loadNotebooks().map(notebook => ({
    id: notebook.id, name: notebook.name,
    entries: (notebook.entries || []).length, createdAt: notebook.createdAt,
  })));

  registerHandler('knowledge.read', ({ notebook }) => findNotebook(notebook));

  registerHandler('knowledge.create', ({ name }) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('notebook name must not be empty');
    const created = addNotebook(clean);
    return { id: created.id, name: created.name };
  });

  registerHandler('knowledge.add_entry', ({ notebook, title, content = '' }) => {
    const target = findNotebook(notebook);
    addNotebookEntry(target.id, { title: String(title || '').trim(), content });
    return { notebook: target.id, title };
  });

  registerHandler('knowledge.delete_entry', ({ notebook, entry }) => {
    const target = findNotebook(notebook);
    deleteNotebookEntry(target.id, entry);
    return true;
  });

  registerHandler('knowledge.delete', ({ notebook }) => {
    const target = findNotebook(notebook);
    deleteNotebook(target.id);
    return true;
  });

  /* ---------- cloud (external APIs) ---------- */

  registerHandler('cloud.list_drives', () =>
    loadDriveConfigs().map(config => ({
      id: config.id, provider: config.provider, label: config.label, letter: config.letter,
    }))
  );

  registerHandler('cloud.test_drive', async ({ id }) => {
    const config = loadDriveConfigs().find(item => item.id === id);
    if (!config) throw new Error(`no drive '${id}'`);
    await testConnection(config);
    return true;
  });

  /* ---------- memory (persistent model memory) ---------- */

  registerHandler('memory.list', () => Object.entries(loadMemory()).map(([key, entry]) => ({ key, updatedAt: entry.updatedAt })));

  registerHandler('memory.read', ({ key }) => {
    const value = readMemory(key);
    if (value === null) throw new Error(`no memory entry '${key}'`);
    return value;
  });

  registerHandler('memory.write', ({ key, value }) => writeMemory(key, value));

  registerHandler('memory.delete', ({ key }) => {
    deleteMemory(key);
    return true;
  });

  /* ---------- widgets ---------- */

  registerHandler('widgets.list', () => listWidgets());
  registerHandler('widgets.set_enabled', ({ id, enabled }) => setWidgetEnabled(id, enabled));

  /* ---------- dynamic .li apps ---------- */

  registerHandler('apps.create', ({ manifest, html }) => {
    const created = addDynamicApp(manifest, html);
    return { id: created.id, name: created.name, created: true };
  });

  registerHandler('apps.update', ({ manifest, html }) => {
    const existing = getDynamicApps().find(a => a.manifest.id === manifest.id);
    const htmlContent = html || existing?.html;
    if (!htmlContent) throw new Error(`no existing app '${manifest.id}' and no html provided`);
    const updated = addDynamicApp(manifest, htmlContent);
    return { id: updated.id, name: updated.name, updated: true };
  });

  registerHandler('apps.delete_app', ({ id }) => {
    const removed = removeDynamicApp(id);
    if (!removed) throw new Error(`no dynamic app '${id}'`);
    return { id, deleted: true };
  });

  registerHandler('apps.list_dynamic', () =>
    getDynamicApps().map(entry => ({
      id: entry.manifest.id,
      name: entry.manifest.name,
      icon: entry.manifest.icon,
      color: entry.manifest.color,
      category: entry.manifest.category,
      description: entry.manifest.description,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }))
  );

  /* ---------- context_menu ---------- */

  registerHandler('context_menu.list_scopes', () =>
    ContextMenuRegistry.scopes().map(scope => ({
      scope,
      entries: ContextMenuRegistry.entriesForScope(scope).length,
      hasOverride: ContextMenuRegistry.hasOverride(scope),
    }))
  );

  registerHandler('context_menu.list_entries', ({ scope }) => {
    const all = ContextMenuRegistry.all();
    if (!scope) return all.map(e => ({ id: e.id, label: typeof e.label === 'function' ? '(dynamic)' : e.label, scope: e.scope, icon: typeof e.icon === 'function' ? '(dynamic)' : e.icon, group: e.group, order: e.order, source: e.source }));
    return ContextMenuRegistry.entriesForScope(scope).map(e => ({ id: e.id, label: typeof e.label === 'function' ? '(dynamic)' : e.label, scope: e.scope, icon: typeof e.icon === 'function' ? '(dynamic)' : e.icon, group: e.group, order: e.order, source: e.source }));
  });

  registerHandler('context_menu.list_overrides', () =>
    ContextMenuRegistry.allOverrides().map(o => ({
      scope: o.scope,
      id: o.id,
      itemCount: Array.isArray(o.items) ? o.items.length : 0,
      hasBuilder: typeof o.builder === 'function',
      source: o.source,
    }))
  );

  registerHandler('context_menu.unregister', ({ id }) => {
    if (!id) throw new Error('missing id');
    const existed = ContextMenuRegistry.has(id);
    ContextMenuRegistry.unregister(id);
    return { id, removed: existed };
  });

  registerHandler('context_menu.remove_override', ({ scope }) => {
    if (!scope) throw new Error('missing scope');
    const existed = ContextMenuRegistry.hasOverride(scope);
    ContextMenuRegistry.removeOverride(scope);
    return { scope, removed: existed };
  });

  registerHandler('context_menu.unregister_all', ({ sourceType, sourceId }) => {
    if (!sourceType || !sourceId) throw new Error('missing sourceType or sourceId');
    ContextMenuRegistry.unregisterAll(sourceType, sourceId);
    return { sourceType, sourceId, removed: true };
  });
}

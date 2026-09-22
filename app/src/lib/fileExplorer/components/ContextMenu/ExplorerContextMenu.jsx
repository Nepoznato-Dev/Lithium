/**
 * Context menu builder — constructs menu items from the ActionRegistry.
 *
 * Built-in actions are registered by the files in ./actions/ and exposed
 * through ActionRegistry.buildMenu().  This hook is the thin bridge
 * between the File Explorer's signals/state and the registry.
 */
import { useCallback, useRef } from 'react';
import { useContextMenu } from '../../../../Components/Desktop/ContextMenu';
import {
  nav, selectedItems, clipboard, viewMode, pins, dialog,
  archiveDialog,
} from '../../state/signals.jsx';
import {
  getEntry, isTrashed,
} from '../../../fileSystem.js';
import { ActionRegistry } from '../../contextMenu/ActionRegistry';
import { notify } from '../../../desktop/notify.js';
import { ContextMenuRegistry } from '../../../desktop/contextMenuRegistry.js';

// Side-effect: register all built-in actions.
import '../../contextMenu/actions/openActions';
import '../../contextMenu/actions/fileActions';
import '../../contextMenu/actions/archiveActions';
import '../../contextMenu/actions/viewActions';
import '../../contextMenu/actions/toolActions';

export function useExplorerContextMenu({
  tree, commit, drive, openItem, handleDelete, handleRestore,
  handleCompressZip, handleCompressTar, handleCompressArchive,
  handleExtractArchive, handleDownload, handleImportArchive,
  refreshCloud, goDrive, updateConfigs, openReconnect,
}) {
  const [menu, openMenu, closeMenu] = useContextMenu();

  // Store latest values in refs so the stable callbacks below always
  // see current state without needing it in their dependency arrays.
  const depsRef = useRef({});
  depsRef.current = {
    tree, commit, drive, openItem, handleDelete, handleRestore,
    handleCompressZip, handleCompressTar, handleCompressArchive,
    handleExtractArchive, handleDownload, handleImportArchive,
    refreshCloud, goDrive, updateConfigs, openReconnect,
  };

  const togglePin = (id) => {
    pins.value = pins.value.includes(id) ? pins.value.filter(p => p !== id) : [...pins.value, id];
  };

  /**
   * Build the ActionContext that every registered action receives.
   *
   * `folderId` is read here rather than captured from the render scope: the
   * callbacks in this hook are memoised so they stay the first render's
   * closures, and a folder id frozen at that point would make every action
   * that takes one (`fs.refresh`) target the folder the user navigated away
   * from. ExplorerShell subscribes to `nav` on its own, so dropping the
   * render-scope read costs no reactivity.
   */
  const buildCtx = () => {
    const d = depsRef.current;
    return {
      tree: d.tree,
      commit: d.commit,
      drive: d.drive,
      folderId: nav.value.stack[nav.value.stack.length - 1]?.id,
      clipboard,
      pins: pins.value,
      togglePin,
      openItem: d.openItem,
      notify,
      dialog,
      viewMode,
      archiveDialog,
      handleDownload: d.handleDownload,
      handleImportArchive: d.handleImportArchive,
      handleCompressZip: d.handleCompressZip,
      handleCompressTar: d.handleCompressTar,
      handleCompressArchive: d.handleCompressArchive,
      handleExtractArchive: d.handleExtractArchive,
      refreshCloud: d.refreshCloud,
      goDrive: d.goDrive,
      updateConfigs: d.updateConfigs,
      openReconnect: d.openReconnect,
      selectedItems,
      meta: {},
    };
  };

  /**
   * Resolve the entries a selection-scoped action should receive. Registry
   * actions take entries, not ids, and they resolve them out of the local tree
   * — so on a cloud drive this is empty and entry actions correctly disappear.
   */
  const resolveEntries = () =>
    [...selectedItems.value]
      .map(id => getEntry(depsRef.current.tree, id))
      .filter(Boolean);

  /**
   * Run a registered action from outside the context menu.
   *
   * `scope` names the right-click surface the action was written against, so
   * the toolbar has to claim it explicitly: folder-level buttons (New folder,
   * Upload) act on empty space, selection buttons act on the selected entries.
   */
  const executeAction = useCallback((id, scope) => {
    const entries = scope === 'empty' ? [] : resolveEntries();
    const ctx = buildCtx();
    ctx.selectedEntries = entries;
    ctx.scope = scope;
    return ActionRegistry.execute(id, entries, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Everything the toolbar needs to render one button: whether the action
   * applies at all, whether it is enabled, and its label/icon/danger styling.
   * Read from the same descriptors the menu is built from, so a button and its
   * menu twin can never disagree about when they are available.
   */
  const actionState = useCallback((id, scope) => {
    const entries = scope === 'empty' ? [] : resolveEntries();
    const ctx = buildCtx();
    ctx.selectedEntries = entries;
    ctx.scope = scope;
    const a = ActionRegistry.get(id);
    if (!a) return { visible: false, enabled: false, label: id, icon: null, danger: false };
    let visible = true;
    try { if (typeof a.when === 'function' && !a.when(ctx)) visible = false; } catch { visible = false; }
    let enabled = true;
    try { if (typeof a.enabled === 'function' && !a.enabled(ctx)) enabled = false; } catch { enabled = false; }
    const pick = v => (typeof v === 'function' ? v(entries, ctx) : v);
    return {
      visible,
      enabled: enabled && visible,
      label: pick(a.label) || id,
      icon: pick(a.icon) || null,
      danger: Boolean(a.danger),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trashedMenu = (entry) => {
    const d = depsRef.current;
    return [
      { id: 'open', label: 'Open', icon: entry.type === 'folder' ? 'Folder' : 'FileText', action: () => d.openItem(entry) },
      { id: 'sep-1', type: 'separator' },
      { id: 'restore', label: 'Restore', icon: 'Undo2', action: () => d.handleRestore(entry) },
      { id: 'sep-2', type: 'separator' },
      { id: 'delete', label: 'Delete permanently', icon: 'Trash2', shortcut: 'Del', danger: true, action: () => d.handleDelete(entry) },
    ];
  };

  const entryMenu = (entry) => {
    /* Virtual .li shortcuts get a minimal menu — Open only. */
    if (entry.shortcut) {
      const d = depsRef.current;
      return [
        { id: 'open', label: `Open ${entry.name}`, icon: entry.icon || 'ExternalLink', action: () => d.openItem(entry) },
      ];
    }
    if (isTrashed(entry)) return trashedMenu(entry);
    const d = depsRef.current;
    const multiSelect = selectedItems.value.size > 1;
    const selectedEntries = multiSelect
      ? [...selectedItems.value].map(id => getEntry(d.tree, id)).filter(Boolean)
      : [entry];
    const scope = multiSelect ? 'multi' : 'entry';
    const ctx = buildCtx();
    const defaultItems = ActionRegistry.buildMenu(selectedEntries, ctx, scope);

    // Merge ContextMenuRegistry contributions (apps/extensions).
    const explorerScope = multiSelect ? 'file-multi' : 'file-entry';
    const { items: contributed, isOverride } = ContextMenuRegistry.buildForScope(explorerScope, { ...ctx, selectedEntries });
    if (isOverride) return contributed;
    if (contributed.length === 0) return defaultItems;
    return [
      ...defaultItems,
      { id: 'ctx-registry-sep', type: 'separator' },
      ...contributed,
    ];
  };

  const emptyMenu = () => {
    const ctx = buildCtx();
    const defaultItems = ActionRegistry.buildMenu([], ctx, 'empty');

    // Merge ContextMenuRegistry contributions for empty-space scope.
    const { items: contributed, isOverride } = ContextMenuRegistry.buildForScope('file-empty', { ...ctx, selectedEntries: [] });
    if (isOverride) return contributed;
    if (contributed.length === 0) return defaultItems;
    return [
      ...defaultItems,
      { id: 'ctx-registry-sep', type: 'separator' },
      ...contributed,
    ];
  };

  // Stable callbacks — read latest state from refs at event time.
  // This prevents cascade re-renders through FileList → FileGrid → FileItem.
  const onItemContext = useCallback((event, entry) => {
    const d = depsRef.current;
    if (!selectedItems.value.has(entry.id)) {
      selectedItems.value = new Set([entry.id]);
    }
    const items = entryMenu(entry);
    const ctx = buildCtx();
    const multiSelect = selectedItems.value.size > 1;
    ctx.selectedEntries = multiSelect
      ? [...selectedItems.value].map(id => getEntry(d.tree, id)).filter(Boolean)
      : [entry];
    openMenu(event, items, ctx);
  }, [openMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEmptyContext = useCallback((event) => {
    if (event.target !== event.currentTarget) return;
    selectedItems.value = new Set();
    const items = emptyMenu();
    const ctx = buildCtx();
    ctx.selectedEntries = [];
    openMenu(event, items, ctx);
  }, [openMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  return { menu, openMenu, closeMenu, onItemContext, onEmptyContext, executeAction, actionState };
}

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
  nav, view, selectedItems, clipboard, viewMode, pins, dialog,
  archiveDialog,
} from '../../state/signals.jsx';
import {
  getEntry, isTrashed, childrenOf, subtreeFolderIds, TRASH_ID,
} from '../../../fileSystem.js';
import { ActionRegistry } from '../../contextMenu/ActionRegistry';
import { notify } from '../../../desktop/notify.js';

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

  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;

  const togglePin = (id) => {
    pins.value = pins.value.includes(id) ? pins.value.filter(p => p !== id) : [...pins.value, id];
  };

  /** Build the ActionContext that every registered action receives. */
  const buildCtx = () => {
    const d = depsRef.current;
    return {
      tree: d.tree,
      commit: d.commit,
      drive: d.drive,
      folderId,
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
    if (isTrashed(entry)) return trashedMenu(entry);
    const d = depsRef.current;
    const multiSelect = selectedItems.value.size > 1;
    const selectedEntries = multiSelect
      ? [...selectedItems.value].map(id => getEntry(d.tree, id)).filter(Boolean)
      : [entry];
    const scope = multiSelect ? 'multi' : 'entry';
    const ctx = buildCtx();
    return ActionRegistry.buildMenu(selectedEntries, ctx, scope);
  };

  const emptyMenu = () => {
    const ctx = buildCtx();
    return ActionRegistry.buildMenu([], ctx, 'empty');
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

  return { menu, openMenu, closeMenu, onItemContext, onEmptyContext };
}

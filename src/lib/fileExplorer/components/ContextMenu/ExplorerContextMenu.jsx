/**
 * Context menu builder — constructs menu items from extension registry + built-in actions.
 * Replaces the inline entryMenu() / emptyMenu() from the monolith.
 */
import { useContextMenu } from '../../../../Components/Desktop/ContextMenu';
import {
  nav, view, selectedItems, clipboard, viewMode, pins, dialog,
} from '../../state/signals.jsx';
import {
  childrenOf, getEntry, isTrashed, moveEntry, duplicateSubtreeDeep,
  subtreeFolderIds, TRASH_ID,
} from '../../../fileSystem.js';

export function useExplorerContextMenu({
  tree, commit, drive, openItem, handleDelete, handleRestore,
  handleCompressZip, handleCompressTar, handleDownload, handleImportArchive,
  refreshCloud, goDrive, updateConfigs, openReconnect,
}) {
  const [menu, openMenu, closeMenu] = useContextMenu();

  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;

  const clipboardEntry = clipboard.value && !drive ? getEntry(tree, clipboard.value.id) : null;
  const canPaste = Boolean(clipboardEntry)
    && !(clipboard.value?.op === 'cut' && subtreeFolderIds(tree, clipboard.value.id).includes(folderId))
    && (clipboard.value?.op === 'copy' || clipboardEntry?.parentId !== folderId);

  const togglePin = (id) => {
    pins.value = pins.value.includes(id) ? pins.value.filter(p => p !== id) : [...pins.value, id];
  };

  const handlePaste = () => {
    if (!canPaste) return;
    (async () => {
      if (clipboard.value.op === 'copy') {
        commit(await duplicateSubtreeDeep(tree, clipboard.value.id, folderId));
      } else {
        commit(moveEntry(tree, clipboard.value.id, folderId));
        clipboard.value = null;
      }
    })();
  };

  const entryMenu = (entry) => {
    if (isTrashed(entry)) {
      return [
        { id: 'open', label: 'Open', icon: entry.type === 'folder' ? 'Folder' : 'FileText', action: () => openItem(entry) },
        { id: 'sep-1', type: 'separator' },
        { id: 'restore', label: 'Restore', icon: 'Undo2', action: () => handleRestore(entry) },
        { id: 'sep-2', type: 'separator' },
        { id: 'delete', label: 'Delete permanently', icon: 'Trash2', shortcut: 'Del', danger: true, action: () => handleDelete(entry) },
      ];
    }
    return [
      { id: 'open', label: entry.type === 'folder' ? 'Open' : 'Open', icon: entry.type === 'folder' ? 'Folder' : 'FileText', shortcut: 'Enter', action: () => openItem(entry) },
      ...(entry.type === 'image' && !drive ? [{ id: 'view', label: 'View', icon: 'Eye', action: () => openItem(entry) }] : []),
      { id: 'sep-1', type: 'separator' },
      ...(!drive ? [
        { id: 'copy', label: 'Copy', icon: 'Copy', shortcut: 'Ctrl+C', action: () => { clipboard.value = { op: 'copy', id: entry.id }; } },
        { id: 'cut', label: 'Cut', icon: 'Scissors', shortcut: 'Ctrl+X', action: () => { clipboard.value = { op: 'cut', id: entry.id }; } },
        {
          id: 'move', label: 'Move to', icon: 'Folder',
          items: childrenOf(tree, 'root').filter(f => f.type === 'folder' && f.id !== entry.parentId).map(folder => ({
            id: `mv-${folder.id}`, label: folder.name, icon: 'Folder',
            action: () => commit(moveEntry(tree, entry.id, folder.id)),
          })),
        },
        { id: 'sep-2', type: 'separator' },
      ] : []),
      ...(entry.type === 'folder' && !drive ? [
        {
          id: 'pin', label: pins.value.includes(entry.id) ? 'Remove from Quick access' : 'Add to Quick access', icon: 'Pin',
          action: () => togglePin(entry.id),
        },
      ] : []),
      { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => { dialog.value = { mode: 'rename', entry }; } },
      ...(!drive ? [{ id: 'duplicate', label: 'Duplicate', icon: 'Copy', action: () => commit(duplicateSubtreeDeep(tree, entry.id, entry.parentId)) }] : []),
      ...(!drive && entry.type === 'folder' ? [
        { id: 'sep-zip', type: 'separator' },
        { id: 'compress-zip', label: 'Compress as ZIP', icon: 'PackageOpen', action: () => handleCompressZip(entry) },
        { id: 'compress-tar', label: 'Compress as TAR', icon: 'PackageOpen', action: () => handleCompressTar(entry) },
        { id: 'import-archive', label: 'Import archive here', icon: 'FolderPlus', action: () => handleImportArchive() },
      ] : []),
      ...(!drive && entry.idb && /\.(zip|tar\.gz|tgz)$/i.test(entry.name) ? [
        { id: 'sep-dl', type: 'separator' },
        { id: 'download', label: 'Download', icon: 'Download', action: () => handleDownload(entry) },
      ] : []),
      { id: 'sep-3', type: 'separator' },
      { id: 'delete', label: 'Delete', icon: 'Trash2', shortcut: 'Del', danger: true, action: () => handleDelete(entry) },
    ];
  };

  const emptyMenu = () => [
    { id: 'new-folder', label: 'New folder', icon: 'FolderPlus', action: () => { dialog.value = { mode: 'folder' }; } },
    ...(!drive ? [{ id: 'new-file', label: 'New text file', icon: 'Plus', action: () => { dialog.value = { mode: 'file' }; } }] : []),
    ...(!drive ? [
      { id: 'sep-1', type: 'separator' },
      { id: 'paste', label: 'Paste', icon: 'ClipboardPaste', shortcut: 'Ctrl+V', disabled: !canPaste, action: handlePaste },
    ] : []),
    { id: 'sep-2', type: 'separator' },
    { id: 'upload', label: 'Upload file\u2026', icon: 'Upload', action: () => { /* upload ref click — handled by ExplorerShell */ } },
    ...(!drive ? [
      { id: 'import-archive', label: 'Import archive\u2026', icon: 'FolderPlus', action: () => handleImportArchive() },
    ] : []),
    ...(drive ? [{ id: 'refresh', label: 'Refresh', icon: 'RefreshCw', action: () => refreshCloud(drive, folderId) }] : []),
    { id: 'sep-3', type: 'separator' },
    {
      id: 'view', label: 'View', icon: 'LayoutGrid',
      items: [
        { id: 'grid', label: 'Large icons', icon: 'LayoutGrid', checked: viewMode.value === 'grid', action: () => { viewMode.value = 'grid'; } },
        { id: 'list', label: 'Details', icon: 'List', checked: viewMode.value === 'list', action: () => { viewMode.value = 'list'; } },
      ],
    },
  ];

  const onItemContext = (event, entry) => {
    selectedItems.value = new Set([entry.id]);
    openMenu(event, entryMenu(entry));
  };

  const onEmptyContext = (event) => {
    if (event.target !== event.currentTarget) return;
    selectedItems.value = new Set();
    openMenu(event, emptyMenu());
  };

  return { menu, openMenu, closeMenu, onItemContext, onEmptyContext };
}

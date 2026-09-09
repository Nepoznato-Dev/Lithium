/**
 * ExplorerShell — root layout composing all sub-components.
 * Extracted from the monolithic FileManagerApp's return block.
 */
import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useMemoCompare } from '../hooks/useMemoCompare.js';
import Icon from '../../../Components/Icon';
import { PngIcon } from './common/PngIcon.jsx';
import ContextMenu from '../../../Components/Desktop/ContextMenu';
import {
  childrenOf, createEntry, duplicateSubtreeDeep, getEntry, isTrashed,
  migrateTree, moveEntry, pathOf, purgeTrash, readEntryContent,
  removeEntryDeep, restoreEntry, storeEntryContent, subtreeFolderIds,
  trashEntry, TRASH_ID, trashedItems, updateEntry,
} from '../../fileSystem.js';
import {
  PROVIDERS, CloudAuthError, createFolder as cloudCreateFolder,
  deleteItem as cloudDeleteItem, downloadBlob, listChildren,
  renameItem as cloudRename, uploadFile,
} from '../../cloudDrives.js';
import { storage, getSnapshotStats, putBlob, getBlob } from '../../storage';
import { invalidateBreakdown } from '../../storage/storageBreakdown.js';
import { startAppSweeper } from '../../storage/appStateSerializer.js';
import { registerBlobDownload } from '../../downloads.js';
import {
  exportFolderZip, importZipToFolder,
} from '../../storage/zipArchive.js';
import {
  exportFolderTar, importTarToFolder,
} from '../../storage/tarArchive.js';
import { getDefaultApp, FILE_ASSOCIATIONS } from '../../fileSystem/fileAssociations.js';
import { notify } from '../../../lib/desktop/notify.js';

import {
  tabs, activeTabId, nav, view, viewMode, selectedItems, clipboard,
  draggingId, dialog, editor, preview, connectOpen, storageOpen,
  archiveDialog, cloudError, cloudLoading, cloudItems, authIssue, reconnectConfig,
  snapshot, draft, pins, showSidebar, showPreviewPane,
} from '../state/signals.jsx';

import TabBar from './TabBar/TabBar.jsx';
import Sidebar from './Sidebar/Sidebar.jsx';
import AddressBar from './AddressBar/AddressBar.jsx';
import FileList from './FileList/FileList.jsx';
import PreviewPane from './PreviewPane/PreviewPane.jsx';
import StatusBar from './StatusBar/StatusBar.jsx';
import DragOverlay from './common/DragOverlay.jsx';
import { useExplorerContextMenu } from './ContextMenu/ExplorerContextMenu.jsx';
import { useExplorerShortcuts } from '../contextMenu/shortcutManager.js';
import RenameDialog from './Dialogs/RenameDialog.jsx';
import NewItemDialog from './Dialogs/NewItemDialog.jsx';
import ConnectDialog from './Dialogs/ConnectDialog.jsx';
import StoragePanel from './Dialogs/StoragePanel.jsx';
import ArchiveDialog from './Dialogs/ArchiveDialog.jsx';
import GalleryVirtualized from './GalleryVirtualized.jsx';

const QUICK_META = {
  Desktop: { icon: 'Monitor', color: '#38bdf8' },
  Downloads: { icon: 'Download', color: '#22c55e' },
  Documents: { icon: 'FileText', color: '#60a5fa' },
  Pictures: { icon: 'Image', color: '#38bdf8' },
  Music: { icon: 'Music', color: '#f472b6' },
  Videos: { icon: 'Film', color: '#a78bfa' },
};

/** Map icon names to PNG filenames in public/icons/ */
const ICON_PNG_MAP = {
  Folder: 'files',
  Image: 'gallery',
  Film: 'film',
  Music: 'music-note',
  FileText: 'notes',
  Archive: 'archive',
  BrainCircuit: 'cortex',
  Code2: 'code-studio',
  Gamepad2: 'hydrux',
  Snowflake: 'snowflake',
  FileJson: 'file-json',
};

export default function ExplorerShell({ tree, commit, configs, setConfigs, closeSelf, minimizeSelf, maximizeSelf, isMaximized, windowed }) {
  const uploadRef = useRef(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const drive = nav.value.driveId === 'local' ? null : configs.find(c => c.id === nav.value.driveId) || null;
  const folderId = nav.value.stack[nav.value.stack.length - 1]?.id;

  // Sync nav/tabs
  useEffect(() => {
    tabs.value = tabs.value.map(t => t.id === activeTabId.value ? { ...t, driveId: nav.value.driveId, stack: nav.value.stack, view: view.value } : t);
  }, [nav.value, view.value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => storage.set('fs-pins', pins.value), [pins.value]);
  useEffect(() => storage.set('fs-clipboard', clipboard.value), [clipboard.value]);

  // Deep links
  useEffect(() => {
    const onOpenFile = event => {
      const entry = getEntry(tree, event.detail);
      if (!entry) return;
      const path = pathOf(tree, entry.id);
      view.value = 'files';
      if (entry.type === 'folder') {
        nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, ...path.map(p => ({ id: p.id, name: p.name }))] };
      } else {
        const parents = path.slice(0, -1);
        nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, ...parents.map(p => ({ id: p.id, name: p.name }))] };
        selectedItems.value = new Set([entry.id]);
      }
    };
    window.addEventListener('lithium:open-file', onOpenFile);
    return () => window.removeEventListener('lithium:open-file', onOpenFile);
  }, [tree]);

  // Migrate oversized content
  useEffect(() => { migrateTree(tree, commit); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the app-state idle sweeper once
  useEffect(() => { startAppSweeper(); }, []);

  // Invalidate breakdown cache on every tree mutation
  useEffect(() => { invalidateBreakdown(); }, [tree]);

  // Storage snapshot — live-refresh after every tree mutation and while the panel is open
  const snapTimer = useRef(null);
  const refreshSnapshot = useCallback(async () => {
    snapshot.value = { ...(await (await import('../../storage/manager.js')).storageSnapshot()), fs: getSnapshotStats() };
  }, []);
  // Debounced refresh after any tree change (file ops, compress, delete, import, etc.)
  useEffect(() => {
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(refreshSnapshot, 600);
    return () => clearTimeout(snapTimer.current);
  }, [tree, refreshSnapshot]);
  // Note: periodic refresh is now handled internally by StoragePanel to avoid
  // cascading re-renders through ExplorerShell every 4 seconds.

  // Cloud refresh
  const refreshCloud = useCallback(async (config, id) => {
    cloudLoading.value = true;
    cloudError.value = '';
    try {
      cloudItems.value = await listChildren(config, id);
      authIssue.value = prev => (prev?.id === config.id ? null : prev);
    } catch (err) {
      if (err instanceof CloudAuthError) authIssue.value = config;
      else cloudError.value = err.message || 'Failed to load drive';
      cloudItems.value = [];
    } finally {
      cloudLoading.value = false;
    }
  }, []);

  useEffect(() => {
    if (view.value === 'files' && drive) refreshCloud(drive, folderId);
  }, [view.value, drive, folderId, refreshCloud]);

  // Content-stable items: same folder content → same array reference →
  // FileGrid/FileTable memo can bail out even when tree reference changes.
  const items = useMemoCompare(
    () => {
      if (view.value !== 'files') return [];
      return drive ? cloudItems.value : childrenOf(tree, folderId);
    },
    [view.value, drive, folderId, tree, cloudItems.value],
    (prev, next) => prev.length === next.length && prev.every((e, i) => e === next[i])
  );
  const allLocalFiles = useMemo(() => tree.filter(e => e.type !== 'folder'), [tree]);
  const recentFiles = useMemo(() => [...allLocalFiles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12), [allLocalFiles]);
  const allImages = useMemo(() => allLocalFiles.filter(e => e.type === 'image'), [allLocalFiles]);

  // Memoize childrenOf calls to avoid repeated tree filtering
  const rootChildren = useMemo(() => childrenOf(tree, 'root'), [tree]);
  const currentFolderChildren = useMemo(() => childrenOf(tree, folderId), [tree, folderId]);

  // Pre-compute folder children counts for home view (moved out of renderHome to satisfy Rules of Hooks)
  const folderChildrenCounts = useMemo(() => {
    const counts = {};
    rootChildren.filter(e => e.type === 'folder').forEach(folder => {
      counts[folder.id] = childrenOf(tree, folder.id).length;
    });
    return counts;
  }, [tree, rootChildren]);

  // Navigation helpers
  const goDrive = useCallback((driveId) => {
    selectedItems.value = new Set();
    view.value = 'files';
    if (driveId === 'local') {
      authIssue.value = null;
      cloudError.value = '';
      cloudItems.value = [];
      nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }] };
    } else {
      const config = configs.find(e => e.id === driveId);
      nav.value = { driveId, stack: [{ id: null, name: `${config.label} (${config.letter}:)` }] };
    }
  }, [configs]);

  const openReconnect = useCallback((config) => {
    reconnectConfig.value = config;
    connectOpen.value = true;
  }, []);

  const updateConfigs = useCallback((next) => { setConfigs(next); (async () => { const { saveDriveConfigs } = await import('../../cloudDrives.js'); saveDriveConfigs(next); })(); }, [setConfigs]);

  // Open item
  const openItem = useCallback(async (entry) => {
    if (entry.type === 'folder') {
      selectedItems.value = new Set();
      nav.value = { ...nav.value, stack: [...nav.value.stack, { id: entry.id, name: entry.name }] };
      return;
    }
    if (!drive) {
      const local = getEntry(tree, entry.id);
      if (local?.ref) {
        window.dispatchEvent(new CustomEvent('lithium:open-browser', { detail: local.ref }));
        return;
      }
      // Check file associations — dispatch to the registered app
      const assoc = getDefaultApp(entry.name);
      if (assoc && assoc.appId !== 'files') {
        window.dispatchEvent(new CustomEvent('lithium:launch-app', {
          detail: { appId: assoc.appId, fileEntry: entry },
        }));
        return;
      }
      if (entry.type === 'text') {
        editor.value = local;
        draft.value = await readEntryContent(local);
      } else if (entry.type === 'image') {
        preview.value = { name: entry.name, url: await readEntryContent(entry), kind: 'image' };
      } else if (entry.type === 'video') {
        preview.value = { name: entry.name, url: await readEntryContent(local), kind: 'video' };
      } else {
        const content = await readEntryContent(local);
        const isBlob = content instanceof Blob;
        const anchor = document.createElement('a');
        anchor.href = isBlob ? URL.createObjectURL(content) : content;
        anchor.download = entry.name;
        anchor.click();
        if (isBlob) setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
      }
      return;
    }
    try {
      const blob = await downloadBlob(drive, entry);
      if (entry.type === 'image') {
        preview.value = { name: entry.name, url: URL.createObjectURL(blob), kind: 'image' };
      } else if (entry.type === 'video') {
        preview.value = { name: entry.name, url: URL.createObjectURL(blob), kind: 'video' };
      } else if (entry.type === 'text') {
        preview.value = { name: entry.name, url: null, kind: 'text', text: await blob.text() };
      } else {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(blob);
        anchor.download = entry.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
        registerBlobDownload(entry.name, blob).catch(() => {});
      }
    } catch (err) {
      cloudError.value = err.message || 'Download failed';
    }
  }, [tree, drive]);

  const runAction = useCallback(async (action) => {
    try { await action(); }
    catch (err) {
      if (err instanceof CloudAuthError && drive) authIssue.value = drive;
      cloudError.value = err.message || 'Action failed';
    }
  }, [drive]);

  // Upload
  const handleUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!drive) {
      const isText = file.type.startsWith('text/') || /\.(txt|md|json|csv|log)$/i.test(file.name);
      const type = file.type.startsWith('image/') ? 'image' : isText ? 'text' : 'file';
      const reader = new FileReader();
      reader.onload = async () => {
        const arr = createEntry(tree, { name: file.name, type, parentId: folderId, content: '' });
        try {
          const stored = await storeEntryContent(arr[arr.length - 1], String(reader.result));
          commit([...arr.slice(0, -1), stored]);
        } catch (err) {
          cloudError.value = err.message || 'File is too large for local storage';
        }
      };
      if (isText) reader.readAsText(file);
      else reader.readAsDataURL(file);
      return;
    }
    runAction(async () => { await uploadFile(drive, folderId, file); refreshCloud(drive, folderId); });
  }, [tree, commit, drive, folderId, refreshCloud, runAction]);

  // Delete / Restore / Rename
  const handleDelete = useCallback((entry) => {
    if (!entry) return;
    if (isTrashed(entry)) {
      if (!window.confirm(`Permanently delete "${entry.name}"? This cannot be undone.`)) return;
      runAction(async () => { commit(await removeEntryDeep(tree, entry.id)); selectedItems.value = new Set(); });
      return;
    }
    if (!drive) { commit(trashEntry(tree, entry.id)); selectedItems.value = new Set(); return; }
    if (!window.confirm(`Delete "${entry.name}" from ${drive.label}?`)) return;
    runAction(async () => { await cloudDeleteItem(drive, entry.id); selectedItems.value = new Set(); refreshCloud(drive, folderId); });
  }, [tree, commit, drive, folderId, refreshCloud, runAction]);

  const handleRestore = useCallback((entry) => {
    if (!entry || !isTrashed(entry)) return;
    commit(restoreEntry(tree, entry.id));
    selectedItems.value = new Set();
  }, [tree, commit]);

  const handleEmptyTrash = useCallback(() => {
    const count = trashedItems(tree).length;
    if (count === 0) return;
    if (!window.confirm(`Permanently delete ${count} item${count === 1 ? '' : 's'} from the Recycle Bin? This cannot be undone.`)) return;
    runAction(async () => { commit(await purgeTrash(tree)); selectedItems.value = new Set(); });
  }, [tree, commit, runAction]);

  const handleRename = useCallback((name) => {
    const d = dialog.value;
    if (!d?.entry) return;
    if (!drive) { commit(updateEntry(tree, d.entry.id, { name })); dialog.value = null; return; }
    runAction(async () => { await cloudRename(drive, d.entry.id, name); dialog.value = null; refreshCloud(drive, folderId); });
  }, [tree, commit, drive, folderId, refreshCloud, runAction]);

  const handleNewFolder = useCallback((name) => {
    if (!drive) { commit(createEntry(tree, { name, type: 'folder', parentId: folderId })); dialog.value = null; return; }
    runAction(async () => { await cloudCreateFolder(drive, folderId, name); dialog.value = null; refreshCloud(drive, folderId); });
  }, [tree, commit, drive, folderId, refreshCloud, runAction]);

  // Compress to workspace / download / import
  const compressToEntry = useCallback(async (entry, format) => {
    if (!entry || entry.type !== 'folder' || drive) return;
    const ext = format === 'tar' ? '.tar.gz' : '.zip';
    const archiveName = `${entry.name}${ext}`;
    const blob = format === 'tar'
      ? await exportFolderTar(tree, entry.id)
      : await exportFolderZip(tree, entry.id);
    const arr = createEntry(tree, { name: archiveName, type: 'file', parentId: entry.parentId, content: '' });
    const newEntry = arr[arr.length - 1];
    await putBlob(newEntry.id, blob, { name: archiveName });
    const stored = { ...newEntry, content: null, idb: true, size: blob.size };
    commit([...arr.slice(0, -1), stored]);
  }, [tree, drive, commit]);

  const handleCompressZip = useCallback(async (entry) => {
    try { await compressToEntry(entry, 'zip'); }
    catch (err) { cloudError.value = err.message || 'ZIP compression failed'; }
  }, [compressToEntry]);

  const handleCompressTar = useCallback(async (entry) => {
    try { await compressToEntry(entry, 'tar'); }
    catch (err) { cloudError.value = err.message || 'TAR compression failed'; }
  }, [compressToEntry]);

  // Multi-format compress via ArchiveDialog
  const handleCompressArchive = useCallback((entries, format) => {
    const list = Array.isArray(entries) ? entries : [entries];
    archiveDialog.value = { mode: 'compress', entries: list, format };
  }, []);

  // Extract archive via ArchiveDialog
  const handleExtractArchive = useCallback((entries) => {
    const list = Array.isArray(entries) ? entries : [entries];
    archiveDialog.value = { mode: 'extract', entries: list };
  }, []);

  const handleDownload = useCallback(async (entry) => {
    if (!entry || drive) return;
    try {
      const local = getEntry(tree, entry.id);
      if (!local?.idb) return;
      const blob = await getBlob(local.blobRef || local.id);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = entry.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { cloudError.value = err.message || 'Download failed'; }
  }, [tree, drive]);

  const handleImportArchive = useCallback(() => {
    if (drive) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.tar.gz,.tgz';
    input.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const isTar = /\.(tar\.gz|tgz)$/i.test(file.name);
        const result = isTar
          ? await importTarToFolder(tree, folderId, file, { nameOverride: file.name.replace(/\.(tar\.gz|tgz)$/i, '') })
          : await importZipToFolder(tree, folderId, file, { nameOverride: file.name.replace(/\.zip$/i, '') });
        commit(result.tree);
      } catch (err) { cloudError.value = err.message || 'Import failed'; }
    };
    input.click();
  }, [tree, drive, folderId, commit]);

  const handleImportZip = useCallback(() => {
    if (drive) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = await importZipToFolder(tree, folderId, file, { nameOverride: file.name.replace(/\.zip$/i, '') });
        commit(result.tree);
      } catch (err) { cloudError.value = err.message || 'ZIP import failed'; }
    };
    input.click();
  }, [tree, drive, folderId, commit]);

  // Context menu
  const { menu, closeMenu, onItemContext, onEmptyContext } = useExplorerContextMenu({
    tree, commit, drive, openItem, handleDelete, handleRestore,
    handleCompressZip, handleCompressTar, handleCompressArchive,
    handleExtractArchive, handleDownload, handleImportArchive,
    refreshCloud, goDrive, updateConfigs, openReconnect,
  });

  // Keyboard shortcuts (Ctrl+C, Ctrl+V, Del, F2, etc.)
  useExplorerShortcuts({
    tree,
    commit,
    selectedItems,
    ctx: {
      drive, folderId, clipboard, openItem, dialog, viewMode,
      pins,
      togglePin: (id) => { pins.value = pins.value.includes(id) ? pins.value.filter(p => p !== id) : [...pins.value, id]; },
      notify,
      archiveDialog, handleDownload, handleImportArchive,
      handleCompressZip, handleCompressTar, handleCompressArchive,
      handleExtractArchive, refreshCloud,
    },
  });

  // Upload event listener — dispatched by the context menu's "Upload file..." action.
  useEffect(() => {
    const onUpload = () => { uploadRef.current?.click(); };
    window.addEventListener('lithium:explorer-upload', onUpload);
    return () => window.removeEventListener('lithium:explorer-upload', onUpload);
  }, []);

  // Drag & drop — per-entry cached objects so FileItem/FileRow memo
  // is not defeated by new prop objects on every render / drag tick.
  const dragCacheRef = useRef(new Map());
  const emptyDragRef = useRef({});
  const dragProps = useCallback((entry) => {
    if (drive) return emptyDragRef.current;
    let obj = dragCacheRef.current.get(entry.id);
    if (!obj) {
      obj = {
        draggable: true,
        onDragStart: (event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', entry.id);
          draggingId.value = entry.id;
        },
        onDragEnd: () => { draggingId.value = null; },
      };
      dragCacheRef.current.set(entry.id, obj);
    }
    return obj;
  }, [drive]);

  const dropCacheRef = useRef(new Map());
  const emptyDropRef = useRef({});
  const dropTarget = useCallback((targetId) => {
    if (drive) return emptyDropRef.current;
    let obj = dropCacheRef.current.get(targetId);
    if (!obj) {
      obj = {
        onDragOver: (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
        onDrop: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const id = draggingId.value;
          draggingId.value = null;
          if (id && id !== targetId) runAction(async () => commitRef.current(moveEntry(treeRef.current, id, targetId)));
        },
      };
      dropCacheRef.current.set(targetId, obj);
    }
    return obj;
  }, [drive, runAction]);

  const togglePin = useCallback((id) => {
    pins.value = pins.value.includes(id) ? pins.value.filter(p => p !== id) : [...pins.value, id];
  }, []);

  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && (entry.parentId === TRASH_ID || isTrashed(entry));
  })();

  // Home view — extracted to its own component so pins.value reads
  // don't cascade through ExplorerShell (see HomeView below).
  const homeView = (
    <HomeView
      rootChildren={rootChildren}
      folderChildrenCounts={folderChildrenCounts}
      recentFiles={recentFiles}
      openItem={openItem}
      onItemContext={onItemContext}
      togglePin={togglePin}
    />
  );

  // Gallery view with virtualization
  const renderGallery = () => {
    return (
      <GalleryVirtualized
        allImages={allImages}
        openItem={openItem}
        onItemContext={onItemContext}
      />
    );
  };

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-[#1a1b1f] text-white">
      <TabBar windowed={windowed} closeSelf={closeSelf} minimizeSelf={minimizeSelf} maximizeSelf={maximizeSelf} isMaximized={isMaximized} />
      <div className="relative flex min-h-0 flex-1">
        {showSidebar.value && (
          <Sidebar
            tree={tree} configs={configs} updateConfigs={updateConfigs}
            openMenu={onItemContext} goDrive={goDrive} togglePin={togglePin}
            dropTarget={dropTarget}
            setStorageOpen={(v) => storageOpen.value = v}
            setConnectOpen={(v) => connectOpen.value = v}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <AddressBar dropTarget={dropTarget} />
          {view.value === 'home' && homeView}
          {view.value === 'gallery' && renderGallery()}
          {view.value === 'files' && (
            <FileList
              treeRef={treeRef} drive={drive} items={items}
              openItem={openItem} onItemContext={onItemContext} onEmptyContext={onEmptyContext}
              dragProps={dragProps} dropTarget={dropTarget}
            />
          )}
          <StatusBar tree={tree} drive={drive} items={items} />
        </div>
        {showPreviewPane.value && <PreviewPane tree={tree} drive={drive} />}
      </div>

      {/* Dialogs */}
      {dialog.value?.mode === 'rename' && (
        <RenameDialog initial={dialog.value.entry.name} onSubmit={handleRename} onClose={() => dialog.value = null} />
      )}
      {dialog.value?.mode === 'folder' && (
        <NewItemDialog mode="folder" onSubmit={handleNewFolder} onClose={() => dialog.value = null} />
      )}
      {dialog.value?.mode === 'file' && (
        <NewItemDialog mode="file" onSubmit={(name) => {
          commit(createEntry(tree, { name: /\.[a-z0-9]{1,5}$/i.test(name) ? name : `${name}.txt`, type: 'text', parentId: folderId }));
          dialog.value = null;
        }} onClose={() => dialog.value = null} />
      )}

      {/* Text editor overlay */}
      {editor.value && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#1a1b1f]">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
            <PngIcon name="FileText" size={15} color="#60a5fa" />
            <span className="flex-1 truncate text-sm font-medium text-white/90">{editor.value.name}</span>
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={async () => {
              const updated = await storeEntryContent(editor.value, draft.value);
              commit(updateEntry(tree, editor.value.id, { content: updated.content, idb: updated.idb, size: updated.size }));
              editor.value = null;
            }}>Save</button>
            <button className="icon-btn h-8 w-8 rounded-lg hover:bg-white/[0.08]" onClick={() => editor.value = null} aria-label="Close editor"><PngIcon name="X" size={15} /></button>
          </div>
          <textarea className="flex-1 resize-none bg-[#1e1f23] p-5 font-mono text-sm text-white/90 outline-none" value={draft.value} onChange={event => draft.value = event.target.value} spellCheck={false} />
        </div>
      )}

      {/* Preview overlay */}
      {preview.value && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#141416]" onClick={() => { if (preview.value.url?.startsWith('blob:')) URL.revokeObjectURL(preview.value.url); preview.value = null; }}>
          <div className="flex items-center gap-3 px-5 py-3">
            <span className="flex-1 truncate text-sm font-medium text-white/85">{preview.value.name}</span>
            <button className="icon-btn h-8 w-8 rounded-lg hover:bg-white/[0.08]" aria-label="Close preview"><PngIcon name="X" size={15} /></button>
          </div>
          {preview.value.kind === 'image' ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <img src={preview.value.url} alt={preview.value.name} className="max-h-full max-w-full rounded-lg object-contain shadow-lg" />
            </div>
          ) : preview.value.kind === 'video' ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <video src={preview.value.url} controls autoPlay className="max-h-full max-w-full rounded-lg shadow-lg" />
            </div>
          ) : (
            <pre className="flex-1 overflow-auto p-5 font-mono text-xs text-white/80">{preview.value.text}</pre>
          )}
        </div>
      )}

      {connectOpen.value && (
        <ConnectDialog
          configs={configs}
          reconnectConfig={reconnectConfig.value}
          onAdd={config => updateConfigs([...configs, config])}
          onUpdate={config => updateConfigs(configs.map(e => e.id === config.id ? config : e))}
          onRemove={id => updateConfigs(configs.filter(e => e.id !== id))}
          onClose={() => { connectOpen.value = false; reconnectConfig.value = null; }}
        />
      )}

      {storageOpen.value && (
        <StoragePanel
          onRefresh={refreshSnapshot}
          onClose={() => storageOpen.value = false}
          tree={tree}
          commit={commit}
        />
      )}

      {archiveDialog.value && (
        <ArchiveDialog
          mode={archiveDialog.value.mode}
          entries={archiveDialog.value.entries}
          tree={tree}
          commit={commit}
          parentId={folderId}
          onClose={() => { archiveDialog.value = null; }}
          onError={(msg) => { cloudError.value = msg; archiveDialog.value = null; }}
        />
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      {/* Screen-reader live region for context-menu announcements */}
      <div id="nx-ctx-live" aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }} />
      <DragOverlay />
    </div>
  );
}

/**
 * HomeView — isolated component so pins.value reads don't cascade
 * through ExplorerShell.  Only this component re-renders when pins change.
 */
function HomeView({ rootChildren, folderChildrenCounts, recentFiles, openItem, onItemContext, togglePin }) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">Quick access</div>
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(175px,1fr))] gap-2.5">
        {rootChildren.filter(e => e.type === 'folder').map(folder => {
          const meta = QUICK_META[folder.name] || { icon: 'Folder', color: '#f59e0b' };
          const pinned = pins.value.includes(folder.id);
          return (
            <div key={folder.id} className="group flex items-center gap-3 rounded-lg border border-white/[0.08] bg-[#222328] px-3.5 py-3 text-xs text-white/80 transition-colors hover:bg-[#2a2b31]">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { view.value = 'files'; nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id: folder.id, name: folder.name }] }; }}>
                <PngIcon name={meta.icon} size={16} style={{ color: meta.color }} /> <span className="truncate font-medium">{folder.name}</span>
                <span className="ml-auto text-white/35">{folderChildrenCounts[folder.id] || 0}</span>
              </button>
              <button
                className={`${pinned ? 'text-cyan-400' : 'text-white/25 opacity-0 group-hover:opacity-100'} hover:text-white transition-opacity`}
                title={pinned ? 'Unpin' : 'Pin'}
                onClick={() => togglePin(folder.id)}
              >
                <PngIcon name="Pin" size={13} className={pinned ? '' : 'rotate-45'} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">Recent files</div>
      <div className="space-y-0.5">
        {recentFiles.map(entry => {
          const iconName = entry.type === 'image' ? 'Image' : entry.type === 'video' ? 'Film' : 'FileText';
          const iconColor = entry.type === 'image' ? '#f472b6' : entry.type === 'video' ? '#a78bfa' : '#60a5fa';
          const pngName = ICON_PNG_MAP[iconName];
          return (
            <button key={entry.id} className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-xs text-white/75 transition-colors hover:bg-[#222328]" onDoubleClick={() => openItem(entry)} onClick={() => selectedItems.value = new Set([entry.id])} onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}>
              {pngName
                ? <img src={`/icons/${pngName}.png`} alt="" style={{ width: 18, height: 18 }} className="object-contain" />
                : <Icon name={iconName} size={18} color={iconColor} strokeWidth={1.4} />
              }
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="text-white/35 tabular-nums">{new Date(entry.updatedAt).toLocaleDateString()}</span>
            </button>
          );
        })}
        {recentFiles.length === 0 && <p className="text-xs text-white/35">No files yet.</p>}
      </div>
    </div>
  );
}

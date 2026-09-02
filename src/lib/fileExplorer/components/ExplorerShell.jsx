/**
 * ExplorerShell — root layout composing all sub-components.
 * Extracted from the monolithic FileManagerApp's return block.
 */
import { useEffect, useCallback, useMemo, useRef } from 'react';
import Icon from '../../../Components/Icon';
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
import { registerBlobDownload } from '../../downloads.js';
import {
  exportFolderZip, importZipToFolder,
} from '../../storage/zipArchive.js';
import {
  exportFolderTar, importTarToFolder,
} from '../../storage/tarArchive.js';

import {
  tabs, activeTabId, nav, view, viewMode, selectedItems, clipboard,
  draggingId, dialog, editor, preview, connectOpen, storageOpen,
  cloudError, cloudLoading, cloudItems, authIssue, reconnectConfig,
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
import RenameDialog from './Dialogs/RenameDialog.jsx';
import NewItemDialog from './Dialogs/NewItemDialog.jsx';
import ConnectDialog from './Dialogs/ConnectDialog.jsx';
import StoragePanel from './Dialogs/StoragePanel.jsx';

const QUICK_META = {
  Desktop: { icon: 'Monitor', color: '#38bdf8' },
  Downloads: { icon: 'Download', color: '#22c55e' },
  Documents: { icon: 'FileText', color: '#60a5fa' },
  Pictures: { icon: 'Image', color: '#38bdf8' },
  Music: { icon: 'Music', color: '#f472b6' },
  Videos: { icon: 'Film', color: '#a78bfa' },
};

export default function ExplorerShell({ tree, commit, configs, setConfigs, closeSelf, minimizeSelf, maximizeSelf, isMaximized, windowed }) {
  const uploadRef = useRef(null);

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
  // Immediate refresh when the panel opens + periodic refresh while visible
  useEffect(() => {
    if (!storageOpen.value) return;
    refreshSnapshot();
    const id = setInterval(refreshSnapshot, 4000);
    return () => clearInterval(id);
  }, [storageOpen.value, refreshSnapshot]);

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

  const items = view.value === 'files' ? (drive ? cloudItems.value : childrenOf(tree, folderId)) : [];
  const allLocalFiles = useMemo(() => tree.filter(e => e.type !== 'folder'), [tree]);
  const recentFiles = useMemo(() => [...allLocalFiles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12), [allLocalFiles]);
  const allImages = useMemo(() => allLocalFiles.filter(e => e.type === 'image'), [allLocalFiles]);

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
    handleCompressZip, handleCompressTar, handleDownload, handleImportArchive,
    refreshCloud, goDrive, updateConfigs, openReconnect,
  });

  // Drag & drop
  const dragProps = useCallback((entry) => (!drive ? {
    draggable: true,
    onDragStart: (event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); draggingId.value = entry.id; },
    onDragEnd: () => { draggingId.value = null; },
  } : {}), [drive]);

  const dropTarget = useCallback((targetId) => (!drive && draggingId.value && draggingId.value !== targetId ? {
    onDragOver: (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = draggingId.value;
      draggingId.value = null;
      if (id && id !== targetId) runAction(async () => commit(moveEntry(tree, id, targetId)));
    },
  } : {}), [tree, commit, drive, runAction]);

  const togglePin = useCallback((id) => {
    pins.value = pins.value.includes(id) ? pins.value.filter(p => p !== id) : [...pins.value, id];
  }, []);

  const isInTrash = !drive && nav.value.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && folderId !== TRASH_ID && (() => {
    const entry = getEntry(tree, folderId);
    return entry && (entry.parentId === TRASH_ID || isTrashed(entry));
  })();

  // Home view
  const renderHome = () => (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">Quick access</div>
      <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
        {childrenOf(tree, 'root').filter(e => e.type === 'folder').map(folder => {
          const meta = QUICK_META[folder.name] || { icon: 'Folder', color: '#f59e0b' };
          const pinned = pins.value.includes(folder.id);
          return (
            <div key={folder.id} className="group flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs text-white/80 transition-colors hover:bg-white/[0.07]">
              <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => { view.value = 'files'; nav.value = { driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id: folder.id, name: folder.name }] }; }}>
                <Icon name={meta.icon} size={16} style={{ color: meta.color }} /> <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-white/30">{childrenOf(tree, folder.id).length}</span>
              </button>
              <button
                className={`${pinned ? 'text-cyan-300' : 'text-white/25 opacity-0 group-hover:opacity-100'} hover:text-white`}
                title={pinned ? 'Unpin' : 'Pin'}
                onClick={() => togglePin(folder.id)}
              >
                <Icon name="Pin" size={13} className={pinned ? '' : 'rotate-45'} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">Recent files</div>
      <div className="space-y-1">
        {recentFiles.map(entry => (
          <button key={entry.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/[0.06]" onDoubleClick={() => openItem(entry)} onClick={() => selectedItems.value = new Set([entry.id])} onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}>
            <Icon name={entry.type === 'image' ? 'Image' : entry.type === 'video' ? 'Film' : 'FileText'} size={18} color={entry.type === 'image' ? '#f472b6' : entry.type === 'video' ? '#a78bfa' : '#60a5fa'} strokeWidth={1.4} />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <span className="text-white/30">{new Date(entry.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
        {recentFiles.length === 0 && <p className="text-xs text-white/30">No files yet.</p>}
      </div>
    </div>
  );

  // Gallery view
  const renderGallery = () => (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/35">All pictures · {allImages.length}</div>
      {allImages.length === 0 ? (
        <p className="text-xs text-white/30">No images yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {allImages.map(entry => (
            <button key={entry.id} className="aspect-square overflow-hidden rounded-lg border border-white/[0.06]" onClick={async () => preview.value = { name: entry.name, url: await readEntryContent(entry), kind: 'image' }} onContextMenu={event => { event.stopPropagation(); onItemContext(event, entry); }}>
              <div className="h-full w-full animate-pulse bg-white/[0.08]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const selected = selectedItems.value.size === 1 ? tree.find(e => selectedItems.value.has(e.id)) : null;

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-[#19191d] text-white">
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
          {view.value === 'home' && renderHome()}
          {view.value === 'gallery' && renderGallery()}
          {view.value === 'files' && (
            <FileList
              tree={tree} drive={drive} items={items}
              openItem={openItem} onItemContext={onItemContext} onEmptyContext={onEmptyContext}
              dragProps={dragProps} dropTarget={dropTarget}
              togglePin={togglePin} pins={pins.value}
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
        <div className="absolute inset-0 z-20 flex flex-col bg-[#19191d]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
            <Icon name="FileText" size={15} color="#60a5fa" />
            <span className="flex-1 truncate text-sm font-medium">{editor.value.name}</span>
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={async () => {
              const updated = await storeEntryContent(editor.value, draft.value);
              commit(updateEntry(tree, editor.value.id, { content: updated.content, idb: updated.idb, size: updated.size }));
              editor.value = null;
            }}>Save</button>
            <button className="icon-btn h-8 w-8" onClick={() => editor.value = null} aria-label="Close editor"><Icon name="X" size={15} /></button>
          </div>
          <textarea className="flex-1 resize-none bg-transparent p-4 font-mono text-sm text-white/90 outline-none" value={draft.value} onChange={event => draft.value = event.target.value} spellCheck={false} />
        </div>
      )}

      {/* Preview overlay */}
      {preview.value && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/90" onClick={() => { if (preview.value.url?.startsWith('blob:')) URL.revokeObjectURL(preview.value.url); preview.value = null; }}>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="flex-1 truncate text-sm text-white/80">{preview.value.name}</span>
            <button className="icon-btn h-8 w-8" aria-label="Close preview"><Icon name="X" size={15} /></button>
          </div>
          {preview.value.kind === 'image' ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <img src={preview.value.url} alt={preview.value.name} className="max-h-full max-w-full rounded object-contain" />
            </div>
          ) : preview.value.kind === 'video' ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <video src={preview.value.url} controls autoPlay className="max-h-full max-w-full rounded" />
            </div>
          ) : (
            <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-white/80">{preview.value.text}</pre>
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
          snapshot={snapshot.value}
          onRefresh={refreshSnapshot}
          onClose={() => storageOpen.value = false}
          tree={tree}
          commit={commit}
        />
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      <DragOverlay />
    </div>
  );
}

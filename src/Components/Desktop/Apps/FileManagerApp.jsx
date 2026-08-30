import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';
import {
  childrenOf,
  createEntry,
  duplicateSubtreeDeep,
  getEntry,
  isTrashed,
  migrateTree,
  moveEntry,
  pathOf,
  purgeTrash,
  readEntryContent,
  removeEntryDeep,
  restoreEntry,
  storeEntryContent,
  subtreeFolderIds,
  trashEntry,
  TRASH_ID,
  trashedItems,
  updateEntry,
  useFileSystem,
} from '../../../lib/fileSystem';
import {
  PROVIDERS,
  CloudAuthError,
  createFolder,
  deleteItem,
  downloadBlob,
  listChildren,
  loadDriveConfigs,
  nextDriveLetter,
  renameItem,
  saveDriveConfigs,
  testConnection,
  uploadFile,
} from '../../../lib/cloudDrives';
import { storage } from '../../../lib/storage';
import { getSnapshotStats } from '../../../lib/storage/unifiedStore';
import { registerBlobDownload } from '../../../lib/downloads';
import {
  CACHE_CAP,
  IDB_CAP,
  LOCAL_CAP,
  clearSiteCache,
  formatBytes,
  storageSnapshot,
} from '../../../lib/storage/manager';

const QUICK_DEFAULT = ['default-desktop', 'default-downloads', 'default-documents', 'default-pictures', 'default-music', 'default-videos'];

const QUICK_META = {
  Desktop: { icon: 'Monitor', color: '#38bdf8' },
  Downloads: { icon: 'Download', color: '#22c55e' },
  Documents: { icon: 'FileText', color: '#60a5fa' },
  Pictures: { icon: 'Image', color: '#38bdf8' },
  Music: { icon: 'Music', color: '#f472b6' },
  Videos: { icon: 'Film', color: '#a78bfa' },
};

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function EntryGlyph({ entry, size = 36 }) {
  if (entry.type === 'folder') return <Icon name="Folder" size={size} color="#f59e0b" strokeWidth={1.4} />;
  if (entry.type === 'image') return <Icon name="Image" size={size} color="#f472b6" strokeWidth={1.4} />;
  if (entry.type === 'video') return <Icon name="Film" size={size} color="#a78bfa" strokeWidth={1.4} />;
  if (entry.type === 'text') return <Icon name="FileText" size={size} color="#60a5fa" strokeWidth={1.4} />;
  if (entry.name?.toLowerCase().endsWith('.gguf')) return <Icon name="BrainCircuit" size={size} color="#22d3ee" strokeWidth={1.4} />;
  if (entry.ref) return <Icon name="Gamepad2" size={size} color="#ff6b6b" strokeWidth={1.4} />;
  return <Icon name="FileText" size={size} color="#9ca3af" strokeWidth={1.4} />;
}

/** Async thumbnail: loads data from IndexedDB when the entry is tiered. */
function EntryThumb({ entry, className }) {
  const [url, setUrl] = useState(entry.content || null);
  useEffect(() => {
    let active = true;
    if (!entry.content && entry.idb) {
      readEntryContent(entry).then(data => { if (active) setUrl(data); });
    }
    return () => { active = false; };
  }, [entry]);
  if (!url) return <div className={`${className} animate-pulse bg-white/[0.08]`} />;
  return <img src={url} alt="" className={className} />;
}

/* ---------- Sidebar row ---------- */

function SideRow({ icon: SideIcon, color, label, active, onClick, onContextMenu, right, indent = false, chevron, onChevron, onDragOver, onDrop, dropActive }) {
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2.5 rounded px-2 py-[7px] text-[13px] transition-colors ${
        dropActive ? 'acc-soft acc-ring-soft' : active ? 'bg-white/[0.12] text-white' : 'text-white/75 hover:bg-white/[0.06]'
      } ${indent ? 'pl-7' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {chevron !== undefined ? (
        <button className="text-white/40 hover:text-white" onClick={event => { event.stopPropagation(); onChevron(); }} aria-label="Toggle section">
          {chevron ? <Icon name="ChevronDown" size={13} /> : <Icon name="ChevronRight" size={13} />}
        </button>
      ) : null}
      {SideIcon && <Icon name={SideIcon} size={16} style={{ color }} strokeWidth={1.8} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {right}
    </div>
  );
}

/* ---------- Connect cloud drive dialog ---------- */

function ConnectDialog({ configs, reconnectConfig, onAdd, onUpdate, onRemove, onClose }) {
  const [target, setTarget] = useState(reconnectConfig || null); // existing drive being re-tokened
  const [provider, setProvider] = useState(reconnectConfig?.provider || 'gdrive');
  const [label, setLabel] = useState(reconnectConfig?.label || '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startReconnect = config => {
    setTarget(config);
    setProvider(config.provider);
    setLabel(config.label);
    setToken('');
    setError('');
  };

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const config = target
        ? { ...target, token: token.trim(), label: label.trim() || target.label }
        : {
          id: `cloud-${Date.now()}`,
          provider,
          label: label.trim() || (provider === 'gdrive' ? 'GDrive' : 'OneDrive - Personal'),
          token: token.trim(),
          letter: nextDriveLetter(configs),
        };
      await testConnection(config);
      if (target) onUpdate(config);
      else onAdd(config);
      setToken('');
      setLabel('');
      onClose();
    } catch (err) {
      setError(err.auth ? 'That token was rejected — paste a fresh access token.' : err.message || 'Connection failed. Check your access token.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon name="Cloud" size={16} className="text-cyan-300" /> {target ? `Update token — ${target.label}` : 'Connect cloud storage'}
          </h3>
          <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close">
            <Icon name="X" size={14} />
          </button>
        </div>

        {configs.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {configs.map(config => (
              <div key={config.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-white/80">
                <Icon name="Cloud" size={14} style={{ color: PROVIDERS[config.provider]?.color }} />
                <span className="flex-1 truncate">{config.label} ({config.letter}:)</span>
                <button className="icon-btn h-6 w-6" onClick={() => startReconnect(config)} title="Update access token">
                  <Icon name="RefreshCw" size={12} />
                </button>
                <button className="icon-btn h-6 w-6 hover:bg-red-500/15 hover:text-red-300" onClick={() => onRemove(config.id)} title="Disconnect">
                  <Icon name="X" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {!target && (
            <div className="flex gap-2">
              {Object.entries(PROVIDERS).map(([id, meta]) => (
                <button
                  key={id}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    provider === id ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]'
                  }`}
                  onClick={() => setProvider(id)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          )}
          {target && (
            <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
              Access tokens expire (usually after ~1 hour). Paste a fresh token for {PROVIDERS[target.provider]?.label} to remount {target.label} ({target.letter}:).
            </p>
          )}
          <input className="text-input py-2 text-xs" placeholder="Drive label (e.g. GDrive)" value={label} onChange={event => setLabel(event.target.value)} />
          <textarea
            className="text-input min-h-[70px] resize-none py-2 font-mono text-[11px]"
            placeholder="Paste an OAuth access token…"
            value={token}
            onChange={event => setToken(event.target.value)}
          />
          <p className="text-[11px] leading-relaxed text-white/35">
            Get a token from the {provider === 'gdrive' ? 'Google OAuth playground (drive scope)' : 'Microsoft Graph / Azure token issuer'} (e.g. <span className="font-mono">gcloud auth print-access-token</span> or the Graph Explorer). The drive is mounted as the next free letter and stored locally only.
          </p>
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          <button className="btn-primary w-full py-2 text-xs" disabled={!token.trim() || busy} onClick={connect}>
            {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Cloud" size={14} />} {busy ? 'Testing connection…' : target ? 'Update token' : 'Connect drive'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- File Explorer app ---------- */

export default function FileManagerApp({ closeSelf, minimizeSelf, maximizeSelf, isMaximized, windowed }) {
  const [tree, commit] = useFileSystem();
  const [configs, setConfigs] = useState(loadDriveConfigs);
  const [pins, setPins] = useState(() => storage.get('fs-pins', QUICK_DEFAULT));
  const [view, setView] = useState('files'); // files | home | gallery
  const [nav, setNav] = useState({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }] });
  const [tabs, setTabs] = useState([{ id: 'tab-1', driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }], view: 'files' }]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [thisPCOpen, setThisPCOpen] = useState(true);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [selected, setSelected] = useState(null);
  const [cloudItems, setCloudItems] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectConfig, setReconnectConfig] = useState(null);
  const [authIssue, setAuthIssue] = useState(null); // config whose token was rejected
  const [storageOpen, setStorageOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [clipboard, setClipboard] = useState(() => storage.get('fs-clipboard', null));
  const [draggingId, setDraggingId] = useState(null);
  const [menu, openMenu, closeMenu] = useContextMenu();
  const uploadRef = useRef(null);

  const drive = nav.driveId === 'local' ? null : configs.find(config => config.id === nav.driveId) || null;
  const folderId = nav.stack[nav.stack.length - 1].id;
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Tab management
  const addTab = () => {
    const newTab = { id: `tab-${Date.now()}`, driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }], view: 'files' };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setNav({ driveId: newTab.driveId, stack: newTab.stack });
    setView(newTab.view);
  };

  const closeTab = (tabId) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev; // Keep at least one tab
      const next = prev.filter(t => t.id !== tabId);
      if (activeTabId === tabId) {
        const newActive = next[next.length - 1];
        setActiveTabId(newActive.id);
        setNav({ driveId: newActive.driveId, stack: newActive.stack });
        setView(newActive.view);
      }
      return next;
    });
  };

  const switchTab = (tabId) => {
    // Save current nav state to the active tab
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, driveId: nav.driveId, stack: nav.stack, view } : t));
    // Switch to new tab
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setNav({ driveId: tab.driveId, stack: tab.stack });
      setView(tab.view);
    }
  };

  // Sync nav changes back to the active tab
  useEffect(() => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, driveId: nav.driveId, stack: nav.stack, view } : t));
  }, [nav, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => storage.set('fs-pins', pins), [pins]);
  useEffect(() => storage.set('fs-clipboard', clipboard), [clipboard]);

  // Deep links from the Start menu search: navigate to the file's folder and select it.
  useEffect(() => {
    const onOpenFile = event => {
      const entry = getEntry(tree, event.detail);
      if (!entry) return;
      const path = pathOf(tree, entry.id);
      setView('files');
      if (entry.type === 'folder') {
        setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, ...path.map(part => ({ id: part.id, name: part.name }))] });
        setSelected(null);
      } else {
        const parents = path.slice(0, -1);
        setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, ...parents.map(part => ({ id: part.id, name: part.name }))] });
        setSelected(entry);
      }
    };
    window.addEventListener('lithium:open-file', onOpenFile);
    return () => window.removeEventListener('lithium:open-file', onOpenFile);
  }, [tree]);

  // Move any oversized legacy inline content into IndexedDB.
  useEffect(() => { migrateTree(tree, commit); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSnapshot = React.useCallback(async () => setSnapshot({ ...(await storageSnapshot()), fs: getSnapshotStats() }), []);
  useEffect(() => { if (storageOpen) refreshSnapshot(); }, [storageOpen, refreshSnapshot]);

  const refreshCloud = React.useCallback(async (config, id) => {
    setCloudLoading(true);
    setCloudError('');
    try {
      setCloudItems(await listChildren(config, id));
      setAuthIssue(prev => (prev?.id === config.id ? null : prev));
    } catch (err) {
      if (err instanceof CloudAuthError) setAuthIssue(config);
      else setCloudError(err.message || 'Failed to load drive');
      setCloudItems([]);
    } finally {
      setCloudLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'files' && drive) refreshCloud(drive, folderId);
  }, [view, drive, folderId, refreshCloud]);

  const items = view === 'files' ? (drive ? cloudItems : childrenOf(tree, folderId)) : [];

  const allLocalFiles = useMemo(() => tree.filter(entry => entry.type !== 'folder'), [tree]);
  const recentFiles = useMemo(() => [...allLocalFiles].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12), [allLocalFiles]);
  const allImages = useMemo(() => allLocalFiles.filter(entry => entry.type === 'image'), [allLocalFiles]);

  const goDrive = driveId => {
    setSelected(null);
    setView('files');
    if (driveId === 'local') { setAuthIssue(null); setCloudError(''); setCloudItems([]); setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }] }); }
    else {
      const config = configs.find(entry => entry.id === driveId);
      setNav({ driveId, stack: [{ id: null, name: `${config.label} (${config.letter}:)` }] });
    }
  };

  const openReconnect = config => {
    setReconnectConfig(config);
    setConnectOpen(true);
  };

  const openItem = async entry => {
    if (entry.type === 'folder') {
      setSelected(null);
      setNav(prev => ({ ...prev, stack: [...prev.stack, { id: entry.id, name: entry.name }] }));
      return;
    }
    if (!drive) {
      // Local entries (content may live in IndexedDB)
      const local = getEntry(tree, entry.id);
      if (local?.ref) {
        // Cached game / external url — play it in the Browser window.
        window.dispatchEvent(new CustomEvent('lithium:open-browser', { detail: local.ref }));
        return;
      }
      if (entry.type === 'text') {
        setEditor(local);
        setDraft(await readEntryContent(local));
      } else if (entry.type === 'image') {
        setPreview({ name: entry.name, url: await readEntryContent(entry), kind: 'image' });
      } else if (entry.type === 'video') {
        setPreview({ name: entry.name, url: await readEntryContent(local), kind: 'video' });
      } else {
        // Generic file: download it (Blob contents from IndexedDB get an object URL).
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
    // Cloud entries
    try {
      const blob = await downloadBlob(drive, entry);
      if (entry.type === 'image') {
        setPreview({ name: entry.name, url: URL.createObjectURL(blob), kind: 'image' });
      } else if (entry.type === 'video') {
        setPreview({ name: entry.name, url: URL.createObjectURL(blob), kind: 'video' });
      } else if (entry.type === 'text') {
        setPreview({ name: entry.name, url: null, kind: 'text', text: await blob.text() });
      } else {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(blob);
        anchor.download = entry.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
        // Also keep a local copy in the Downloads folder.
        registerBlobDownload(entry.name, blob).catch(() => {});
      }
    } catch (err) {
      setCloudError(err.message || 'Download failed');
    }
  };

  const runAction = async action => {
    try {
      await action();
    } catch (err) {
      if (err instanceof CloudAuthError && drive) setAuthIssue(drive);
      setCloudError(err.message || 'Action failed');
    }
  };

  const handleUpload = event => {
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
          setCloudError(err.message || 'File is too large for local storage');
        }
      };
      if (isText) reader.readAsText(file);
      else reader.readAsDataURL(file);
      return;
    }
    runAction(async () => { await uploadFile(drive, folderId, file); refreshCloud(drive, folderId); });
  };

  const handleDelete = (entry = selected) => {
    if (!entry) return;
    // Items inside the Recycle Bin are deleted permanently (with confirm).
    if (isTrashed(entry)) {
      if (!window.confirm(`Permanently delete "${entry.name}"? This cannot be undone.`)) return;
      runAction(async () => { commit(await removeEntryDeep(tree, entry.id)); setSelected(null); });
      return;
    }
    if (!drive) {
      // Send to Recycle Bin instead of removing outright.
      commit(trashEntry(tree, entry.id));
      setSelected(null);
      return;
    }
    if (!window.confirm(`Delete "${entry.name}" from ${drive.label}?`)) return;
    runAction(async () => { await deleteItem(drive, entry.id); setSelected(null); refreshCloud(drive, folderId); });
  };

  const handleRestore = (entry = selected) => {
    if (!entry || !isTrashed(entry)) return;
    commit(restoreEntry(tree, entry.id));
    setSelected(null);
  };

  const handleEmptyTrash = () => {
    const count = trashedItems(tree).length;
    if (count === 0) return;
    if (!window.confirm(`Permanently delete ${count} item${count === 1 ? '' : 's'} from the Recycle Bin? This cannot be undone.`)) return;
    runAction(async () => { commit(await purgeTrash(tree)); setSelected(null); });
  };

  const handleRename = name => {
    if (!dialog?.entry) return;
    if (!drive) { commit(updateEntry(tree, dialog.entry.id, { name })); setDialog(null); return; }
    runAction(async () => { await renameItem(drive, dialog.entry.id, name); setDialog(null); refreshCloud(drive, folderId); });
  };

  const handleNewFolder = name => {
    if (!drive) { commit(createEntry(tree, { name, type: 'folder', parentId: folderId })); setDialog(null); return; }
    runAction(async () => { await createFolder(drive, folderId, name); setDialog(null); refreshCloud(drive, folderId); });
  };

  const updateConfigs = next => { setConfigs(next); saveDriveConfigs(next); };

  /* ---------- Clipboard + context menus ---------- */

  const togglePin = id => setPins(prev => (prev.includes(id) ? prev.filter(pin => pin !== id) : [...prev, id]));

  const clipboardEntry = clipboard && !drive ? getEntry(tree, clipboard.id) : null;
  const canPaste = Boolean(clipboardEntry)
    && !(clipboard.op === 'cut' && subtreeFolderIds(tree, clipboard.id).includes(folderId))
    && (clipboard.op === 'copy' || clipboardEntry.parentId !== folderId);

  const handlePaste = () => {
    if (!canPaste) return;
    runAction(async () => {
      if (clipboard.op === 'copy') {
        commit(await duplicateSubtreeDeep(tree, clipboard.id, folderId));
      } else {
        commit(moveEntry(tree, clipboard.id, folderId));
        setClipboard(null);
      }
    });
  };

  /* ---------- Drag & drop moving ---------- */

  const dragProps = entry => (!drive ? {
    draggable: true,
    onDragStart: event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); setDraggingId(entry.id); },
    onDragEnd: () => setDraggingId(null),
  } : {});

  const dropTarget = targetId => (!drive && draggingId && draggingId !== targetId ? {
    onDragOver: event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
    onDrop: event => {
      event.preventDefault();
      event.stopPropagation();
      const id = draggingId;
      setDraggingId(null);
      if (id && id !== targetId) runAction(async () => commit(moveEntry(tree, id, targetId)));
    },
  } : {});

  const isInTrash = !drive && nav.driveId === 'local' && folderId === TRASH_ID;
  const isTrashSubfolder = !drive && isTrashed(getEntry(tree, folderId)) && folderId !== TRASH_ID;
  const isInsideTrash = isInTrash || isTrashSubfolder;

  const entryMenu = entry => {
    if (isTrashed(entry)) {
      return [
        { id: 'open', label: entry.type === 'folder' ? 'Open' : 'Open', icon: entry.type === 'folder' ? 'Folder' : 'FileText', action: () => openItem(entry) },
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
        { id: 'copy', label: 'Copy', icon: 'Copy', shortcut: 'Ctrl+C', action: () => setClipboard({ op: 'copy', id: entry.id }) },
        { id: 'cut', label: 'Cut', icon: 'Scissors', shortcut: 'Ctrl+X', action: () => setClipboard({ op: 'cut', id: entry.id }) },
        {
          id: 'move', label: 'Move to', icon: 'Folder',
          items: childrenOf(tree, 'root').filter(folder => folder.type === 'folder' && folder.id !== entry.parentId).map(folder => ({
            id: `mv-${folder.id}`, label: folder.name, icon: 'Folder',
            action: () => runAction(async () => commit(moveEntry(tree, entry.id, folder.id))),
          })),
        },
        { id: 'sep-2', type: 'separator' },
      ] : []),
      ...(entry.type === 'folder' && !drive ? [
        {
          id: 'pin', label: pins.includes(entry.id) ? 'Remove from Quick access' : 'Add to Quick access', icon: 'Pin',
          action: () => togglePin(entry.id),
        },
      ] : []),
      { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => setDialog({ mode: 'rename', entry }) },
      ...(!drive ? [{ id: 'duplicate', label: 'Duplicate', icon: 'Copy', action: () => runAction(async () => commit(await duplicateSubtreeDeep(tree, entry.id, entry.parentId))) }] : []),
      { id: 'sep-3', type: 'separator' },
      { id: 'delete', label: 'Delete', icon: 'Trash2', shortcut: 'Del', danger: true, action: () => handleDelete(entry) },
    ];
  };

  const emptyMenu = () => [
    { id: 'new-folder', label: 'New folder', icon: 'FolderPlus', action: () => setDialog({ mode: 'folder' }) },
    ...(!drive ? [{ id: 'new-file', label: 'New text file', icon: 'Plus', action: () => setDialog({ mode: 'file' }) }] : []),
    ...(!drive ? [
      { id: 'sep-1', type: 'separator' },
      { id: 'paste', label: 'Paste', icon: 'ClipboardPaste', shortcut: 'Ctrl+V', disabled: !canPaste, action: handlePaste },
    ] : []),
    { id: 'sep-2', type: 'separator' },
    { id: 'upload', label: 'Upload file…', icon: 'Upload', action: () => uploadRef.current?.click() },
    ...(drive ? [{ id: 'refresh', label: 'Refresh', icon: 'RefreshCw', action: () => refreshCloud(drive, folderId) }] : []),
    { id: 'sep-3', type: 'separator' },
    {
      id: 'view', label: 'View', icon: 'LayoutGrid',
      items: [
        { id: 'grid', label: 'Large icons', icon: 'LayoutGrid', checked: viewMode === 'grid', action: () => setViewMode('grid') },
        { id: 'list', label: 'Details', icon: 'List', checked: viewMode === 'list', action: () => setViewMode('list') },
      ],
    },
  ];

  const onItemContext = (event, entry) => {
    setSelected(entry);
    openMenu(event, entryMenu(entry));
  };

  const onEmptyContext = event => {
    if (event.target !== event.currentTarget) return;
    setSelected(null);
    openMenu(event, emptyMenu());
  };

  /* ---------- Views ---------- */

  const renderSidebar = () => (
    <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-black/40 bg-[#1f1f23] p-1.5">
      <SideRow icon="Home" color="#f59e0b" label="Home" active={view === 'home'} onClick={() => { setView('home'); setSelected(null); }} />
      <SideRow icon="Image" color="#38bdf8" label="Gallery" active={view === 'gallery'} onClick={() => { setView('gallery'); setSelected(null); }} />
      <SideRow
        icon="Trash"
        color="#9ca3af"
        label="Recycle Bin"
        active={view === 'files' && nav.driveId === 'local' && (folderId === TRASH_ID || isTrashed(getEntry(tree, folderId)))}
        onClick={() => { setView('files'); setSelected(null); setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id: TRASH_ID, name: 'Recycle Bin' }] }); }}
        right={trashedItems(tree).length > 0 ? <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/55">{trashedItems(tree).length}</span> : null}
      />
      {configs.filter(config => config.provider === 'onedrive').map(config => (
        <SideRow key={config.id} icon="Cloud" color={PROVIDERS.onedrive.color} label={config.label} active={view === 'files' && nav.driveId === config.id} onClick={() => goDrive(config.id)} />
      ))}

      <div className="mx-2 my-2 h-px bg-white/[0.08]" />

      {[...pins]
        .sort((a, b) => {
          const ia = QUICK_DEFAULT.indexOf(a);
          const ib = QUICK_DEFAULT.indexOf(b);
          return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        })
        .map(id => {
        const folder = getEntry(tree, id);
        if (!folder) return null;
        const meta = QUICK_META[folder.name] || { icon: 'Folder', color: '#f59e0b' };
        return (
          <SideRow
            key={id}
            icon={meta.icon}
            color={meta.color}
            label={folder.name}
            active={view === 'files' && nav.driveId === 'local' && folderId === id}
            onClick={() => {
              setView('files');
              setSelected(null);
              setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id, name: folder.name }] });
            }}
            onContextMenu={event => openMenu(event, [
              { id: 'open', label: 'Open', icon: 'Folder', action: () => { setView('files'); setSelected(null); setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id, name: folder.name }] }); } },
              { id: 'sep', type: 'separator' },
              { id: 'unpin', label: 'Remove from Quick access', icon: 'Pin', action: () => togglePin(id) },
            ])}
            {...dropTarget(id)}
            right={
              <button
                className="text-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                title="Unpin from Quick access"
                onClick={event => { event.stopPropagation(); setPins(prev => prev.filter(pin => pin !== id)); }}
              >
                <Icon name="Pin" size={12} className="rotate-45" />
              </button>
            }
          />
        );
      })}

      <div className="mx-2 my-2 h-px bg-white/[0.08]" />

      <SideRow icon="Monitor" color="#38bdf8" label="This PC" chevron={thisPCOpen} onChevron={() => setThisPCOpen(value => !value)} onClick={() => setThisPCOpen(value => !value)} />
      {thisPCOpen && (
        <>
          <SideRow indent icon="HardDrive" color="#9ca3af" label="Local Disk (C:)" active={view === 'files' && nav.driveId === 'local' && nav.stack.length === 1} onClick={() => goDrive('local')} {...dropTarget('root')} dropActive={Boolean(draggingId)} />
          {configs.map(config => (
            <SideRow
              key={config.id}
              indent
              icon="HardDrive"
              color={PROVIDERS[config.provider]?.color || '#9ca3af'}
              label={`${config.label} (${config.letter}:)`}
              active={view === 'files' && nav.driveId === config.id}
              onClick={() => goDrive(config.id)}
            />
          ))}
        </>
      )}

      <SideRow icon="Network" color="#38bdf8" label="Network" chevron={networkOpen} onChevron={() => setNetworkOpen(value => !value)} onClick={() => setNetworkOpen(value => !value)} />
      {networkOpen && (
        <>
          {configs.map(config => (
            <SideRow
              key={config.id}
              indent
              icon="Cloud"
              color={PROVIDERS[config.provider]?.color}
              label={`${config.label} (${config.letter}:)`}
              active={view === 'files' && nav.driveId === config.id}
              onClick={() => goDrive(config.id)}
              right={
                <button className="text-white/25 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100" title="Disconnect" onClick={event => { event.stopPropagation(); updateConfigs(configs.filter(entry => entry.id !== config.id)); }}>
                  <Icon name="X" size={12} />
                </button>
              }
            />
          ))}
          <SideRow indent icon="Plus" color="#22d3ee" label="Connect cloud storage…" onClick={() => setConnectOpen(true)} />
        </>
      )}

      <div className="mt-auto px-2 pb-1 pt-3">
        <button className="w-full text-left" onClick={() => setStorageOpen(true)} title="Open storage manager">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, ((snapshot?.local || 0) + (snapshot?.idb || 0)) / IDB_CAP * 100 + 1)}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-white/35">
            {formatBytes((snapshot?.local || 0) + (snapshot?.idb || 0))} of {formatBytes(IDB_CAP)} on C: · details
          </div>
        </button>
      </div>
    </aside>
  );

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">Quick access</div>
      <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
        {childrenOf(tree, 'root').filter(entry => entry.type === 'folder').map(folder => {
          const meta = QUICK_META[folder.name] || { icon: 'Folder', color: '#f59e0b' };
          const iconName = meta.icon;
          const pinned = pins.includes(folder.id);
          return (
            <div key={folder.id} className="group flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs text-white/80 transition-colors hover:bg-white/[0.07]" onContextMenu={event => openMenu(event, [
              { id: 'open', label: 'Open', icon: 'Folder', action: () => { setView('files'); setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id: folder.id, name: folder.name }] }); } },
              { id: 'sep-1', type: 'separator' },
              { id: 'pin', label: pinned ? 'Remove from Quick access' : 'Add to Quick access', icon: 'Pin', action: () => togglePin(folder.id) },
              { id: 'rename', label: 'Rename', icon: 'Pencil', action: () => setDialog({ mode: 'rename', entry: folder }) },
              { id: 'sep-2', type: 'separator' },
              { id: 'delete', label: 'Delete', icon: 'Trash2', danger: true, action: () => handleDelete(folder) },
            ])}>
              <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setNav({ driveId: 'local', stack: [{ id: 'root', name: 'Local Disk (C:)' }, { id: folder.id, name: folder.name }] })}>
                <Icon name={iconName} size={16} style={{ color: meta.color }} /> <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-white/30">{childrenOf(tree, folder.id).length}</span>
              </button>
              <button
                className={`${pinned ? 'text-cyan-300' : 'text-white/25 opacity-0 group-hover:opacity-100'} hover:text-white`}
                title={pinned ? 'Unpin from Quick access' : 'Pin to Quick access'}
                onClick={() => setPins(prev => (pinned ? prev.filter(id => id !== folder.id) : [...prev, folder.id]))}
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
          <button key={entry.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/[0.06]" onDoubleClick={() => openItem(entry)} onClick={() => setSelected(entry)} onContextMenu={event => onItemContext(event, entry)}>
            <EntryGlyph entry={entry} size={18} />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <span className="text-white/30">{new Date(entry.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
        {recentFiles.length === 0 && <p className="text-xs text-white/30">No files yet.</p>}
      </div>
    </div>
  );

  const renderGallery = () => (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/35">All pictures · {allImages.length}</div>
      {allImages.length === 0 ? (
        <p className="text-xs text-white/30">No images yet. Add some from the Photos app.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {allImages.map(entry => (
            <button key={entry.id} className="aspect-square overflow-hidden rounded-lg border border-white/[0.06]" onClick={async () => setPreview({ name: entry.name, url: await readEntryContent(entry), kind: 'image' })} onContextMenu={event => onItemContext(event, entry)}>
              <EntryThumb entry={entry} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderFiles = () => (
    <div className="flex-1 overflow-y-auto p-3" onClick={() => setSelected(null)} onContextMenu={onEmptyContext}>
      {cloudLoading ? (
        <div className="flex h-full items-center justify-center gap-2 text-white/40"><Icon name="Loader2" size={18} className="animate-spin" /> Loading {drive?.label}…</div>
      ) : authIssue && drive?.id === authIssue.id ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <Icon name="Cloud" size={36} strokeWidth={1.2} style={{ color: PROVIDERS[drive.provider]?.color }} />
          <p className="text-sm font-medium text-white">{drive.label} sign-in expired</p>
          <p className="max-w-sm text-xs leading-relaxed text-white/45">
            The access token for this drive was rejected by {PROVIDERS[drive.provider]?.label}. Your local files are
            unaffected — update the token to keep using the drive, or disconnect it.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => openReconnect(drive)}><Icon name="RefreshCw" size={13} /> Update token</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { updateConfigs(configs.filter(entry => entry.id !== drive.id)); setAuthIssue(null); goDrive('local'); }}>
              Disconnect drive
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => goDrive('local')}>Go to Local Disk (C:)</button>
          </div>
        </div>
      ) : cloudError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-red-300">{cloudError}</p>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => drive && refreshCloud(drive, folderId)}><Icon name="RefreshCw" size={13} /> Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
          <Icon name="Folder" size={40} strokeWidth={1} />
          <p className="text-xs">{isInTrash ? 'The Recycle Bin is empty.' : 'This folder is empty'}</p>
          {isInTrash && <p className="max-w-xs text-center text-[11px] text-white/25">Deleted items land here and can be restored to their original location.</p>}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1">
          {items.map(entry => (
            <button
              key={entry.id}
              className={`flex flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-colors ${selected?.id === entry.id ? 'acc-soft acc-ring-soft' : 'hover:bg-white/[0.06]'} ${draggingId && entry.type === 'folder' && draggingId !== entry.id ? 'acc-ring-soft' : ''}`}
              onClick={event => { event.stopPropagation(); setSelected(entry); }}
              onContextMenu={event => onItemContext(event, entry)}
              onDoubleClick={() => openItem(entry)}
              {...dragProps(entry)}
              {...(entry.type === 'folder' ? dropTarget(entry.id) : {})}
              title={entry.name}
            >
              {entry.type === 'image' && !drive ? (
                <EntryThumb entry={getEntry(tree, entry.id) || entry} className="h-10 w-10 rounded object-cover" />
              ) : (
                <EntryGlyph entry={entry} size={38} />
              )}
              <span className="line-clamp-2 w-full break-words text-[11px] leading-tight text-white/80">{entry.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <table className="w-full text-left text-xs text-white/80">
          <thead>
            <tr className="border-b border-white/[0.08] text-white/40">
              <th className="py-1.5 pr-2 font-medium">Name</th>
              <th className="py-1.5 pr-2 font-medium">Type</th>
              <th className="py-1.5 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {items.map(entry => (
              <tr
                key={entry.id}
                className={`cursor-pointer border-b border-white/[0.04] ${selected?.id === entry.id ? 'acc-soft' : 'hover:bg-white/[0.05]'}`}
                onClick={event => { event.stopPropagation(); setSelected(entry); }}
                onContextMenu={event => onItemContext(event, entry)}
                onDoubleClick={() => openItem(entry)}
                {...dragProps(entry)}
                {...(entry.type === 'folder' ? dropTarget(entry.id) : {})}
              >
                <td className="flex items-center gap-2 py-1.5 pr-2"><EntryGlyph entry={entry} size={16} /> {entry.name}</td>
                <td className="py-1.5 pr-2 capitalize text-white/50">{entry.type === 'folder' ? 'Folder' : `${entry.type} file`}</td>
                <td className="py-1.5 text-white/50">{entry.type === 'folder' ? '' : formatSize(entry.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-[#19191d] text-white">
      {/* Tab strip */}
      <div className="flex min-w-0 items-center gap-0.5 overflow-hidden border-b border-white/[0.06] bg-[#141418] px-2 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map(tab => {
            const tabName = tab.stack[tab.stack.length - 1]?.name || 'New Tab';
            return (
              <div
                key={tab.id}
                className={`group flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                  tab.id === activeTabId
                    ? 'bg-[#19191d] text-white'
                    : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70'
                }`}
                onClick={() => switchTab(tab.id)}
              >
                <Icon name="Folder" size={12} className="shrink-0" color="#f59e0b" />
                <span className="max-w-[100px] truncate">{tabName}</span>
                {tabs.length > 1 && (
                  <button
                    className="ml-1 text-white/30 opacity-0 hover:text-white group-hover:opacity-100"
                    onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                    aria-label="Close tab"
                  >
                    <Icon name="X" size={11} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="flex items-center justify-center rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-white"
            onClick={addTab}
            title="New tab"
          >
            <Icon name="Plus" size={13} />
          </button>
        </div>
        {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
      </div>
      <div className="relative flex min-h-0 flex-1">
      {renderSidebar()}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
          <button className="icon-btn h-8 w-8" disabled={view !== 'files' || nav.stack.length <= 1} onClick={() => setNav(prev => ({ ...prev, stack: prev.stack.slice(0, -1) }))} aria-label="Back">
            <Icon name="ArrowLeft" size={15} />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
            {view !== 'files' ? (
              <span className="capitalize">{view}</span>
            ) : (
              nav.stack.map((crumb, index) => (
                <React.Fragment key={`${crumb.id}-${index}`}>
                  {index > 0 && <Icon name="ChevronRight" size={12} className="shrink-0 text-white/25" />}
                  <button
                    className="truncate hover:text-white"
                    onClick={() => setNav(prev => ({ ...prev, stack: prev.stack.slice(0, index + 1) }))}
                    {...dropTarget(crumb.id)}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))
            )}
          </div>

          <button className={`icon-btn h-8 w-8 ${viewMode === 'grid' ? 'acc-text' : ''}`} title="Grid view" onClick={() => setViewMode('grid')}><Icon name="LayoutGrid" size={15} /></button>
          <button className={`icon-btn h-8 w-8 ${viewMode === 'list' ? 'acc-text' : ''}`} title="List view" onClick={() => setViewMode('list')}><Icon name="List" size={15} /></button>
          {!isInsideTrash && <div className="mx-1 h-5 w-px bg-white/[0.08]" />}
          {!isInsideTrash && <button className="icon-btn h-8 w-8" title="New folder" onClick={() => setDialog({ mode: 'folder' })}><Icon name="FolderPlus" size={15} /></button>}
          {!drive && !isInsideTrash && view === 'files' && (
            <button className="icon-btn h-8 w-8" title="New text file" onClick={() => setDialog({ mode: 'file' })}><Icon name="Plus" size={15} /></button>
          )}
          {!isInsideTrash && <button className="icon-btn h-8 w-8" title="Upload file" onClick={() => uploadRef.current?.click()}><Icon name="Upload" size={15} /></button>}
          <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} />
          {!isInsideTrash && <button className="icon-btn h-8 w-8" title="Rename" disabled={!selected} onClick={() => setDialog({ mode: 'rename', entry: selected })}><Icon name="Pencil" size={14} /></button>}
          {isInsideTrash && <button className="icon-btn h-8 w-8" title="Restore" disabled={!selected || !isTrashed(selected)} onClick={() => handleRestore()}><Icon name="Undo2" size={14} /></button>}
          {isInsideTrash && <button className="icon-btn h-8 w-8 hover:bg-red-500/15 hover:text-red-300" title="Delete permanently" disabled={!selected} onClick={() => handleDelete()}><Icon name="Trash2" size={14} /></button>}
          {!isInsideTrash && <button className="icon-btn h-8 w-8 hover:bg-red-500/15 hover:text-red-300" title="Delete" disabled={!selected} onClick={() => handleDelete()}><Icon name="Trash2" size={14} /></button>}
          {isInsideTrash && items.length > 0 && (
            <button className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/20" title="Permanently delete all items" onClick={handleEmptyTrash}>
              <Icon name="Trash2" size={13} /> Empty
            </button>
          )}
          <button className="icon-btn h-8 w-8" title="Storage manager" onClick={() => setStorageOpen(true)}><Icon name="Database" size={15} /></button>
          <button className="icon-btn h-8 w-8" title="Connect cloud storage" onClick={() => setConnectOpen(true)}><Icon name="Cloud" size={15} /></button>
        </div>

        {view === 'home' && renderHome()}
        {view === 'gallery' && renderGallery()}
        {view === 'files' && renderFiles()}

        {/* Status bar */}
        <div className="border-t border-white/[0.06] px-4 py-1.5 text-[11px] text-white/40">
          {view === 'files' ? `${items.length} item${items.length === 1 ? '' : 's'}` : view === 'gallery' ? `${allImages.length} pictures` : `${recentFiles.length} recent files`}
          {selected ? ` · 1 selected (${selected.name})` : ''}
          {isInTrash ? ' · Recycle Bin' : isTrashSubfolder ? ' · in Recycle Bin' : drive ? ` · ${drive.label} (${drive.letter}:)` : ' · Local Disk (C:)'}
        </div>
      </div>

      {/* Name dialogs */}
      {dialog?.mode !== 'rename' && dialog && (
        <NameDialog
          title={dialog.mode === 'folder' ? 'New folder' : 'New text file'}
          initial={dialog.mode === 'file' ? 'New Note.txt' : ''}
          onClose={() => setDialog(null)}
          onSubmit={name => (dialog.mode === 'folder' ? handleNewFolder(name) : (commit(createEntry(tree, { name: /\.[a-z0-9]{1,5}$/i.test(name) ? name : `${name}.txt`, type: 'text', parentId: folderId })), setDialog(null)))}
        />
      )}
      {dialog?.mode === 'rename' && (
        <NameDialog title="Rename" initial={dialog.entry.name} onClose={() => setDialog(null)} onSubmit={handleRename} />
      )}

      {/* Local text editor */}
      {editor && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#19191d]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
            <Icon name="FileText" size={15} color="#60a5fa" />
            <span className="flex-1 truncate text-sm font-medium">{editor.name}</span>
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={async () => {
              const updated = await storeEntryContent(editor, draft);
              commit(updateEntry(tree, editor.id, { content: updated.content, idb: updated.idb, size: updated.size }));
              setEditor(null);
            }}>Save</button>
            <button className="icon-btn h-8 w-8" onClick={() => setEditor(null)} aria-label="Close editor"><Icon name="X" size={15} /></button>
          </div>
          <textarea className="flex-1 resize-none bg-transparent p-4 font-mono text-sm text-white/90 outline-none" value={draft} onChange={event => setDraft(event.target.value)} spellCheck={false} />
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/90" onClick={() => { if (preview.url?.startsWith('blob:')) URL.revokeObjectURL(preview.url); setPreview(null); }}>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="flex-1 truncate text-sm text-white/80">{preview.name}</span>
            <button className="icon-btn h-8 w-8" aria-label="Close preview"><Icon name="X" size={15} /></button>
          </div>
          {preview.kind === 'image' ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <img src={preview.url} alt={preview.name} className="max-h-full max-w-full rounded object-contain" />
            </div>
          ) : preview.kind === 'video' ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <video src={preview.url} controls autoPlay className="max-h-full max-w-full rounded" />
            </div>
          ) : (
            <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-white/80">{preview.text}</pre>
          )}
        </div>
      )}

      {connectOpen && (
        <ConnectDialog
          configs={configs}
          reconnectConfig={reconnectConfig}
          onAdd={config => updateConfigs([...configs, config])}
          onUpdate={config => updateConfigs(configs.map(entry => (entry.id === config.id ? config : entry)))}
          onRemove={id => updateConfigs(configs.filter(entry => entry.id !== id))}
          onClose={() => { setConnectOpen(false); setReconnectConfig(null); }}
        />
      )}

      {storageOpen && (
        <StoragePanel
          snapshot={snapshot}
          onRefresh={refreshSnapshot}
          onClearCache={async () => { await clearSiteCache(); refreshSnapshot(); }}
          onClose={() => setStorageOpen(false)}
        />
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      </div>
    </div>
  );
}

/* ---------- Storage manager panel ---------- */

function TierBar({ label, used, cap, accent, extra }) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-white/85">{label}</span>
        <span className="text-white/45">{formatBytes(used)} / {formatBytes(cap)}{extra ? ` · ${extra}` : ''}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%`, backgroundColor: accent }} />
      </div>
    </div>
  );
}

function StoragePanel({ snapshot, onRefresh, onClearCache, onClose }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon name="Database" size={16} className="text-cyan-300" /> Storage manager
          </h3>
          <div className="flex items-center gap-1">
            <button className="icon-btn h-7 w-7" onClick={onRefresh} title="Refresh" aria-label="Refresh"><Icon name="RefreshCw" size={13} /></button>
            <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close"><Icon name="X" size={14} /></button>
          </div>
        </div>

        {!snapshot ? (
          <div className="flex items-center justify-center gap-2 py-8 text-white/40"><Icon name="Loader2" size={16} className="animate-spin" /> Measuring…</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs leading-relaxed text-white/60">
              <div className="flex justify-between"><span>Browser quota (≈60% of disk)</span><span className="text-white/85">{formatBytes(snapshot.quota)}</span></div>
              <div className="flex justify-between"><span>Estimated total disk</span><span className="text-white/85">{snapshot.estimatedDisk ? `~${formatBytes(snapshot.estimatedDisk)}` : 'unknown'}</span></div>
              <div className="flex justify-between"><span>Currently used by browser</span><span className="text-white/85">{formatBytes(snapshot.browserUsage)}</span></div>
            </div>

                        <TierBar label="IndexedDB · files, photos & models (C:)" used={snapshot.idb + (snapshot.kvOverflow || 0)} cap={IDB_CAP} accent="#22d3ee" />
                        <TierBar label="Local & Cache · settings, chats, offline site" used={snapshot.local + snapshot.cache} cap={LOCAL_CAP + CACHE_CAP} accent="#a78bfa" extra={`${snapshot.cachedAssets} assets cached`} />

            {snapshot.fs && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs">
                <div className="mb-1 flex items-center gap-2 font-medium text-white/85">
                  <Icon name="Database" size={13} className="text-cyan-300" /> Rust core snapshot
                </div>
                <div className="flex justify-between text-white/60"><span>Engine</span><span className="text-white/85">{snapshot.fs.engine}</span></div>
                <div className="flex justify-between text-white/60">
                  <span>Raw → stored</span>
                  <span className="text-white/85">
                    {formatBytes(snapshot.fs.rawSize)} → {formatBytes(snapshot.fs.compSize)} ({Math.round((snapshot.fs.compSize / Math.max(1, snapshot.fs.rawSize)) * 100)}%)
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-relaxed text-white/35">
                The whole site is cached for offline mode — games are never saved. Heavy chats,
                memories and audit logs overflow into IndexedDB automatically, keeping localStorage tiny.
              </p>
              <button className="btn-ghost shrink-0 px-3 py-1.5 text-xs" onClick={onClearCache} disabled={!snapshot.cachedAssets}>
                <Icon name="Trash2" size={12} /> Clear cache
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Name dialog ---------- */

function NameDialog({ title, initial = '', onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1c1c22] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-white">{title}</h3>
        <input
          autoFocus
          className="text-input"
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && value.trim()) onSubmit(value.trim());
            if (event.key === 'Escape') onClose();
          }}
          placeholder="Name"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>Cancel</button>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}

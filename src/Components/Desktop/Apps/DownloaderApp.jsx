import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../Icon';
import WinControls from '../WinControls';
import ContextMenu, { useContextMenu } from '../ContextMenu';
import { clearHistory, downloadToSite, loadHistory, removeDownload, DOWNLOADER_EVENT } from '../../../lib/downloader';
import { hfResolveUrl, listHfDir, parseHfUrl } from '../../../lib/ai/models';
import { importGithubRepo, isGithubRepo } from '../../../lib/repos';
import { formatBytes } from '../../../lib/storage/manager';
import { call as apiCall } from '../../../lib/ai/apiManager';

/**
 * Downloader — pull anything (files, webpages, models) into the site.
 * Streams into OPFS, lands in the Downloads folder, keeps a history.
 * Hugging Face repo links open a clickable file browser instead.
 */
export default function DownloaderApp({ windowed = false, closeSelf, minimizeSelf, maximizeSelf, isMaximized }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState([]); // { id, url, name, received, total }
  const [historyVersion, setHistoryVersion] = useState(0);
  const [error, setError] = useState('');
  const [repoBusy, setRepoBusy] = useState(false);
  const [hfNav, setHfNav] = useState(null); // { repo, path, entries|null }
  const aborters = useRef({});
  const [menu, openMenu, closeMenu] = useContextMenu();

  useEffect(() => {
    const bump = () => setHistoryVersion(v => v + 1);
    window.addEventListener(DOWNLOADER_EVENT, bump);
    return () => window.removeEventListener(DOWNLOADER_EVENT, bump);
  }, []);

  const history = React.useMemo(() => loadHistory(), [historyVersion]);

  const start = async (targetUrl, targetName) => {
    const clean = (targetUrl ?? url).trim();
    if (!clean || !/^https?:\/\//i.test(clean)) {
      setError('Paste a http(s) URL to download.');
      return;
    }
    setError('');
    const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const controller = new AbortController();
    aborters.current[id] = controller;
    setActive(prev => [...prev, { id, url: clean, name: targetName || name.trim() || clean.split('/').pop() || 'download', received: 0, total: 0 }]);
    try {
      await downloadToSite(clean, {
        name: targetName || name.trim() || undefined,
        signal: controller.signal,
        onProgress: update => setActive(prev => prev.map(job => (job.id === id ? { ...job, ...update } : job))),
      });
      setName('');
    } catch (err) {
      if (err.name !== 'AbortError') setError(`${err.message} — start the Python backend (start-backend.cmd) for blocked hosts.`);
    } finally {
      delete aborters.current[id];
      setActive(prev => prev.filter(job => job.id !== id));
    }
  };

  const submit = () => {
    const clean = url.trim();
    if (isGithubRepo(clean)) { importRepo(clean); return; }
    const parsed = parseHfUrl(clean);
    if (parsed) navigateHf(parsed.repoId, parsed.path);
    else start();
  };

  const importRepo = async target => {
    setError('');
    setRepoBusy(true);
    try {
      await importGithubRepo(target);
      setUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setRepoBusy(false);
    }
  };

  const navigateHf = async (repo, path) => {
    setHfNav({ repo, path, entries: null });
    try {
      const entries = await listHfDir(repo, path);
      setHfNav({ repo, path, entries });
    } catch (err) {
      setHfNav(null);
      setError(err.message);
    }
  };

  const showInFiles = async entryId => {
    try {
      await apiCall('apps.open', { id: 'files' });
      setTimeout(() => window.dispatchEvent(new CustomEvent('lithium:open-file', { detail: entryId })), 150);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#14161d] text-white">
      {/* URL bar */}
      <div className="space-y-2 border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-2">
          <Icon name="ArrowDownToLine" size={16} className="shrink-0 acc-text" />
          <span className="text-sm font-semibold">Downloader</span>
          <span className="text-[10px] text-white/35">files · webpages · models — saved into the site&apos;s Downloads folder</span>
          {windowed && <WinControls onClose={closeSelf} onMinimize={minimizeSelf} onMaximize={maximizeSelf} isMaximized={isMaximized} />}
        </div>
        <div className="flex gap-2">
          <input
            className="text-input flex-1 py-2 text-xs"
            placeholder="Paste any URL — or a Hugging Face repo link to browse its files"
            value={url}
            onChange={event => setUrl(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') submit(); }}
          />
          <input
            className="text-input w-44 py-2 text-xs"
            placeholder="name (optional)"
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <button className="btn-primary shrink-0 px-4 py-2 text-xs" onClick={submit} disabled={repoBusy}>
            {repoBusy ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Globe" size={13} />} {repoBusy ? 'Importing…' : 'Fetch'}
          </button>
        </div>
        {repoBusy && <p className="text-[11px] text-white/45">Downloading repo and extracting into Projects… (large repos take a moment)</p>}
        {error && <p className="text-[11px] text-red-300">{error}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 space-y-4" onContextMenu={event => { if (event.target.closest('[data-ctx]')) return; openMenu(event, [
        { id: 'paste', label: 'Paste URL', icon: 'Clipboard', action: () => navigator.clipboard?.readText().then(t => t && setUrl(t)) },
        { id: 'clear', label: 'Clear history', icon: 'Trash2', danger: true, disabled: history.length === 0, action: clearHistory },
      ]); }}>
        {/* HF repo browser */}
        {hfNav && (
          <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-white/55">
              <Icon name="Folder" size={12} className="shrink-0 text-amber-300" />
              <button className="font-mono text-cyan-300 hover:underline" onClick={() => navigateHf(hfNav.repo, '')}>{hfNav.repo}</button>
              {hfNav.path.split('/').filter(Boolean).map((segment, index, arr) => (
                <span key={index} className="flex items-center gap-1">
                  <span className="text-white/25">/</span>
                  <button className="font-mono text-cyan-300 hover:underline" onClick={() => navigateHf(hfNav.repo, arr.slice(0, index + 1).join('/'))}>{segment}</button>
                </span>
              ))}
              <button className="ml-auto rounded-md px-2 py-1 text-[11px] text-white/50 hover:bg-white/10" onClick={() => setHfNav(null)}>Close</button>
            </div>
            {hfNav.entries === null ? (
              <p className="flex items-center gap-2 text-[11px] text-white/40"><Icon name="Loader2" size={12} className="animate-spin" /> Loading folder…</p>
            ) : hfNav.entries.length === 0 ? (
              <p className="text-[11px] text-white/30">This folder is empty.</p>
            ) : hfNav.entries.map(entry => (entry.type === 'directory' ? (
              <button key={entry.path} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.06]" onClick={() => navigateHf(hfNav.repo, entry.path)} title="Open folder">
                <Icon name="Folder" size={12} className="shrink-0 text-amber-300" />
                <span className="truncate font-mono text-[11px] text-white/70">{entry.name}</span>
                <span className="ml-auto text-white/25">›</span>
              </button>
            ) : (
              <button
                key={entry.path}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${entry.name.toLowerCase().endsWith('.gguf') ? 'border-cyan-400/20 bg-cyan-400/[0.05] hover:border-cyan-400/40 hover:bg-cyan-400/[0.1]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06]'}`}
                onClick={() => start(hfResolveUrl(hfNav.repo, entry.path), entry.name)}
                title="Download this file into the site"
              >
                <Icon name="FileText" size={12} className={`shrink-0 ${entry.name.toLowerCase().endsWith('.gguf') ? 'acc-text' : 'text-white/40'}`} />
                <span className="truncate font-mono text-[11px] text-white/80">{entry.name}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px] tabular-nums text-white/40">
                  {entry.size ? `~${formatBytes(entry.size)}` : ''}
                  <Icon name="ArrowDownToLine" size={11} />
                </span>
              </button>
            )))}
          </div>
        )}

        {/* Active downloads */}
        {active.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-white/40">Downloading</div>
            {active.map(job => {
              const pct = job.total ? Math.min(100, (job.received / job.total) * 100) : 0;
              return (
                <div key={job.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2" data-ctx onContextMenu={event => openMenu(event, [
                  { id: 'name', type: 'heading', label: job.name },
                  { id: 'cancel', label: 'Cancel download', icon: 'X', action: () => aborters.current[job.id]?.abort() },
                  { id: 'copy-url', label: 'Copy URL', icon: 'Copy', action: () => navigator.clipboard?.writeText(job.url) },
                ])}>
                  <div className="flex items-center gap-2">
                    <Icon name="Loader2" size={12} className="shrink-0 animate-spin acc-text" />
                    <span className="truncate text-xs text-white/80">{job.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-white/40">
                      {formatBytes(job.received)}{job.total ? ` of ${formatBytes(job.total)}` : ''}
                    </span>
                    <button className="rounded p-1 text-white/45 hover:bg-red-500/15 hover:text-red-300" title="Cancel" onClick={() => aborters.current[job.id]?.abort()}>
                      <Icon name="X" size={12} />
                    </button>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full acc-bg transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* History */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon name="History" size={12} className="text-white/40" />
            <span className="text-[10px] uppercase tracking-widest text-white/40">History</span>
            <button className="ml-auto rounded-md px-2 py-1 text-[10px] text-white/40 hover:bg-white/10" onClick={clearHistory}>Clear finished</button>
          </div>
          {history.length === 0 && <p className="text-[11px] text-white/30">Nothing downloaded yet. Paste a URL above, or browse a Hugging Face repo.</p>}
          {history.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2" data-ctx onContextMenu={event => openMenu(event, [
              { id: 'name', type: 'heading', label: item.name || item.url },
              ...(item.status === 'done' ? [
                { id: 'show', label: 'Show in Files', icon: 'FolderOpen', action: () => item.entryId && showInFiles(item.entryId) },
                { id: 'redownload', label: 'Re-download', icon: 'RotateCw', action: () => start(item.url, item.name) },
              ] : []),
              { id: 'copy-url', label: 'Copy URL', icon: 'Copy', action: () => navigator.clipboard?.writeText(item.url) },
              { id: 'remove', label: 'Remove', icon: 'Trash2', danger: true, action: () => removeDownload(item.id) },
            ])}>
              <Icon name="FileText" size={12} className={`shrink-0 ${item.status === 'done' ? 'acc-text' : item.status === 'error' ? 'text-red-400' : 'text-white/30'}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-white/80">{item.name || item.url}</div>
                <div className="truncate text-[10px] text-white/35">
                  {new URL(item.url).hostname} · {item.size ? formatBytes(item.size) : ''} · {new Date(item.at).toLocaleTimeString()}
                  {item.status === 'error' && <span className="text-red-300"> · {item.error}</span>}
                  {item.status === 'cancelled' && <span className="text-amber-300"> · cancelled</span>}
                </div>
              </div>
              {item.status === 'done' && item.entryId && (
                <button className="rounded-md border border-white/[0.1] px-2 py-1 text-[10px] text-white/60 hover:bg-white/10" title="Open the Downloads folder at this file" onClick={() => showInFiles(item.entryId)}>
                  <Icon name="FolderOpen" size={11} /> Show in Files
                </button>
              )}
              <button className="rounded p-1 text-white/45 hover:bg-red-500/15 hover:text-red-300" title="Delete file + history entry" onClick={() => removeDownload(item.id)}>
                <Icon name="Trash2" size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </div>
  );
}

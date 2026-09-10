/**
 * StoragePanel — WizTree-style storage breakdown visualization.
 *
 * Tabs:
 *   1. Overview — tier bars + quick stats
 *   2. Breakdown — treemap + type/tier bars (WizTree-like)
 *   3. Top Files — sorted list of largest files
 *   4. App States — serialized/unloaded app state manager
 *   5. Actions — backup, restore, clear, factory reset
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PngIcon } from '../common/PngIcon.jsx';
import { CACHE_CAP, IDB_CAP, LOCAL_CAP, formatBytes, clearSiteCache } from '../../../storage/manager.js';
import { createBackupZip, downloadBlob as downloadZipBlob } from '../../../storage/zipArchive.js';
import { computeBreakdown, computeTreemap, TYPE_COLORS, getFolderBreakdown } from '../../../storage/storageBreakdown.js';
import { getAppStateMetrics, getSerializedAppsSize, loadApp, unloadApp, sweepIdleApps } from '../../../storage/appStateSerializer.js';

/* ── Reusable sub-components ─────────────────────────────────────────────── */

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

function Treemap({ items, width, height }) {
  const rects = useMemo(() => computeTreemap(items, { x: 0, y: 0, w: width, h: height }), [items, width, height]);
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/[0.06]" style={{ width, height }}>
      {rects.map(r => {
        const showLabel = r.w > 48 && r.h > 28;
        const showSize = r.w > 36 && r.h > 40;
        return (
          <div
            key={r.id || r.name}
            className="absolute flex flex-col items-start justify-start overflow-hidden border border-black/30 transition-opacity hover:opacity-80"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, backgroundColor: r.color }}
            title={`${r.name} — ${r.sizeLabel}`}
          >
            {showLabel && <span className="truncate px-1 pt-0.5 text-[9px] font-semibold leading-tight text-white drop-shadow">{r.label}</span>}
            {showSize && <span className="px-1 text-[8px] text-white/70">{r.sizeLabel}</span>}
          </div>
        );
      })}
    </div>
  );
}

function TabButton({ active, onClick, children, icon }) {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/[0.06] hover:text-white/70'}`}
      onClick={onClick}
    >
      <PngIcon name={icon} size={12} />
      {children}
    </button>
  );
}

/* ── Main panel ──────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'Layout' },
  { id: 'breakdown', label: 'Breakdown', icon: 'PieChart' },
  { id: 'topfiles', label: 'Top Files', icon: 'FileText' },
  { id: 'appstates', label: 'App States', icon: 'Cpu' },
  { id: 'actions', label: 'Actions', icon: 'Zap' },
];

export default function StoragePanel({ snapshot: initialSnapshot, onRefresh, onClose, tree, commit }) {
  const [activeTab, setActiveTab] = useState('overview');
  // Manage snapshot locally to avoid cascading re-renders through ExplorerShell
  const [localSnapshot, setLocalSnapshot] = useState(initialSnapshot || null);
  const refreshLocal = useCallback(async () => {
    const { storageSnapshot } = await import('../../../storage/manager.js');
    const { getSnapshotStats } = await import('../../../storage/index.js');
    setLocalSnapshot({ ...(await storageSnapshot()), fs: getSnapshotStats() });
  }, []);
  // Refresh on mount and every 4 seconds while visible
  useEffect(() => {
    refreshLocal();
    const id = setInterval(refreshLocal, 4000);
    return () => clearInterval(id);
  }, [refreshLocal]);
  const snapshot = localSnapshot;
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [appMetrics, setAppMetrics] = useState(null);
  const [serializedSize, setSerializedSize] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const treemapRef = useRef(null);
  const [treemapWidth, setTreemapWidth] = useState(380);

  // Compute breakdown when tab changes
  useEffect(() => {
    if (activeTab !== 'breakdown' || breakdown) return;
    setBreakdownLoading(true);
    computeBreakdown(tree).then(result => {
      setBreakdown(result);
      setBreakdownLoading(false);
    }).catch(() => {
      setBreakdownLoading(false);
    });
  }, [activeTab, breakdown, tree]);

  // Load app metrics when tab changes
  useEffect(() => {
    if (activeTab !== 'appstates') return;
    setAppMetrics(getAppStateMetrics());
    getSerializedAppsSize().then(setSerializedSize).catch(() => {
      // Ignore storage metric failures for the app-state panel.
    });
  }, [activeTab]);

  // Measure treemap container
  useEffect(() => {
    if (activeTab !== 'breakdown' || !treemapRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setTreemapWidth(Math.max(200, Math.floor(entry.contentRect.width)));
      }
    });
    observer.observe(treemapRef.current);
    return () => observer.disconnect();
  }, [activeTab]);

  const handleFullBackup = useCallback(async () => {
    setBackupBusy(true);
    try {
      const blob = await createBackupZip(tree);
      downloadZipBlob(blob, `lithium-full-backup-${Date.now()}.zip`);
    } catch {
      // Backup errors are surfaced to the user via the existing UI flow.
    }
    setBackupBusy(false);
  }, [tree]);

  const handleFullRestore = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!window.confirm('Restore from this ZIP backup? Current data will be replaced.')) return;
      setRestoreBusy(true);
      try {
        const { restoreBackupZip } = await import('../../../storage/zipArchive.js');
        const result = await restoreBackupZip(file, { replace: true });
        commit(result.tree);
        refreshLocal();
      } catch {
        // Restore failures are surfaced to the user in the file dialog flow.
      }
      setRestoreBusy(false);
    };
    input.click();
  }, [commit, refreshLocal]);

  const handleSweep = useCallback(async () => {
    setSweeping(true);
    try {
      await sweepIdleApps();
      setAppMetrics(getAppStateMetrics());
      getSerializedAppsSize().then(setSerializedSize).catch(() => {
        // Ignore sweep metric failures after the cleanup itself succeeds.
      });
    } catch {
      // App-state sweeps are best-effort and should not block the UI.
    }
    setSweeping(false);
  }, []);

  const handleLoadApp = useCallback(async (appId) => {
    await loadApp(appId);
    setAppMetrics(getAppStateMetrics());
    getSerializedAppsSize().then(setSerializedSize).catch(() => {});
  }, []);

  const handleUnloadApp = useCallback(async (appId) => {
    await unloadApp(appId);
    setAppMetrics(getAppStateMetrics());
    getSerializedAppsSize().then(setSerializedSize).catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1c1c22] shadow-2xl" onClick={event => event.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <PngIcon name="Database" size={16} className="text-cyan-300" /> Storage manager
          </h3>
          <div className="flex items-center gap-1">
            <button className="icon-btn h-7 w-7" onClick={onRefresh} title="Refresh" aria-label="Refresh"><PngIcon name="RefreshCw" size={13} /></button>
            <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Close"><PngIcon name="X" size={14} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-white/[0.06] px-3 py-2">
          {TABS.map(tab => (
            <TabButton key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} icon={tab.icon}>{tab.label}</TabButton>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!snapshot ? (
            <div className="flex items-center justify-center gap-2 py-8 text-white/40"><PngIcon name="Loader2" size={16} className="animate-spin" /> Measuring…</div>
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab snapshot={snapshot} />}
              {activeTab === 'breakdown' && (
                <BreakdownTab
                  breakdown={breakdown} loading={breakdownLoading}
                  treemapRef={treemapRef} treemapWidth={treemapWidth}
                />
              )}
              {activeTab === 'topfiles' && <TopFilesTab breakdown={breakdown} loading={breakdownLoading} tree={tree} />}
              {activeTab === 'appstates' && (
                <AppStatesTab
                  metrics={appMetrics} serializedSize={serializedSize}
                  sweeping={sweeping} onSweep={handleSweep}
                  onLoad={handleLoadApp} onUnload={handleUnloadApp}
                />
              )}
              {activeTab === 'actions' && (
                <ActionsTab
                  backupBusy={backupBusy} restoreBusy={restoreBusy}
                  onBackup={handleFullBackup} onRestore={handleFullRestore}
                  onRefresh={onRefresh} snapshot={snapshot}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Overview Tab ────────────────────────────────────────────────────────── */

function OverviewTab({ snapshot }) {
  return (
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
            <PngIcon name="Database" size={13} className="text-cyan-300" /> Rust core snapshot
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
      {snapshot.cold && snapshot.cold.archives > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs">
          <div className="mb-1 flex items-center gap-2 font-medium text-white/85">
            <PngIcon name="Snowflake" size={13} className="text-blue-300" /> Cold storage
          </div>
          <div className="flex justify-between text-white/60"><span>Archives</span><span className="text-white/85">{snapshot.cold.archives}</span></div>
          <div className="flex justify-between text-white/60"><span>Compressed</span><span className="text-white/85">{formatBytes(snapshot.cold.compressedBytes)}</span></div>
        </div>
      )}
    </div>
  );
}

/* ── Breakdown Tab (WizTree-style) ───────────────────────────────────────── */

function BreakdownTab({ breakdown, loading, treemapRef, treemapWidth }) {
  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-8 text-white/40"><PngIcon name="Loader2" size={16} className="animate-spin" /> Analyzing storage…</div>;
  }
  if (!breakdown) return <p className="py-4 text-xs text-white/40">No data available.</p>;

  const typeItems = breakdown.typeBreakdown.map(t => ({
    id: t.type,
    name: t.type.charAt(0).toUpperCase() + t.type.slice(1),
    size: t.bytes,
    color: t.color,
  }));

  const tierItems = breakdown.tierBreakdown.map(t => ({
    id: t.tier,
    name: t.tier,
    size: t.bytes,
    color: t.tier === 'inline' ? '#60a5fa' : t.tier === 'indexedDB' ? '#a78bfa' : t.tier === 'cold' ? '#38bdf8' : t.tier === 'opfs' ? '#f59e0b' : '#94a3b8',
  }));

  const topFolderItems = breakdown.topFolders.slice(0, 12).map(f => ({
    id: f.id,
    name: f.name,
    size: f.totalSize,
    color: '#22d3ee',
  }));

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
          <div className="text-lg font-bold text-white">{formatBytes(breakdown.totalSize)}</div>
          <div className="text-[10px] text-white/40">Total files</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
          <div className="text-lg font-bold text-white">{breakdown.totalFiles}</div>
          <div className="text-[10px] text-white/40">Files</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
          <div className="text-lg font-bold text-white">{breakdown.totalFolders}</div>
          <div className="text-[10px] text-white/40">Folders</div>
        </div>
      </div>

      {/* Treemap: file types */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-white/85">
          <PngIcon name="PieChart" size={13} className="text-cyan-300" /> By file type
        </div>
        <div ref={treemapRef}>
          <Treemap items={typeItems} width={treemapWidth} height={120} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {breakdown.typeBreakdown.map(t => (
            <div key={t.type} className="flex items-center gap-1 text-[10px] text-white/60">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: t.color }} />
              {t.type} · {formatBytes(t.bytes)} ({t.pct.toFixed(1)}%)
            </div>
          ))}
        </div>
      </div>

      {/* Treemap: top folders */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-white/85">
          <PngIcon name="Folder" size={13} className="text-amber-300" /> Top folders
        </div>
        <Treemap items={topFolderItems} width={treemapWidth} height={100} />
      </div>

      {/* Storage tier breakdown */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-white/85">
          <PngIcon name="Server" size={13} className="text-purple-300" /> By storage tier
        </div>
        <div className="space-y-1.5">
          {breakdown.tierBreakdown.map(t => (
            <div key={t.tier} className="flex items-center gap-2">
              <span className="w-16 text-[11px] text-white/60">{t.tier}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: `${Math.max(t.pct, 0.5)}%`, background: t.tier === 'inline' ? '#60a5fa' : t.tier === 'indexedDB' ? '#a78bfa' : t.tier === 'cold' ? '#38bdf8' : t.tier === 'opfs' ? '#f59e0b' : '#94a3b8', transition: 'width 0.5s' }} />
              </div>
              <span className="w-20 text-right font-mono text-[10px] text-white/45">{formatBytes(t.bytes)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top folders list */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-white/85">
          <PngIcon name="List" size={13} className="text-cyan-300" /> Largest folders
        </div>
        <div className="space-y-1">
          {breakdown.topFolders.slice(0, 10).map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-white/[0.04]">
              <PngIcon name="Folder" size={12} color="#38bdf8" />
              <span className="flex-1 truncate text-white/70" style={{ paddingLeft: f.depth * 8 }}>{f.name}</span>
              <span className="text-white/35">{f.fileCount} files</span>
              <span className="w-16 text-right font-mono text-white/45">{formatBytes(f.totalSize)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Top Files Tab ───────────────────────────────────────────────────────── */

function TopFilesTab({ breakdown, loading, tree }) {
  if (loading || !breakdown) {
    return <div className="flex items-center justify-center gap-2 py-8 text-white/40"><PngIcon name="Loader2" size={16} className="animate-spin" /> Loading…</div>;
  }

  const maxBar = breakdown.topFiles[0]?.size || 1;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-white/45">{breakdown.topFiles.length} largest files shown</div>
      <div className="space-y-0.5">
        {breakdown.topFiles.map((file, idx) => {
          const barPct = maxBar > 0 ? (file.size / maxBar) * 100 : 0;
          const color = TYPE_COLORS[file.type] || TYPE_COLORS.other;
          return (
            <div key={file.id} className="group flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-white/[0.04]">
              <span className="w-5 text-right text-white/25">{idx + 1}</span>
              <PngIcon name={file.type === 'image' ? 'Image' : file.type === 'video' ? 'Film' : file.type === 'model' ? 'BrainCircuit' : 'FileText'} size={12} color={color} />
              <span className="min-w-0 flex-1 truncate text-white/70">{file.name}</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: `${Math.max(barPct, 1)}%`, backgroundColor: color, transition: 'width 0.3s' }} />
              </div>
              <span className="w-16 text-right font-mono text-[10px] text-white/45">{formatBytes(file.size)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── App States Tab ──────────────────────────────────────────────────────── */

function AppStatesTab({ metrics, serializedSize, sweeping, onSweep, onLoad, onUnload }) {
  if (!metrics) {
    return <p className="py-4 text-xs text-white/40">No apps registered.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
          <div className="text-lg font-bold text-white">{metrics.loaded}</div>
          <div className="text-[10px] text-white/40">In memory</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
          <div className="text-lg font-bold text-white">{metrics.unloaded}</div>
          <div className="text-[10px] text-white/40">Serialized</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
          <div className="text-lg font-bold text-white">{formatBytes(metrics.totalLoadedSize)}</div>
          <div className="text-[10px] text-white/40">Memory used</div>
        </div>
      </div>

      {serializedSize && serializedSize.count > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 text-xs text-white/60">
          <div className="flex justify-between"><span>Serialized state size</span><span className="text-white/85">{formatBytes(serializedSize.totalBytes)}</span></div>
          <div className="flex justify-between"><span>Serialized apps</span><span className="text-white/85">{serializedSize.count}</span></div>
        </div>
      )}

      {/* Sweep button */}
      <button className="btn-ghost flex w-full items-center justify-center gap-2 px-3 py-2 text-xs" onClick={onSweep} disabled={sweeping}>
        {sweeping ? <PngIcon name="Loader2" size={12} className="animate-spin" /> : <PngIcon name="ArrowDownToLine" size={12} />}
        {sweeping ? 'Sweeping idle apps…' : 'Sweep idle apps (unload inactive)'}
      </button>

      {/* App list */}
      <div className="space-y-1">
        {metrics.apps.map(app => (
          <div key={app.appId} className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-white/[0.04]">
            <span className={`h-2 w-2 rounded-full ${app.loaded ? 'bg-green-400' : 'bg-white/20'}`} />
            <span className="flex-1 truncate text-white/70">{app.appId}</span>
            <span className="text-[10px] text-white/35">
              {app.loaded ? formatBytes(app.estimatedSize) : 'unloaded'}
            </span>
            <span className="text-[10px] text-white/25">
              {app.idleMs > 60000 ? `${Math.round(app.idleMs / 60000)}m idle` : 'active'}
            </span>
            {app.loaded && !app.pinned && (
              <button className="rounded px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70" onClick={() => onUnload(app.appId)} title="Unload">
                <PngIcon name="HardDrive" size={10} />
              </button>
            )}
            {!app.loaded && (
              <button className="rounded px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70" onClick={() => onLoad(app.appId)} title="Load">
                <PngIcon name="HardDrive" size={10} />
              </button>
            )}
            {app.pinned && <PngIcon name="Pin" size={10} className="text-cyan-300" />}
          </div>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-white/30">
        Apps inactive for 5+ minutes are auto-unloaded to save memory. State is serialized to IndexedDB and restored on demand.
      </p>
    </div>
  );
}

/* ── Actions Tab ─────────────────────────────────────────────────────────── */

function ActionsTab({ backupBusy, restoreBusy, onBackup, onRestore, onRefresh, snapshot }) {
  return (
    <div className="space-y-4">
      {/* ZIP backup */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
          <PngIcon name="PackageOpen" size={13} className="text-amber-300" /> ZIP backup
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 px-3 py-1.5 text-xs" onClick={onBackup} disabled={backupBusy}>
            {backupBusy ? <PngIcon name="Loader2" size={12} className="animate-spin" /> : <PngIcon name="Download" size={12} />} Export full ZIP
          </button>
          <button className="btn-ghost flex-1 px-3 py-1.5 text-xs" onClick={onRestore} disabled={restoreBusy}>
            {restoreBusy ? <PngIcon name="Loader2" size={12} className="animate-spin" /> : <PngIcon name="Upload" size={12} />} Restore from ZIP
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/30">
          Full ZIP includes all files, photos, notes, settings, and IndexedDB blobs.
        </p>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
          <PngIcon name="Zap" size={13} className="text-amber-300" /> Quick actions
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost flex items-center gap-1.5 px-2.5 py-2 text-left text-xs" onClick={() => { localStorage.clear(); onRefresh(); }}>
            <PngIcon name="Trash2" size={12} className="text-red-400" /> Clear local storage
          </button>
          <button className="btn-ghost flex items-center gap-1.5 px-2.5 py-2 text-left text-xs" onClick={async () => { await clearSiteCache(); onRefresh(); }}>
            <PngIcon name="Archive" size={12} className="text-amber-400" /> Clear cache
          </button>
          <button className="btn-ghost flex items-center gap-1.5 px-2.5 py-2 text-left text-xs" onClick={() => window.dispatchEvent(new CustomEvent('lithium:open-settings', { detail: 'data' }))}>
            <PngIcon name="Download" size={12} className="text-cyan-400" /> Export / Backup
          </button>
          <button className="btn-ghost flex items-center gap-1.5 px-2.5 py-2 text-left text-xs" onClick={() => { if (window.confirm('Delete ALL Lithium data? This cannot be undone.')) { Object.keys(localStorage).filter(k => k.startsWith('lithium:')).forEach(k => localStorage.removeItem(k)); window.location.reload(); } }}>
            <PngIcon name="AlertTriangle" size={12} className="text-red-400" /> Factory reset
          </button>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-white/35">
        The whole site is cached for offline mode — games are never saved. Heavy chats,
        memories and audit logs overflow into IndexedDB automatically, keeping localStorage tiny.
      </p>
    </div>
  );
}

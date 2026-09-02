/**
 * Storage manager panel — extracted from the monolith's StoragePanel.
 */
import { useState } from 'react';
import Icon from '../../../../Components/Icon';
import { CACHE_CAP, IDB_CAP, LOCAL_CAP, formatBytes, clearSiteCache } from '../../../storage/manager.js';
import { createBackupZip, downloadBlob as downloadZipBlob } from '../../../storage/zipArchive.js';

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

export default function StoragePanel({ snapshot, onRefresh, onClose, tree, commit }) {
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const handleFullBackup = async () => {
    setBackupBusy(true);
    try {
      const blob = await createBackupZip(tree);
      downloadZipBlob(blob, `lithium-full-backup-${Date.now()}.zip`);
    } catch { /* error handled by caller */ }
    setBackupBusy(false);
  };

  const handleFullRestore = () => {
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
        onRefresh();
      } catch { /* error */ }
      setRestoreBusy(false);
    };
    input.click();
  };

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

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-white/85">
                <Icon name="PackageOpen" size={13} className="text-amber-300" /> ZIP backup
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1 px-3 py-1.5 text-xs" onClick={handleFullBackup} disabled={backupBusy}>
                  {backupBusy ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Download" size={12} />} Export full ZIP
                </button>
                <button className="btn-ghost flex-1 px-3 py-1.5 text-xs" onClick={handleFullRestore} disabled={restoreBusy}>
                  {restoreBusy ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Upload" size={12} />} Restore from ZIP
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-white/30">
                Full ZIP includes all files, photos, notes, settings, and IndexedDB blobs.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-relaxed text-white/35">
                The whole site is cached for offline mode — games are never saved. Heavy chats,
                memories and audit logs overflow into IndexedDB automatically, keeping localStorage tiny.
              </p>
              <button className="btn-ghost shrink-0 px-3 py-1.5 text-xs" onClick={async () => { await clearSiteCache(); onRefresh(); }} disabled={!snapshot.cachedAssets}>
                <Icon name="Trash2" size={12} /> Clear cache
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import Icon from '../../../Components/Icon';
import { CardGroup, SettingsRow, EnhancedToggle } from '../controls';
import { isSupported, pickDirectory } from '../../../lib/fs/localFileSystem';
import {
  getSyncState,
  onSyncStateChange,
  bindDirectory,
  unbindDirectory,
  setAutoSync,
  syncToDisk,
  syncFromDisk,
} from '../../../lib/fs/localSyncBridge';

export default function FileSystemSection() {
  const [state, setState] = useState(getSyncState);
  const [busy, setBusy] = useState('');
  const supported = isSupported();

  useEffect(() => {
    const unsub = onSyncStateChange(setState);
    return unsub;
  }, []);

  const handlePick = useCallback(async () => {
    try {
      const handle = await pickDirectory();
      if (handle) await bindDirectory(handle);
    } catch {
      // User cancelled or permission denied.
    }
  }, []);

  const handleUnbind = useCallback(async () => {
    await unbindDirectory();
  }, []);

  const handleSyncTo = useCallback(async () => {
    setBusy('export');
    try { await syncToDisk(); } catch { /* handled by state */ }
    setBusy('');
  }, []);

  const handleSyncFrom = useCallback(async () => {
    if (!window.confirm('Import data from the sync folder? This will overwrite current settings.')) return;
    setBusy('import');
    try { await syncFromDisk(); } catch { /* handled by state */ }
    setBusy('');
    window.location.reload();
  }, []);

  const handleAutoSync = useCallback((on) => {
    setAutoSync(on);
  }, []);

  // Browser doesn't support File System Access API.
  if (!supported) {
    return (
      <div>
        <CardGroup label="Local File System">
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3">
              <Icon name="AlertTriangle" className="h-5 w-5 shrink-0 text-yellow-400" />
              <div>
                <p className="text-sm font-medium text-yellow-200">Browser not supported</p>
                <p className="mt-0.5 text-xs text-yellow-200/60">
                  The File System Access API is only available in Chromium-based browsers (Chrome, Edge, Opera). Switch to a supported browser to use local file sync.
                </p>
              </div>
            </div>
          </div>
        </CardGroup>
      </div>
    );
  }

  return (
    <div>
      {/* Directory binding */}
      <CardGroup label="Sync Folder">
        {state.bound ? (
          <>
            <SettingsRow
              title="Connected folder"
              description={state.dirName || 'Unknown'}
            >
              <div className="flex items-center gap-2">
                {state.permissionGranted ? (
                  <span className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300">
                    <Icon name="Check" className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-300">
                    <Icon name="AlertCircle" className="h-3 w-3" /> Permission lost
                  </span>
                )}
              </div>
            </SettingsRow>

            {!state.permissionGranted && (
              <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <Icon name="AlertTriangle" className="h-3.5 w-3.5 shrink-0" />
                Permission was lost (browser restart?). Re-choose the folder to restore access.
              </div>
            )}

            <div className="flex gap-2 px-4 pb-3">
              <button className="btn-ghost flex-1 text-xs" onClick={handlePick}>
                <Icon name="FolderSearch" className="h-3.5 w-3.5" /> Change Folder
              </button>
              <button
                className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
                onClick={handleUnbind}
              >
                <Icon name="Unlink" className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>
          </>
        ) : (
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <p className="text-[13px] text-white/50">
              Choose a local folder to sync your Lithium data. Your settings and files will be exported as JSON for backup or cross-device transfer.
            </p>
            <button className="btn-primary text-xs" onClick={handlePick}>
              <Icon name="FolderPlus" className="h-3.5 w-3.5" /> Choose Folder
            </button>
          </div>
        )}
      </CardGroup>

      {/* Sync controls — only when bound and permitted */}
      {state.bound && state.permissionGranted && (
        <CardGroup label="Sync">
          <SettingsRow
            title="Auto-sync"
            description="Automatically export data when settings change"
          >
            <EnhancedToggle value={state.autoSync} onChange={handleAutoSync} />
          </SettingsRow>

          <div className="flex gap-2 px-4 pb-3">
            <button
              className="btn-ghost flex-1 text-xs"
              onClick={handleSyncTo}
              disabled={busy !== ''}
            >
              {busy === 'export'
                ? <Icon name="Loader2" className="h-3.5 w-3.5 animate-spin" />
                : <Icon name="Upload" className="h-3.5 w-3.5" />}
              Export Now
            </button>
            <button
              className="btn-primary flex-1 text-xs"
              onClick={handleSyncFrom}
              disabled={busy !== ''}
            >
              {busy === 'import'
                ? <Icon name="Loader2" className="h-3.5 w-3.5 animate-spin" />
                : <Icon name="Download" className="h-3.5 w-3.5" />}
              Import Now
            </button>
          </div>

          {state.lastSync > 0 && (
            <div className="px-4 pb-3 text-[11px] text-white/30">
              Last sync: {new Date(state.lastSync).toLocaleString()}
            </div>
          )}
        </CardGroup>
      )}

      {/* Info card */}
      <CardGroup label="About Local Sync">
        <div className="px-4 pb-3 text-[12px] leading-relaxed text-white/40">
          <p>
            Local sync exports your Lithium settings and data to a <code className="rounded bg-white/5 px-1 py-0.5 text-white/50">lithium-sync/</code> subfolder inside the directory you choose. Data is stored as plain JSON files you can inspect, version, or transfer.
          </p>
          <p className="mt-2">
            This uses the browser&apos;s File System Access API — no server involved. Your data stays on your machine. Permissions are revoked when you close the browser, so you&apos;ll need to re-authorize the folder after a restart.
          </p>
        </div>
      </CardGroup>
    </div>
  );
}

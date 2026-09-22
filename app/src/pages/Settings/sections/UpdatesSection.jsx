import { useState, useEffect, useCallback } from 'react';
import Icon from '../../../Components/Icon';
import { CardGroup } from '../controls';
import { BUILD_VERSION } from '../../../lib/settings';
import {
  getState,
  subscribe,
  fetchManifest,
  installVersion,
  activateVersion,
  deleteVersion,
  factoryReset,
  refreshInstalledVersions,
} from '../../../lib/pwa/versionManager';

export default function UpdatesSection() {
  const [state, setState] = useState(getState);
  const [busy, setBusy] = useState(''); // eslint-disable-line no-unused-vars
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const unsub = subscribe(setState);
    return unsub;
  }, []);

  const { manifest, activeVersion, installedVersions, installProgress } = state;
  const versions = manifest?.versions || [];
  const stableVersion = manifest?.stable || null;
  const hasUpdate = stableVersion && stableVersion !== activeVersion && stableVersion !== BUILD_VERSION;

  const handleInstall = useCallback(async (version) => {
    setBusy(version);
    await installVersion(version);
    // Don't clear busy — progress messages will update state.
    // busy is cleared when cache-complete fires and installProgress clears.
  }, []);

  const handleActivate = useCallback((version) => {
    activateVersion(version);
    // Page will reload, so no need to clear busy.
  }, []);

  const handleDelete = useCallback((version) => {
    deleteVersion(version);
  }, []);

  const handleFactoryReset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    factoryReset();
  }, [confirmReset]);

  const handleRefresh = useCallback(() => {
    fetchManifest();
    refreshInstalledVersions();
  }, []);

  // Determine button state for each version.
  function getVersionAction(version) {
    const ver = version.version;
    const isActive = ver === activeVersion || (!activeVersion && ver === BUILD_VERSION);
    const isInstalled = installedVersions.includes(ver);
    const isDownloading = !!installProgress[ver];
    const progress = installProgress[ver];

    if (isActive) return { label: 'Active', disabled: true, variant: 'active' };
    if (isDownloading && progress) {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      return { label: `${pct}%`, disabled: true, variant: 'downloading', progress: pct };
    }
    if (isInstalled) return { label: 'Open', disabled: false, variant: 'open' };
    return { label: 'Install', disabled: false, variant: 'install' };
  }

  return (
    <div>
      {/* Current Version */}
      <CardGroup label="Current Version">
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>
              <Icon name="Cpu" className="h-5 w-5" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {activeVersion || BUILD_VERSION}
                {!activeVersion && <span className="ml-2 text-[10px] font-normal text-white/30">default</span>}
              </div>
              <div className="text-[11px] text-white/40">
                {hasUpdate
                  ? `Update available: ${stableVersion}`
                  : activeVersion
                    ? 'Running a pinned version'
                    : 'Up to date'}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {hasUpdate && (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }}>
                  <Icon name="ArrowUpRight" className="h-3 w-3" /> Update
                </span>
              )}
              <button
                className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                onClick={handleRefresh}
              >
                <Icon name="RefreshCw" className="h-3 w-3" /> Check
              </button>
            </div>
          </div>
        </div>
      </CardGroup>

      {/* Available Versions */}
      <CardGroup label="Available Versions">
        {versions.length === 0 && (
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="text-[13px] text-white/40">
                No versions available. Check your connection and try again.
              </div>
            </div>
          </div>
        )}
        {versions.map(v => {
          const action = getVersionAction(v);
          const isStable = v.version === stableVersion;
          return (
            <div key={v.version} className="settings-row" style={{ alignItems: 'center' }}>
              <div className="settings-row-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-white/80">{v.version}</span>
                  {isStable && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">STABLE</span>
                  )}
                  {installedVersions.includes(v.version) && !action.variant.includes('active') && (
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/40">cached</span>
                  )}
                </div>
                <div className="text-[11px] text-white/35">{v.date}</div>
                {v.changelog && (
                  <div className="mt-1 text-[11px] leading-relaxed text-white/45 line-clamp-2">{v.changelog}</div>
                )}
                {/* Download progress bar */}
                {action.variant === 'downloading' && action.progress !== undefined && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${action.progress}%`, background: 'var(--accent)' }}
                    />
                  </div>
                )}
              </div>
              <button
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  action.variant === 'active'
                    ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
                    : action.variant === 'downloading'
                      ? 'cursor-wait text-white/40'
                      : action.variant === 'open'
                        ? 'border border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80'
                        : 'text-white/80 hover:text-white'
                }`}
                style={action.variant === 'install' ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' } : {}}
                disabled={action.disabled}
                onClick={() => {
                  if (action.variant === 'install') handleInstall(v.version);
                  else if (action.variant === 'open') handleActivate(v.version);
                }}
              >
                {action.variant === 'install' && <Icon name="Download" className="h-3 w-3" />}
                {action.variant === 'open' && <Icon name="Play" className="h-3 w-3" />}
                {action.variant === 'active' && <Icon name="Check" className="h-3 w-3" />}
                {action.label}
              </button>
              {/* Delete button for cached, non-active versions */}
              {installedVersions.includes(v.version) && action.variant !== 'active' && (
                <button
                  className="ml-1 rounded-lg p-1.5 text-white/25 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Delete cached version"
                  onClick={() => handleDelete(v.version)}
                >
                  <Icon name="Trash2" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </CardGroup>

      {/* Storage */}
      {installedVersions.length > 0 && (
        <CardGroup label="Cached Versions">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="text-[13px] text-white/60">
                {installedVersions.length} version{installedVersions.length !== 1 ? 's' : ''} cached locally
              </div>
              <div className="text-[11px] text-white/35">
                Each version uses disk space for offline access. Delete versions you don&apos;t need.
              </div>
            </div>
          </div>
        </CardGroup>
      )}

      {/* Factory Reset */}
      <CardGroup label="Factory Reset">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="text-[13px] text-white/60">Reset to the default build</div>
            <div className="text-[11px] text-white/35">
              Clears all cached versions and switches back to the default build. Your data (files, settings, notes) is not affected.
            </div>
          </div>
          <button
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
              confirmReset
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'border border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-red-500/10 hover:text-red-400'
            }`}
            onClick={handleFactoryReset}
          >
            <Icon name="RotateCcw" className="h-3 w-3" />
            {confirmReset ? 'Confirm Reset' : 'Reset to Default'}
          </button>
        </div>
      </CardGroup>

      <p className="text-[11px] text-white/25 text-center mt-4">
        Version management is part of Lithium&apos;s PWA capabilities.
      </p>
    </div>
  );
}
